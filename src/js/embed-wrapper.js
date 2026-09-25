/*
 * <citcat-player> web component.
 *
 * This file contains NO engine logic. It is concatenated after src/js/runtime.js
 * by scripts/build-site.sh to produce docs/embed.js, and drives the engine purely
 * through its public API (setProject / renderStandalone / initEvents / play / …).
 *
 * The build wraps runtime.js in:
 *
 *     function __citcatCreateEngine(window) { …runtime.js… return CitCatRuntime; }
 *
 * The `window` parameter shadows the real global inside that function, so the
 * guarded block at the end of runtime.js — which swaps CitCatRuntime for a
 * standalone constructor when window.__TAURI__ is absent — is skipped and we get
 * the module object back. Because runtime.js is one IIFE assigned to a var, each
 * call to the factory produces a fresh closure: every player owns its own engine
 * state, so several <citcat-player> elements can coexist on one page.
 */
(function () {
  if (typeof customElements === "undefined") return;
  if (customElements.get("citcat-player")) return;

  var CSS = [
    ":host { display: block; position: relative; overflow: hidden; }",
    "canvas { display: block; width: 100%; height: 100%; }",
    ".controls {",
    "  position: absolute; left: 0; right: 0; bottom: 0;",
    "  display: flex; align-items: center; gap: 10px;",
    "  padding: 8px 12px; background: rgba(0,0,0,0.55);",
    "  opacity: 0; transition: opacity 0.18s ease;",
    "  font-family: system-ui, -apple-system, sans-serif;",
    "}",
    ":host(:hover) .controls, .controls:focus-within { opacity: 1; }",
    ".ctrl-btn { background: none; border: none; color: #fff; cursor: pointer; padding: 4px; line-height: 1; }",
    ".ctrl-btn:hover { color: #a78bfa; }",
    ".ctrl-btn:focus-visible { outline: 2px solid #a78bfa; outline-offset: 2px; }",
    ".scene-info { flex: 1; text-align: center; font-size: 12px; color: rgba(255,255,255,0.7); }",
    ".watermark { font-size: 10px; color: rgba(255,255,255,0.4); text-decoration: none; }",
    ".watermark:hover { color: rgba(255,255,255,0.7); }"
  ].join("\n");

  var PLAY_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6z"/></svg>';
  var PAUSE_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12"/><rect x="9.5" y="2" width="3.5" height="12"/></svg>';
  var STOP_SVG = '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="2" width="10" height="10" rx="1"/></svg>';

  class CitCatPlayer extends HTMLElement {
    constructor() {
      super();
      // One engine per element. See the header note on __citcatCreateEngine.
      this._engine = __citcatCreateEngine({ __TAURI__: { __citcatEmbed: true } });
      this._shadow = this.attachShadow({ mode: "open" });
      this._canvas = null;
      this._ro = null;
      this._project = null;
      this._sceneInfo = null;
      this._playBtn = null;
    }

    connectedCallback() {
      var self = this;

      var style = document.createElement("style");
      style.textContent = CSS;
      this._shadow.appendChild(style);

      this._canvas = document.createElement("canvas");
      this._shadow.appendChild(this._canvas);

      this._applyDeclaredSize();

      if (this.hasAttribute("controls")) this._buildControls();

      this._ro = new ResizeObserver(function () {
        if (!self._project) return;
        self._sizeCanvas();
        self._repaint();
      });
      this._ro.observe(this);

      this._loadProject().then(function (proj) {
        if (!proj || !self.isConnected) return;
        self._project = proj;

        if (self.hasAttribute("loop")) {
          proj.export_settings = proj.export_settings || {};
          proj.export_settings.loop_playback = true;
        }
        if (self.hasAttribute("muted")) self._muteAudio(proj);

        var E = self._engine;
        self._canvas.width = proj.meta.width;
        self._canvas.height = proj.meta.height;
        self._sizeCanvas();

        E.setProject(proj);
        // renderStandalone installs the painting callbacks, so it must run
        // before ours — we chain onto what it installs rather than replacing it.
        E.renderStandalone(self._canvas, null);
        E.initEvents(self._canvas, true);

        var paintTime = E.state.onTimeUpdate;
        var paintScene = E.state.onSceneChange;
        var paintPlay = E.state.onPlayStateChange;

        E.state.onTimeUpdate = function (si, ms) {
          if (paintTime) paintTime(si, ms);
          self._updateInfo();
        };
        E.state.onSceneChange = function (i) {
          if (paintScene) paintScene(i);
          self._updateInfo();
        };
        E.state.onPlayStateChange = function (playing) {
          if (paintPlay) paintPlay(playing);
          if (self._playBtn) self._playBtn.innerHTML = playing ? PAUSE_SVG : PLAY_SVG;
          self._updateInfo();
        };

        self._updateInfo();
        self.dispatchEvent(new CustomEvent("citcat-load", { detail: { project: proj } }));

        if (self.hasAttribute("autoplay")) E.play();
      });
    }

    disconnectedCallback() {
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
      this._engine.stop();
      this._engine.cleanupEvents();
    }

    // ---- setup helpers ----

    _buildControls() {
      var self = this;
      var bar = document.createElement("div");
      bar.className = "controls";

      var playBtn = document.createElement("button");
      playBtn.className = "ctrl-btn";
      playBtn.innerHTML = PLAY_SVG;
      playBtn.title = "Play / Pause";
      playBtn.setAttribute("aria-label", "Play or pause");

      var stopBtn = document.createElement("button");
      stopBtn.className = "ctrl-btn";
      stopBtn.innerHTML = STOP_SVG;
      stopBtn.title = "Stop";
      stopBtn.setAttribute("aria-label", "Stop");

      var info = document.createElement("span");
      info.className = "scene-info";
      info.textContent = "Loading…";

      var wm = document.createElement("a");
      wm.className = "watermark";
      wm.textContent = "CitCat";
      wm.href = "https://citcat.mirjam-block.eu";
      wm.target = "_blank";
      wm.rel = "noopener";

      bar.appendChild(playBtn);
      bar.appendChild(stopBtn);
      bar.appendChild(info);
      bar.appendChild(wm);
      this._shadow.appendChild(bar);

      this._sceneInfo = info;
      this._playBtn = playBtn;

      playBtn.addEventListener("click", function () {
        if (self._engine.state.isPlaying) self._engine.pause();
        else self._engine.play();
      });
      stopBtn.addEventListener("click", function () { self._engine.stop(); });
    }

    _loadProject() {
      var inline = this.querySelector('script[type="application/json"]');
      if (inline) {
        try {
          return Promise.resolve(JSON.parse(inline.textContent));
        } catch (e) {
          this._fail("inline project JSON is not valid: " + e.message);
          return Promise.resolve(null);
        }
      }
      var src = this.getAttribute("src");
      if (!src) {
        this._fail("no project: set a src attribute or add an inline JSON script");
        return Promise.resolve(null);
      }
      var self = this;
      return fetch(src)
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .catch(function (e) {
          self._fail("could not load " + src + ": " + e.message);
          return null;
        });
    }

    _fail(message) {
      if (this._sceneInfo) this._sceneInfo.textContent = message;
      this.dispatchEvent(new CustomEvent("citcat-error", { detail: { message: message } }));
    }

    _muteAudio(proj) {
      for (var s = 0; s < proj.scenes.length; s++) {
        var objs = proj.scenes[s].objects;
        for (var i = 0; i < objs.length; i++) {
          if (objs[i].object_type === "Audio") objs[i].audio_volume = 0;
        }
      }
    }

    // ---- sizing ----

    _applyDeclaredSize() {
      var w = parseInt(this.getAttribute("width"), 10) || 0;
      var h = parseInt(this.getAttribute("height"), 10) || 0;
      if (w) this.style.width = w + "px";
      else this.style.width = "100%";
      if (h) this.style.height = h + "px";
    }

    _sizeCanvas() {
      if (!this._project) return;
      var ratio = this._project.meta.width / this._project.meta.height;
      var w = parseInt(this.getAttribute("width"), 10) || 0;
      var h = parseInt(this.getAttribute("height"), 10) || 0;
      if (w && h) return;              // both pinned: honour them
      if (!w) w = this.clientWidth || 960;
      this.style.height = Math.round(w / ratio) + "px";
    }

    _repaint() {
      // Re-emitting the current time makes the engine repaint through the same
      // path playback uses, so there is only one drawing code path.
      var st = this._engine.state;
      if (st.onTimeUpdate) st.onTimeUpdate(st.currentSceneIndex, st.currentTimeMs);
    }

    _updateInfo() {
      if (!this._sceneInfo || !this._project) return;
      var idx = this._engine.state.currentSceneIndex;
      var scenes = this._project.scenes;
      var name = scenes[idx] ? scenes[idx].name : "";
      this._sceneInfo.textContent =
        "Scene " + (idx + 1) + " of " + scenes.length + " — " + name;
    }

    // ---- public API ----

    play() { this._engine.play(); }
    pause() { this._engine.pause(); }
    stop() { this._engine.stop(); }
    seekTo(sceneIndex, timeMs) { this._engine.seekTo(sceneIndex, timeMs); }

    get isPlaying() { return this._engine.state.isPlaying; }
    get currentScene() { return this._engine.state.currentSceneIndex; }
    get sceneCount() { return this._project ? this._project.scenes.length : 0; }
    get engine() { return this._engine; }
  }

  customElements.define("citcat-player", CitCatPlayer);
})();
