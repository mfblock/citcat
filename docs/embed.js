/**
 * CitCat Embed Player v0.1.0
 * https://citcat.mirjam-block.eu
 *
 * Drop-in web component for embedding CitCat projects in any web page.
 *
 * Usage:
 *   <script src="https://citcat.mirjam-block.eu/embed.js"></script>
 *   <citcat-player src="project.citcat" autoplay controls></citcat-player>
 *
 * MIT License — Mirjam Block 2026
 */
;(function () {
  "use strict";
  if (customElements.get("citcat-player")) return;

  // ===== Bundled CitCat runtime engine (self-contained) =====

  function _applyEasing(t, e) {
    switch (e) {
      case "Linear": return t;
      case "EaseIn": return t * t * t;
      case "EaseOut": return 1 - Math.pow(1 - t, 3);
      case "EaseInOut": return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      default: return t;
    }
  }

  function _lerp(a, b, t) { return a + (b - a) * t; }

  function _parseHex(h) {
    h = h.replace("#", "");
    return { r: parseInt(h.substring(0, 2), 16) || 0, g: parseInt(h.substring(2, 4), 16) || 0, b: parseInt(h.substring(4, 6), 16) || 0 };
  }

  function _lerpColor(c1, c2, t) {
    var a = _parseHex(c1), b = _parseHex(c2);
    var r = Math.round(a.r + (b.r - a.r) * t), g = Math.round(a.g + (b.g - a.g) * t), bl = Math.round(a.b + (b.b - a.b) * t);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }

  function _kfVal(kv) { return (kv && typeof kv === "object" && "type" in kv) ? kv.value : kv; }

  function _interpolate(kfs, prop, timeMs) {
    var rel = [];
    for (var i = 0; i < kfs.length; i++) { if (kfs[i].property === prop) rel.push(kfs[i]); }
    if (!rel.length) return null;
    rel.sort(function (a, b) { return a.time_ms - b.time_ms; });
    if (rel.length === 1) return _kfVal(rel[0].value);
    var first = rel[0], last = rel[rel.length - 1];
    if (timeMs <= first.time_ms) return _kfVal(first.value);
    if (timeMs >= last.time_ms) return _kfVal(last.value);
    var before = first, after = rel[1];
    for (var i = 0; i < rel.length - 1; i++) {
      if (rel[i].time_ms <= timeMs && rel[i + 1].time_ms >= timeMs) { before = rel[i]; after = rel[i + 1]; break; }
    }
    var dur = after.time_ms - before.time_ms;
    if (dur === 0) return _kfVal(after.value);
    var rawT = (timeMs - before.time_ms) / dur;
    var t = _applyEasing(rawT, after.easing);
    var bV = _kfVal(before.value), aV = _kfVal(after.value);
    if (typeof bV === "number" && typeof aV === "number") return _lerp(bV, aV, t);
    if (typeof bV === "string" && typeof aV === "string" && bV[0] === "#" && aV[0] === "#") return _lerpColor(bV, aV, t);
    if (typeof bV === "boolean") return rawT < 1.0 ? bV : aV;
    return bV;
  }

  function _cubicBez(p0, p1, p2, p3, t) {
    var u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  }

  function _evalPath(path, prog) {
    if (!path || !path.points || !path.points.length) return null;
    if (path.points.length === 1) return { x: path.points[0].x, y: path.points[0].y };
    prog = Math.max(0, Math.min(1, prog));
    var n = path.points.length - 1, sps = 20, segL = [], total = 0;
    for (var i = 0; i < n; i++) {
      var a = path.points[i], b = path.points[i + 1];
      var c1x = a.control_out ? a.control_out.x : a.x, c1y = a.control_out ? a.control_out.y : a.y;
      var c2x = b.control_in ? b.control_in.x : b.x, c2y = b.control_in ? b.control_in.y : b.y;
      var len = 0, px = a.x, py = a.y;
      for (var s = 1; s <= sps; s++) {
        var t = s / sps, nx = _cubicBez(a.x, c1x, c2x, b.x, t), ny = _cubicBez(a.y, c1y, c2y, b.y, t);
        var dx = nx - px, dy = ny - py; len += Math.sqrt(dx * dx + dy * dy); px = nx; py = ny;
      }
      segL.push(len); total += len;
    }
    if (total === 0) return { x: path.points[0].x, y: path.points[0].y };
    var tgt = prog * total, acc = 0;
    for (var i = 0; i < n; i++) {
      if (acc + segL[i] >= tgt || i === n - 1) {
        var lt = segL[i] > 0 ? Math.max(0, Math.min(1, (tgt - acc) / segL[i])) : 0;
        var a = path.points[i], b = path.points[i + 1];
        var c1x = a.control_out ? a.control_out.x : a.x, c1y = a.control_out ? a.control_out.y : a.y;
        var c2x = b.control_in ? b.control_in.x : b.x, c2y = b.control_in ? b.control_in.y : b.y;
        return { x: _cubicBez(a.x, c1x, c2x, b.x, lt), y: _cubicBez(a.y, c1y, c2y, b.y, lt) };
      }
      acc += segL[i];
    }
    var last = path.points[n];
    return { x: last.x, y: last.y };
  }

  var ANIM_PROPS = [
    "transform.x", "transform.y", "transform.width", "transform.height",
    "transform.rotation", "transform.opacity",
    "style.fill", "style.stroke", "style.stroke_width",
    "style.font_size", "style.border_radius",
    "visible", "_typewriter_progress", "_path_progress", "audio_volume"
  ];

  function _resolveObj(obj, timeMs) {
    if (obj.appear_at_ms != null && timeMs < obj.appear_at_ms) return { id: obj.id, visible: false, object_type: obj.object_type, z_index: obj.z_index, transform: obj.transform, style: obj.style, events: [], content: "", _typewriter_progress: null };
    if (obj.disappear_at_ms != null && timeMs > obj.disappear_at_ms) return { id: obj.id, visible: false, object_type: obj.object_type, z_index: obj.z_index, transform: obj.transform, style: obj.style, events: [], content: "", _typewriter_progress: null };
    var r = {
      id: obj.id, name: obj.name, object_type: obj.object_type, content: obj.content,
      visible: obj.visible, z_index: obj.z_index, events: obj.events,
      motion_path: obj.motion_path || null,
      video_trim_start_ms: obj.video_trim_start_ms || 0,
      video_trim_end_ms: obj.video_trim_end_ms || null,
      video_muted: obj.video_muted !== false,
      audio_volume: obj.audio_volume !== undefined ? obj.audio_volume : 1.0,
      audio_loop: obj.audio_loop || false,
      text_wrap: obj.text_wrap || false,
      filters: obj.filters || null,
      transform: { x: obj.transform.x, y: obj.transform.y, width: obj.transform.width, height: obj.transform.height, rotation: obj.transform.rotation, opacity: obj.transform.opacity },
      style: { fill: obj.style.fill, stroke: obj.style.stroke, stroke_width: obj.style.stroke_width, font_family: obj.style.font_family, font_size: obj.style.font_size, font_weight: obj.style.font_weight, text_align: obj.style.text_align, line_height: obj.style.line_height, border_radius: obj.style.border_radius },
      _typewriter_progress: null
    };
    if (!obj.keyframes || !obj.keyframes.length) return r;
    var pathProg = null;
    for (var i = 0; i < ANIM_PROPS.length; i++) {
      var p = ANIM_PROPS[i], v = _interpolate(obj.keyframes, p, timeMs);
      if (v === null) continue;
      if (p === "visible") r.visible = v;
      else if (p === "_typewriter_progress") r._typewriter_progress = v;
      else if (p === "_path_progress") pathProg = v;
      else if (p === "audio_volume") r.audio_volume = v;
      else { var pts = p.split("."); if (pts.length === 2) r[pts[0]][pts[1]] = v; }
    }
    if (pathProg !== null && obj.motion_path) {
      var pos = _evalPath(obj.motion_path, pathProg);
      if (pos) { r.transform.x = pos.x - r.transform.width / 2; r.transform.y = pos.y - r.transform.height / 2; }
    }
    return r;
  }

  // ===== CitCat Player Engine (per-instance) =====

  function CitCatEngine() {
    var self = this;
    self.project = null;
    self.sceneIndex = 0;
    self.timeMs = 0;
    self.playing = false;
    self.looping = false;
    self.muted = false;
    self._lastFrame = 0;
    self._afId = null;
    self._evCanvas = null;
    self._runtimeVis = {};
    self._firedTimers = {};
    self._hovered = {};
    // wait state
    self._waiting = false;
    self._waitFired = {};
    self._waitClickHandler = null;
    self._waitTimerStart = 0;
    self._waitTimerDelay = 0;
    // callbacks
    self.onTimeUpdate = null;
    self.onSceneChange = null;
    self.onPlayStateChange = null;
  }

  CitCatEngine.prototype.setProject = function (p) { this.project = p; };

  CitCatEngine.prototype.getScene = function (i) {
    if (!this.project || i < 0 || i >= this.project.scenes.length) return null;
    return this.project.scenes[i];
  };
  CitCatEngine.prototype.currentScene = function () { return this.getScene(this.sceneIndex); };

  CitCatEngine.prototype.getResolvedScene = function (si, t) {
    var sc = this.getScene(si);
    if (!sc) return null;
    var objs = [];
    for (var i = 0; i < sc.objects.length; i++) objs.push(_resolveObj(sc.objects[i], t));
    return { id: sc.id, name: sc.name, duration_ms: sc.duration_ms, background: sc.background, transition_in: sc.transition_in, transition_out: sc.transition_out, objects: objs, subtitle_track: sc.subtitle_track };
  };

  CitCatEngine.prototype.play = function () {
    if (this.playing) return;
    if (!this.project || !this.project.scenes.length) return;
    this.playing = true;
    this._lastFrame = performance.now();
    var self = this;
    self._afId = requestAnimationFrame(function f(now) { self._tick(now); });
    if (self.onPlayStateChange) self.onPlayStateChange(true);
  };

  CitCatEngine.prototype.pause = function () {
    if (!this.playing) return;
    this.playing = false;
    if (this._afId) { cancelAnimationFrame(this._afId); this._afId = null; }
    if (this.onPlayStateChange) this.onPlayStateChange(false);
  };

  CitCatEngine.prototype.stop = function () {
    this.pause();
    this._resetEvents();
    this._resetWait();
    this.sceneIndex = 0;
    this.timeMs = 0;
    if (this.onTimeUpdate) this.onTimeUpdate(0, 0);
    if (this.onSceneChange) this.onSceneChange(0);
    if (this.onPlayStateChange) this.onPlayStateChange(false);
  };

  CitCatEngine.prototype._resetEvents = function () {
    this._firedTimers = {};
    this._hovered = {};
    this._runtimeVis = {};
  };

  CitCatEngine.prototype._resetWait = function () {
    if (this._waitClickHandler && this._evCanvas) {
      this._evCanvas.removeEventListener("click", this._waitClickHandler);
    }
    this._waiting = false;
    this._waitFired = {};
    this._waitClickHandler = null;
  };

  CitCatEngine.prototype._tick = function (now) {
    if (!this.playing) return;
    if (this._waiting) return;
    var elapsed = now - this._lastFrame;
    this._lastFrame = now;
    this.timeMs += elapsed;
    var sc = this.currentScene();
    if (!sc) { this.stop(); return; }
    if (this._checkWaitPoints(sc, this.timeMs)) {
      if (this.onTimeUpdate) this.onTimeUpdate(this.sceneIndex, this.timeMs);
      return;
    }
    this._checkTimerTriggers(sc, this.timeMs);
    if (this.timeMs >= sc.duration_ms) {
      this._checkSceneEndTriggers(sc);
      this._resetEvents();
      this._waiting = false;
      this._waitFired = {};
      if (this._waitClickHandler && this._evCanvas) { this._evCanvas.removeEventListener("click", this._waitClickHandler); this._waitClickHandler = null; }
      if (this.sceneIndex < this.project.scenes.length - 1) {
        this.sceneIndex++;
        this.timeMs = 0;
        if (this.onSceneChange) this.onSceneChange(this.sceneIndex);
      } else if (this.looping) {
        this.sceneIndex = 0; this.timeMs = 0;
        if (this.onSceneChange) this.onSceneChange(0);
      } else {
        this.stop(); return;
      }
    }
    if (this.onTimeUpdate) this.onTimeUpdate(this.sceneIndex, this.timeMs);
    var self = this;
    self._afId = requestAnimationFrame(function (n) { self._tick(n); });
  };

  CitCatEngine.prototype._checkWaitPoints = function (sc, t) {
    if (!sc.wait_points || !sc.wait_points.length) return false;
    if (this._waiting) return true;
    for (var i = 0; i < sc.wait_points.length; i++) {
      var wp = sc.wait_points[i];
      if (this._waitFired[wp.id]) continue;
      if (t >= wp.time_ms) {
        this._waiting = true;
        this._waitFired[wp.id] = true;
        this.timeMs = wp.time_ms;
        this._startWaitResume(wp.resume_on);
        return true;
      }
    }
    return false;
  };

  CitCatEngine.prototype._startWaitResume = function (cond) {
    var type = cond.type || cond;
    var self = this;
    if (type === "Timer") {
      self._waitTimerStart = performance.now();
      self._waitTimerDelay = cond.delay_ms;
      requestAnimationFrame(function f() { self._waitTimerTick(f); });
    } else if (type === "AnyClick") {
      self._installWaitClick(null);
    } else if (type === "Click") {
      self._installWaitClick(cond.object_id);
    } else if (type === "ClickOrTimer") {
      self._waitTimerStart = performance.now();
      self._waitTimerDelay = cond.delay_ms;
      self._installWaitClick(cond.object_id || null);
      requestAnimationFrame(function f() { self._waitTimerTick(f); });
    }
  };

  CitCatEngine.prototype._installWaitClick = function (objId) {
    var canvas = this._evCanvas;
    if (!canvas) return;
    var self = this;
    self._waitClickHandler = function (e) {
      if (!self._waiting) return;
      if (objId) {
        var rect = canvas.getBoundingClientRect();
        var mx = e.clientX - rect.left, my = e.clientY - rect.top;
        var sc2s = self._screenToStage(mx, my);
        if (!sc2s) return;
        var sc = self.currentScene();
        if (!sc) return;
        var tgt = null;
        for (var i = 0; i < sc.objects.length; i++) { if (sc.objects[i].id === objId) { tgt = sc.objects[i]; break; } }
        if (!tgt) return;
        var tt = tgt.transform;
        if (!(sc2s.x >= tt.x && sc2s.x <= tt.x + tt.width && sc2s.y >= tt.y && sc2s.y <= tt.y + tt.height)) return;
      }
      self._resumeFromWait();
    };
    canvas.addEventListener("click", self._waitClickHandler);
  };

  CitCatEngine.prototype._waitTimerTick = function (f) {
    if (!this._waiting) return;
    if (performance.now() - this._waitTimerStart >= this._waitTimerDelay) {
      this._resumeFromWait(); return;
    }
    var self = this;
    requestAnimationFrame(function () { self._waitTimerTick(f); });
  };

  CitCatEngine.prototype._resumeFromWait = function () {
    if (this._waitClickHandler && this._evCanvas) {
      this._evCanvas.removeEventListener("click", this._waitClickHandler);
    }
    this._waiting = false;
    this._waitClickHandler = null;
    this._lastFrame = performance.now();
    var self = this;
    self._afId = requestAnimationFrame(function (n) { self._tick(n); });
  };

  CitCatEngine.prototype._checkTimerTriggers = function (sc, t) {
    for (var i = 0; i < sc.objects.length; i++) {
      var obj = sc.objects[i];
      if (!obj.events) continue;
      for (var j = 0; j < obj.events.length; j++) {
        var ev = obj.events[j];
        if (ev.trigger.type === "Timer") {
          var k = obj.id + ":" + ev.id;
          if (!this._firedTimers[k] && t >= ev.trigger.delay_ms) {
            this._firedTimers[k] = true;
            this._execAction(ev.action);
          }
        }
      }
    }
  };

  CitCatEngine.prototype._checkSceneEndTriggers = function (sc) {
    for (var i = 0; i < sc.objects.length; i++) {
      var obj = sc.objects[i];
      if (!obj.events) continue;
      for (var j = 0; j < obj.events.length; j++) {
        var ev = obj.events[j];
        if (ev.trigger.type === "SceneEnd" || ev.trigger === "SceneEnd") this._execAction(ev.action);
      }
    }
  };

  CitCatEngine.prototype._execAction = function (action) {
    if (!action || !this.project) return;
    switch (action.type) {
      case "GotoScene":
        var idx = -1;
        for (var i = 0; i < this.project.scenes.length; i++) {
          if (this.project.scenes[i].id === action.scene_id) { idx = i; break; }
        }
        if (idx >= 0) {
          this._resetEvents();
          this._waiting = false;
          this._waitFired = {};
          if (this._waitClickHandler && this._evCanvas) { this._evCanvas.removeEventListener("click", this._waitClickHandler); this._waitClickHandler = null; }
          this.sceneIndex = idx;
          this.timeMs = 0;
          if (this.onSceneChange) this.onSceneChange(idx);
          // A wait point halts the rAF chain; clearing the flag above is not enough
          // because the handler that would reschedule it was just removed.
          if (this.playing) {
            var self = this;
            if (this._afId) cancelAnimationFrame(this._afId);
            this._lastFrame = performance.now();
            this._afId = requestAnimationFrame(function (n) { self._tick(n); });
          }
        }
        break;
      case "ToggleVisible":
        var obj = this._findObj(action.object_id);
        if (obj) {
          var cur = this._runtimeVis[obj.id] !== undefined ? this._runtimeVis[obj.id] : obj.visible;
          this._runtimeVis[obj.id] = !cur;
        }
        break;
      case "SetProperty":
        var obj = this._findObj(action.object_id);
        if (obj && action.property && action.value !== undefined) {
          var v = _kfVal(action.value), pts = action.property.split(".");
          if (pts.length === 2 && obj[pts[0]]) obj[pts[0]][pts[1]] = v;
          else if (pts.length === 1) obj[pts[0]] = v;
        }
        break;
    }
  };

  CitCatEngine.prototype._findObj = function (id) {
    var sc = this.currentScene();
    if (!sc) return null;
    for (var i = 0; i < sc.objects.length; i++) { if (sc.objects[i].id === id) return sc.objects[i]; }
    return null;
  };

  CitCatEngine.prototype._screenToStage = function (mx, my) {
    if (!this.project || !this._evCanvas) return null;
    var rect = this._evCanvas.getBoundingClientRect();
    var cpx = mx * (this._evCanvas.width / rect.width);
    var cpy = my * (this._evCanvas.height / rect.height);
    var cw = this._evCanvas.width, ch = this._evCanvas.height;
    var sw = this.project.meta.width, sh = this.project.meta.height;
    var scale = Math.min(cw / sw, ch / sh);
    var ox = (cw - sw * scale) / 2, oy = (ch - sh * scale) / 2;
    return { x: (cpx - ox) / scale, y: (cpy - oy) / scale };
  };

  CitCatEngine.prototype.initEvents = function (canvas) {
    this._evCanvas = canvas;
    var self = this;
    canvas.addEventListener("click", function (e) {
      if (!self.playing || !self.project) return;
      var sc = self.currentScene();
      if (!sc) return;
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      var st = self._screenToStage(mx, my);
      if (!st) return;
      var objs = sc.objects.slice().sort(function (a, b) { return b.z_index - a.z_index; });
      for (var i = 0; i < objs.length; i++) {
        var o = objs[i];
        var vis = self._runtimeVis[o.id] !== undefined ? self._runtimeVis[o.id] : o.visible;
        if (!vis && o.object_type !== "Hotspot") continue;
        var t = o.transform;
        if (st.x >= t.x && st.x <= t.x + t.width && st.y >= t.y && st.y <= t.y + t.height) {
          if (o.events) {
            for (var j = 0; j < o.events.length; j++) {
              if (o.events[j].trigger.type === "Click" || o.events[j].trigger === "Click") {
                self._execAction(o.events[j].action);
              }
            }
          }
          break;
        }
      }
    });
  };

  CitCatEngine.prototype.getRuntimeVis = function (id) {
    return this._runtimeVis[id] !== undefined ? this._runtimeVis[id] : null;
  };

  // ===== Renderer =====

  function CitCatRenderer(canvas, engine, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.engine = engine;
    this.assets = assets;
    this._imgCache = {};
    this._audCache = {};
  }

  CitCatRenderer.prototype._loadImg = function (src) {
    if (this._imgCache[src]) return this._imgCache[src];
    var img = new Image();
    img.src = (this.assets && this.assets[src]) ? this.assets[src] : src;
    this._imgCache[src] = img;
    return img;
  };

  CitCatRenderer.prototype._roundRect = function (x, y, w, h, r) {
    var c = this.ctx;
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  };

  CitCatRenderer.prototype._buildFilter = function (f) {
    if (!f) return "none";
    var parts = [];
    if (f.blur) parts.push("blur(" + f.blur + "px)");
    if (f.brightness != null && f.brightness !== 1) parts.push("brightness(" + f.brightness + ")");
    if (f.contrast != null && f.contrast !== 1) parts.push("contrast(" + f.contrast + ")");
    if (f.saturate != null && f.saturate !== 1) parts.push("saturate(" + f.saturate + ")");
    if (f.hue_rotate) parts.push("hue-rotate(" + f.hue_rotate + "deg)");
    if (f.grayscale) parts.push("grayscale(" + f.grayscale + ")");
    if (f.sepia) parts.push("sepia(" + f.sepia + ")");
    if (f.drop_shadow) {
      var ds = f.drop_shadow;
      parts.push("drop-shadow(" + (ds.offset_x || 0) + "px " + (ds.offset_y || 0) + "px " + (ds.blur || 0) + "px " + (ds.color || "#000") + ")");
    }
    return parts.length ? parts.join(" ") : "none";
  };

  CitCatRenderer.prototype._renderObj = function (obj) {
    var t = obj.transform, s = obj.style, c = this.ctx;
    c.save();
    if (obj.filters) c.filter = this._buildFilter(obj.filters);
    if (t.rotation !== 0) {
      var cx = t.x + t.width / 2, cy = t.y + t.height / 2;
      c.translate(cx, cy); c.rotate(t.rotation * Math.PI / 180); c.translate(-cx, -cy);
    }
    c.globalAlpha = t.opacity;
    switch (obj.object_type) {
      case "Text":
        c.font = s.font_weight + " " + s.font_size + "px " + s.font_family;
        c.fillStyle = s.fill; c.textBaseline = "top";
        var align = s.text_align || "Left";
        c.textAlign = align === "Center" ? "center" : align === "Right" ? "right" : "left";
        var content = obj.content || "";
        if (obj._typewriter_progress != null) content = content.substring(0, Math.floor(content.length * obj._typewriter_progress));
        var lines = content.split("\n"), lh = s.font_size * (s.line_height || 1.4);
        var tx = t.x;
        if (align === "Center") tx = t.x + t.width / 2;
        else if (align === "Right") tx = t.x + t.width;
        if (obj.text_wrap) {
          var wrapped = this._wrapText(content, s.font_weight + " " + s.font_size + "px " + s.font_family, t.width);
          for (var li = 0; li < wrapped.length; li++) c.fillText(wrapped[li], tx, t.y + li * lh);
        } else {
          for (var li = 0; li < lines.length; li++) c.fillText(lines[li], tx, t.y + li * lh);
        }
        break;
      case "Rect":
        var r = s.border_radius || 0;
        if (r > 0) {
          this._roundRect(t.x, t.y, t.width, t.height, r);
          if (s.fill && s.fill !== "transparent") { c.fillStyle = s.fill; c.fill(); }
          if (s.stroke_width > 0) { c.strokeStyle = s.stroke; c.lineWidth = s.stroke_width; c.stroke(); }
        } else {
          if (s.fill && s.fill !== "transparent") { c.fillStyle = s.fill; c.fillRect(t.x, t.y, t.width, t.height); }
          if (s.stroke_width > 0) { c.strokeStyle = s.stroke; c.lineWidth = s.stroke_width; c.strokeRect(t.x, t.y, t.width, t.height); }
        }
        break;
      case "Ellipse":
        c.beginPath();
        c.ellipse(t.x + t.width / 2, t.y + t.height / 2, t.width / 2, t.height / 2, 0, 0, Math.PI * 2);
        if (s.fill && s.fill !== "transparent") { c.fillStyle = s.fill; c.fill(); }
        if (s.stroke_width > 0) { c.strokeStyle = s.stroke; c.lineWidth = s.stroke_width; c.stroke(); }
        break;
      case "Image": case "Svg":
        if (obj.content) {
          var img = this._loadImg(obj.content);
          if (img.complete && img.naturalWidth > 0) c.drawImage(img, t.x, t.y, t.width, t.height);
        }
        break;
      case "Button":
        this._roundRect(t.x, t.y, t.width, t.height, s.border_radius || 8);
        c.fillStyle = s.fill; c.fill();
        if (s.stroke_width > 0) { c.strokeStyle = s.stroke; c.lineWidth = s.stroke_width; c.stroke(); }
        c.font = s.font_weight + " " + s.font_size + "px " + s.font_family;
        c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
        var btnTxt = obj.content || "";
        if (obj._typewriter_progress != null) btnTxt = btnTxt.substring(0, Math.floor(btnTxt.length * obj._typewriter_progress));
        c.fillText(btnTxt, t.x + t.width / 2, t.y + t.height / 2);
        c.textAlign = "left"; c.textBaseline = "top";
        break;
      case "Audio":
        if (obj.content && this.engine.playing && !this.engine.muted) {
          if (!this._audCache[obj.content]) {
            var aud = new Audio(obj.content);
            aud.volume = obj.audio_volume !== undefined ? obj.audio_volume : 1.0;
            aud.loop = !!obj.audio_loop;
            this._audCache[obj.content] = aud;
          }
          var a = this._audCache[obj.content];
          a.volume = obj.audio_volume !== undefined ? obj.audio_volume : 1.0;
          if (a.paused) a.play().catch(function () {});
        }
        break;
    }
    c.globalAlpha = 1;
    c.filter = "none";
    c.restore();
  };

  CitCatRenderer.prototype._wrapText = function (text, font, maxW) {
    var c = this.ctx;
    c.font = font;
    var words = text.split(" "), lines = [], line = "";
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (c.measureText(test).width > maxW && line) {
        lines.push(line); line = words[i];
      } else { line = test; }
    }
    if (line) lines.push(line);
    return lines;
  };

  CitCatRenderer.prototype.renderFrame = function () {
    var eng = this.engine, sc = eng.currentScene();
    if (!sc) return;
    var c = this.ctx, cv = this.canvas;
    c.clearRect(0, 0, cv.width, cv.height);
    var sw = eng.project.meta.width, sh = eng.project.meta.height;
    var cw = cv.width, ch = cv.height;
    var scale = Math.min(cw / sw, ch / sh);
    var ox = (cw - sw * scale) / 2, oy = (ch - sh * scale) / 2;
    c.save(); c.translate(ox, oy); c.scale(scale, scale);

    // background
    var bg = sc.background;
    if (bg.gradient) {
      var g;
      if (bg.gradient.gradient_type === "Radial") {
        g = c.createRadialGradient(sw / 2, sh / 2, 0, sw / 2, sh / 2, Math.max(sw, sh) / 2);
      } else {
        g = c.createLinearGradient(0, 0, 0, sh);
      }
      if (bg.gradient.stops) {
        for (var i = 0; i < bg.gradient.stops.length; i++) {
          g.addColorStop(bg.gradient.stops[i].offset, bg.gradient.stops[i].color);
        }
      }
      c.fillStyle = g;
    } else {
      c.fillStyle = bg.fill;
    }
    c.fillRect(0, 0, sw, sh);

    var resolved = eng.getResolvedScene(eng.sceneIndex, eng.timeMs);
    if (resolved) {
      var objs = resolved.objects.slice().sort(function (a, b) { return a.z_index - b.z_index; });
      for (var i = 0; i < objs.length; i++) {
        var o = objs[i];
        var vis = eng.getRuntimeVis(o.id);
        if (vis !== null) o.visible = vis;
        if (!o.visible) continue;
        if (o.object_type === "Hotspot") continue;
        if (o.object_type === "Audio") { this._renderObj(o); continue; }
        this._renderObj(o);
      }
    }

    // subtitles
    if (sc.subtitle_track && sc.subtitle_track.entries) {
      var active = null;
      for (var i = 0; i < sc.subtitle_track.entries.length; i++) {
        var e = sc.subtitle_track.entries[i];
        if (eng.timeMs >= e.start_ms && eng.timeMs <= e.end_ms) { active = e; break; }
      }
      if (active) {
        var fs = 28, pad = 8;
        c.font = "600 " + fs + "px system-ui"; c.textAlign = "center"; c.textBaseline = "bottom";
        var subLines = active.text.split("\n");
        var th = subLines.length * (fs * 1.3) + pad * 2, sy = sh - 40;
        c.fillStyle = "rgba(0,0,0,0.7)";
        var maxW = 0;
        for (var li = 0; li < subLines.length; li++) { var w = c.measureText(subLines[li]).width; if (w > maxW) maxW = w; }
        c.fillRect(sw / 2 - maxW / 2 - pad * 2, sy - th, maxW + pad * 4, th + pad);
        c.fillStyle = "#fff";
        for (var li = subLines.length - 1; li >= 0; li--) c.fillText(subLines[li], sw / 2, sy - (subLines.length - 1 - li) * (fs * 1.3));
        c.textAlign = "left"; c.textBaseline = "top";
      }
    }

    c.restore();
  };

  // ===== Web Component =====

  var CSS = [
    ":host { display: block; position: relative; overflow: hidden; background: #000; line-height: 0; }",
    "canvas { display: block; width: 100%; height: 100%; }",
    ".controls { position: absolute; bottom: 0; left: 0; right: 0; display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(0,0,0,0.65); color: #fff; font-family: system-ui, sans-serif; font-size: 13px; opacity: 0; transition: opacity 0.25s; }",
    ":host(:hover) .controls { opacity: 1; }",
    ".ctrl-btn { background: none; border: none; color: #fff; cursor: pointer; padding: 4px; line-height: 1; }",
    ".ctrl-btn:hover { color: #a78bfa; }",
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
      this._engine = new CitCatEngine();
      this._renderer = null;
      this._shadow = this.attachShadow({ mode: "open" });
      this._canvas = null;
      this._ro = null;
    }

    connectedCallback() {
      var style = document.createElement("style");
      style.textContent = CSS;
      this._shadow.appendChild(style);

      this._canvas = document.createElement("canvas");
      this._shadow.appendChild(this._canvas);

      var self = this;

      // Sizing
      var w = parseInt(this.getAttribute("width")) || 0;
      var h = parseInt(this.getAttribute("height")) || 0;
      if (w && h) {
        this.style.width = w + "px";
        this.style.height = h + "px";
      } else if (w) {
        this.style.width = w + "px";
      } else {
        this.style.width = "100%";
      }

      // Controls
      if (this.hasAttribute("controls")) {
        var bar = document.createElement("div");
        bar.className = "controls";
        var playBtn = document.createElement("button");
        playBtn.className = "ctrl-btn"; playBtn.innerHTML = PLAY_SVG; playBtn.title = "Play/Pause";
        var stopBtn = document.createElement("button");
        stopBtn.className = "ctrl-btn"; stopBtn.innerHTML = STOP_SVG; stopBtn.title = "Stop";
        var info = document.createElement("span");
        info.className = "scene-info"; info.textContent = "Loading...";
        var wm = document.createElement("a");
        wm.className = "watermark"; wm.textContent = "CitCat";
        wm.href = "https://citcat.mirjam-block.eu"; wm.target = "_blank"; wm.rel = "noopener";
        bar.appendChild(playBtn); bar.appendChild(stopBtn); bar.appendChild(info); bar.appendChild(wm);
        this._shadow.appendChild(bar);
        this._sceneInfo = info;
        this._playBtn = playBtn;

        playBtn.addEventListener("click", function () {
          if (self._engine.playing) self._engine.pause();
          else self._engine.play();
        });
        stopBtn.addEventListener("click", function () { self._engine.stop(); });

        self._engine.onPlayStateChange = function (playing) {
          playBtn.innerHTML = playing ? PAUSE_SVG : PLAY_SVG;
          self._updateInfo();
        };
        self._engine.onSceneChange = function () { self._updateInfo(); };
        self._engine.onTimeUpdate = function () { self._updateInfo(); };
      }

      // Muted
      if (this.hasAttribute("muted")) this._engine.muted = true;
      if (this.hasAttribute("loop")) this._engine.looping = true;

      // Load project
      this._loadProject().then(function (proj) {
        if (!proj) return;
        self._engine.setProject(proj);
        self._initCanvas(proj);
        self._renderer = new CitCatRenderer(self._canvas, self._engine, null);
        self._engine.initEvents(self._canvas);

        // Wire rendering to engine
        var origTime = self._engine.onTimeUpdate;
        var origScene = self._engine.onSceneChange;
        var origPlay = self._engine.onPlayStateChange;
        self._engine.onTimeUpdate = function (si, ms) {
          self._renderer.renderFrame();
          if (origTime) origTime(si, ms);
        };
        self._engine.onSceneChange = function (idx) {
          self._renderer.renderFrame();
          if (origScene) origScene(idx);
        };
        self._engine.onPlayStateChange = function (playing) {
          if (!playing) self._renderer.renderFrame();
          if (origPlay) origPlay(playing);
        };

        self._renderer.renderFrame();
        self._updateInfo();

        if (self.hasAttribute("autoplay")) self._engine.play();
      });

      // ResizeObserver
      this._ro = new ResizeObserver(function () {
        if (self._engine.project) {
          self._sizeCanvas();
          if (self._renderer) self._renderer.renderFrame();
        }
      });
      this._ro.observe(this);
    }

    disconnectedCallback() {
      if (this._ro) this._ro.disconnect();
      this._engine.stop();
    }

    _loadProject() {
      // Check inline JSON
      var script = this.querySelector('script[type="application/json"]');
      if (script) {
        try { return Promise.resolve(JSON.parse(script.textContent)); } catch (e) { return Promise.resolve(null); }
      }
      // Fetch from src
      var src = this.getAttribute("src");
      if (!src) return Promise.resolve(null);
      return fetch(src).then(function (r) { return r.json(); }).catch(function () { return null; });
    }

    _initCanvas(proj) {
      this._canvas.width = proj.meta.width;
      this._canvas.height = proj.meta.height;
      this._sizeCanvas();
    }

    _sizeCanvas() {
      if (!this._engine.project) return;
      var proj = this._engine.project;
      var ratio = proj.meta.width / proj.meta.height;
      var w = parseInt(this.getAttribute("width")) || 0;
      var h = parseInt(this.getAttribute("height")) || 0;
      if (!w && !h) {
        w = this.clientWidth || 960;
        h = Math.round(w / ratio);
        this.style.height = h + "px";
      } else if (w && !h) {
        h = Math.round(w / ratio);
        this.style.height = h + "px";
      }
    }

    _updateInfo() {
      if (!this._sceneInfo || !this._engine.project) return;
      var idx = this._engine.sceneIndex;
      var scenes = this._engine.project.scenes;
      var name = scenes[idx] ? scenes[idx].name : "";
      this._sceneInfo.textContent = "Scene " + (idx + 1) + " of " + scenes.length + " — " + name;
    }

    // Public API
    play() { this._engine.play(); }
    pause() { this._engine.pause(); }
    stop() { this._engine.stop(); }
    get currentScene() { return this._engine.sceneIndex; }
    get isPlaying() { return this._engine.playing; }
    get sceneCount() { return this._engine.project ? this._engine.project.scenes.length : 0; }
  }

  customElements.define("citcat-player", CitCatPlayer);
})();
