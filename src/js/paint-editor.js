// Solid / Linear / Radial paint control, shared by object fill, object stroke
// and the scene background (D7 section 5).
//
// Colour maths and gradient geometry come from CitCatRuntime -- duplicating
// them is how the Svg and gradient-background gaps happened. Resolved at call
// time, never at module top level, because canvas.js and this file both load
// before runtime.js in index.html.
var CitCatPaintEditor = (function () {

  function rt() { return window.CitCatRuntime; }

  var DEFAULT_STOPS = [
    { offset: 0.0, color: "#000000" },
    { offset: 1.0, color: "#ffffff" },
  ];

  function defaultGradient(kind) {
    return {
      gradient_type: kind,
      angle: 0,
      stops: DEFAULT_STOPS.map(function (s) { return { offset: s.offset, color: s.color }; }),
    };
  }

  function cloneGradient(g) {
    if (!g || !Array.isArray(g.stops)) return null;
    return {
      gradient_type: g.gradient_type,
      angle: typeof g.angle === "number" ? g.angle : 0,
      stops: g.stops.map(function (s) { return { offset: s.offset, color: s.color }; }),
    };
  }

  // The colour input cannot carry alpha, so it is split: six digits into
  // <input type=color>, the alpha byte into a companion slider.
  function splitColor(str) {
    var c = rt().parseColor(str);
    if (!c) return { hex: "#000000", alpha: 0 };  // "transparent" and friends
    return {
      hex: rt().formatColor({ r: c.r, g: c.g, b: c.b, a: 255 }),
      alpha: Math.round((c.a / 255) * 100),
    };
  }

  function joinColor(hex, alphaPct) {
    var c = rt().parseColor(hex) || { r: 0, g: 0, b: 0 };
    return rt().formatColor({
      r: c.r, g: c.g, b: c.b,
      a: Math.round(Math.max(0, Math.min(100, alphaPct)) / 100 * 255),
    });
  }

  // A CSS ramp for the preview strip. Radial previews as a linear ramp -- the
  // strip shows the colour sequence, the canvas shows the shape.
  function previewCss(grad) {
    if (!grad || !grad.stops || grad.stops.length === 0) return "transparent";
    var stops = rt().paintableStops(grad);
    if (stops.length === 1) return stops[0].color;
    var parts = stops.map(function (s) {
      return s.color + " " + Math.round(s.offset * 100) + "%";
    });
    return "linear-gradient(to right, " + parts.join(", ") + ")";
  }

  /**
   * Mount a paint control into `host`.
   *
   * opts.label     heading text ("Fill", "Stroke", "Background")
   * opts.allowNone stroke may legitimately be absent
   * opts.onChange  ({ color, gradient }) -- gradient is null in Solid mode
   */
  function create(host, opts) {
    opts = opts || {};
    var onChange = opts.onChange || function () {};

    // Mode switching must not destroy work, so the editor keeps the last
    // gradient of each kind alive in memory even while Solid is selected.
    // Only what leaves via onChange reflects the current mode.
    var state = {
      mode: "Solid",
      color: "#000000",
      linear: null,
      radial: null,
      suppress: false,
    };

    host.classList.add("paint-editor");
    host.innerHTML = "";

    var head = document.createElement("div");
    head.className = "paint-head";
    var title = document.createElement("span");
    title.className = "paint-title";
    title.textContent = opts.label || "Paint";
    head.appendChild(title);

    var modes = document.createElement("div");
    modes.className = "paint-modes";
    var modeBtns = {};
    ["Solid", "Linear", "Radial"].forEach(function (m) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "paint-mode-btn";
      b.textContent = m;
      b.title = m === "Solid" ? "Flat colour" : m + " gradient";
      b.addEventListener("click", function () { setMode(m); });
      modeBtns[m] = b;
      modes.appendChild(b);
    });
    head.appendChild(modes);
    host.appendChild(head);

    var preview = document.createElement("div");
    preview.className = "paint-preview";
    host.appendChild(preview);

    // --- Solid ---
    var solidRow = document.createElement("div");
    solidRow.className = "swatch-row paint-solid";
    var solidColor = document.createElement("input");
    solidColor.type = "color";
    var solidAlpha = document.createElement("input");
    solidAlpha.type = "range";
    solidAlpha.className = "alpha-slider";
    solidAlpha.min = 0; solidAlpha.max = 100;
    solidAlpha.title = "Alpha";
    solidRow.appendChild(solidColor);
    solidRow.appendChild(solidAlpha);
    host.appendChild(solidRow);

    function onSolid() {
      if (state.suppress) return;
      state.color = joinColor(solidColor.value, parseInt(solidAlpha.value, 10));
      paint();
      emit();
    }
    solidColor.addEventListener("input", onSolid);
    solidAlpha.addEventListener("input", onSolid);

    // --- Gradient ---
    var gradBox = document.createElement("div");
    gradBox.className = "paint-gradient";

    var angleRow = document.createElement("label");
    angleRow.className = "paint-angle";
    // 0 is top-to-bottom, clockwise (D7 section 3). A dial with 0 at north
    // would read 180 degrees out, so the direction is spelled out.
    angleRow.innerHTML = '<span>Angle <small>0° = top → bottom</small></span>';
    var angleInput = document.createElement("input");
    angleInput.type = "number";
    angleInput.step = "5";
    angleInput.min = "0";
    angleInput.max = "360";
    angleRow.appendChild(angleInput);
    gradBox.appendChild(angleRow);

    angleInput.addEventListener("input", function () {
      if (state.suppress) return;
      var g = activeGradient();
      if (!g) return;
      g.angle = parseFloat(this.value) || 0;
      paint();
      emit();
    });

    var stopList = document.createElement("div");
    stopList.className = "paint-stops";
    gradBox.appendChild(stopList);

    var addStop = document.createElement("button");
    addStop.type = "button";
    addStop.className = "small-btn paint-add-stop";
    addStop.textContent = "+ Stop";
    addStop.addEventListener("click", function () {
      var g = activeGradient();
      if (!g) return;
      var last = g.stops.length ? g.stops[g.stops.length - 1] : null;
      g.stops.push({
        offset: last ? Math.min(1, last.offset + 0.25) : 0.5,
        color: last ? last.color : "#ffffff",
      });
      renderStops();
      paint();
      emit();
    });
    gradBox.appendChild(addStop);
    host.appendChild(gradBox);

    function activeGradient() {
      if (state.mode === "Linear") return state.linear;
      if (state.mode === "Radial") return state.radial;
      return null;
    }

    function renderStops() {
      stopList.innerHTML = "";
      var g = activeGradient();
      if (!g) return;

      g.stops.forEach(function (stop, i) {
        var row = document.createElement("div");
        row.className = "paint-stop";

        var parts = splitColor(stop.color);

        var col = document.createElement("input");
        col.type = "color";
        col.value = parts.hex;
        col.title = "Stop colour";

        var alpha = document.createElement("input");
        alpha.type = "range";
        alpha.className = "alpha-slider";
        alpha.min = 0; alpha.max = 100;
        alpha.value = parts.alpha;
        alpha.title = "Alpha";

        var off = document.createElement("input");
        off.type = "number";
        off.className = "paint-stop-offset";
        off.min = 0; off.max = 1; off.step = 0.05;
        off.value = stop.offset;
        off.title = "Position (0-1)";

        function writeStop() {
          if (state.suppress) return;
          stop.color = joinColor(col.value, parseInt(alpha.value, 10));
          var o = parseFloat(off.value);
          stop.offset = isNaN(o) ? 0 : Math.max(0, Math.min(1, o));
          paint();
          emit();
        }
        col.addEventListener("input", writeStop);
        alpha.addEventListener("input", writeStop);
        off.addEventListener("input", writeStop);

        var up = document.createElement("button");
        up.type = "button";
        up.textContent = "↑";
        up.title = "Move earlier";
        up.disabled = i === 0;
        up.addEventListener("click", function () { moveStop(i, -1); });

        var down = document.createElement("button");
        down.type = "button";
        down.textContent = "↓";
        down.title = "Move later";
        down.disabled = i === g.stops.length - 1;
        down.addEventListener("click", function () { moveStop(i, 1); });

        var del = document.createElement("button");
        del.type = "button";
        del.textContent = "×";
        del.title = "Remove stop";
        del.addEventListener("click", function () {
          g.stops.splice(i, 1);
          renderStops();
          paint();
          emit();
        });

        var btns = document.createElement("div");
        btns.className = "paint-stop-btns";
        btns.appendChild(up);
        btns.appendChild(down);
        btns.appendChild(del);

        row.appendChild(col);
        row.appendChild(alpha);
        row.appendChild(off);
        row.appendChild(btns);
        stopList.appendChild(row);
      });

      // A one-stop gradient is legal and stored; it just falls back to the flat
      // colour when painted, so say so rather than letting the object look broken.
      var warn = stopList.querySelector(".paint-stop-warn");
      if (warn) warn.remove();
      if (g.stops.length < 2) {
        var w = document.createElement("p");
        w.className = "props-hint paint-stop-warn";
        w.textContent = "Needs two stops to paint — showing the flat colour until then.";
        stopList.appendChild(w);
      }
    }

    function paint() {
      var g = activeGradient();
      if (state.mode === "Solid" || !g) {
        preview.style.background = state.color;
      } else {
        preview.style.background = previewCss(g);
      }
      Object.keys(modeBtns).forEach(function (m) {
        modeBtns[m].classList.toggle("active", m === state.mode);
      });
      solidRow.hidden = state.mode !== "Solid";
      gradBox.hidden = state.mode === "Solid";
      angleRow.hidden = state.mode !== "Linear";
    }

    function moveStop(i, dir) {
      var g = activeGradient();
      if (!g) return;
      var j = i + dir;
      if (j < 0 || j >= g.stops.length) return;
      var tmp = g.stops[i];
      g.stops[i] = g.stops[j];
      g.stops[j] = tmp;
      renderStops();
      paint();
      emit();
    }

    function setMode(m) {
      if (state.mode === m) return;
      state.mode = m;
      // Seed a gradient the first time this kind is chosen, and keep whatever
      // the author already built for the other kind.
      if (m === "Linear" && !state.linear) state.linear = defaultGradient("Linear");
      if (m === "Radial" && !state.radial) state.radial = defaultGradient("Radial");
      renderStops();
      paint();
      emit();
    }

    function emit() {
      if (state.suppress) return;
      onChange({
        color: state.color,
        gradient: cloneGradient(activeGradient()),
      });
    }

    /** Load a colour + optional gradient without firing onChange. */
    function set(color, gradient) {
      state.suppress = true;

      state.color = color || (opts.allowNone ? "#00000000" : "#000000");
      var parts = splitColor(state.color);
      solidColor.value = parts.hex;
      solidAlpha.value = parts.alpha;

      if (gradient && Array.isArray(gradient.stops)) {
        var g = cloneGradient(gradient);
        if (g.gradient_type === "Radial") {
          state.radial = g;
          state.mode = "Radial";
        } else {
          state.linear = g;
          state.mode = "Linear";
        }
        angleInput.value = g.angle || 0;
      } else {
        state.mode = "Solid";
      }

      renderStops();
      paint();
      state.suppress = false;
    }

    set("#000000", null);

    return { set: set, el: host };
  }

  return {
    create: create,
    splitColor: splitColor,
    joinColor: joinColor,
    previewCss: previewCss,
    defaultGradient: defaultGradient,
  };
})();
