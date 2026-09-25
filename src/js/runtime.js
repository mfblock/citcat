var CitCatRuntime = (function () {
  function applyEasing(t, easing) {
    switch (easing) {
      case "Linear": return t;
      case "EaseIn": return t * t * t;
      case "EaseOut": return 1 - Math.pow(1 - t, 3);
      case "EaseInOut":
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      default: return t;
    }
  }

  function lerpNumber(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp01(v) {
    if (typeof v !== "number" || isNaN(v)) return 1;
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  // Colour maths, alpha-aware. Mirrors src-tauri/src/model/color.rs -- the two
  // must agree, because Rust interpolates colours for exports while this runs in
  // the browser. See D7 section 1.
  //
  // Accepts #rgb, #rrggbb and #rrggbbaa. Returns null for anything else,
  // including the CSS keyword "transparent" that Hotspot uses as its default
  // fill: the old parser ran parseInt on it, got NaN, and fell back to 0, so
  // interpolating a hotspot's fill silently faded it through black.
  function parseColor(s) {
    if (typeof s !== "string") return null;
    var hex = s.trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]+$/.test(hex)) return null;

    function byte(i) { return parseInt(hex.substring(i, i + 2), 16); }
    // "f" -> "ff": shorthand nibbles double, they are not zero-padded.
    function nibble(i) { return parseInt(hex.substring(i, i + 1), 16) * 17; }

    if (hex.length === 3) return { r: nibble(0), g: nibble(1), b: nibble(2), a: 255 };
    if (hex.length === 6) return { r: byte(0), g: byte(2), b: byte(4), a: 255 };
    if (hex.length === 8) return { r: byte(0), g: byte(2), b: byte(4), a: byte(6) };
    return null;
  }

  function hex2(n) {
    var s = n.toString(16);
    return s.length === 1 ? "0" + s : s;
  }

  // Six digits when fully opaque, eight otherwise. The opaque case matters: it
  // keeps every existing project emitting byte-identical colours.
  function formatColor(c) {
    var base = "#" + hex2(c.r) + hex2(c.g) + hex2(c.b);
    return c.a === 255 ? base : base + hex2(c.a);
  }

  function lerpChannel(a, b, t) {
    var v = Math.round(a + (b - a) * t);
    return v < 0 ? 0 : (v > 255 ? 255 : v);
  }

  // Holds c1 when either side is not a hex colour. Together with interpolate()
  // returning the last keyframe's value at or past its time, that reads as a
  // snap at the later keyframe rather than a fade through black.
  function lerpColor(c1, c2, t) {
    var a = parseColor(c1);
    var b = parseColor(c2);
    if (!a || !b) return c1;
    return formatColor({
      r: lerpChannel(a.r, b.r, t),
      g: lerpChannel(a.g, b.g, t),
      b: lerpChannel(a.b, b.b, t),
      a: lerpChannel(a.a, b.a, t),
    });
  }

  // --- Gradients (D7 sections 2-4) ---
  // These mirror Gradient::is_paintable and Gradient::paintable_stops in
  // src-tauri/src/model/scene.rs.

  function isGradientValue(v) {
    return !!v && typeof v === "object" && Array.isArray(v.stops);
  }

  // A gradient needs two stops to paint anything; with fewer, callers fall back
  // to the flat colour.
  function isPaintableGradient(g) {
    return isGradientValue(g) && g.stops.length >= 2;
  }

  // Sorted by offset and clamped to 0..1. Both are safety, not cosmetics:
  // addColorStop throws outside 0..1, and out-of-order stops are undefined.
  function paintableStops(g) {
    return g.stops
      .map(function (s) {
        var o = typeof s.offset === "number" ? s.offset : 0;
        return { offset: o < 0 ? 0 : (o > 1 ? 1 : o), color: s.color };
      })
      .sort(function (a, b) { return a.offset - b.offset; });
  }

  function cloneGradient(g) {
    if (!isGradientValue(g)) return null;
    return {
      gradient_type: g.gradient_type,
      angle: typeof g.angle === "number" ? g.angle : 0,
      stops: g.stops.map(function (s) {
        return { offset: s.offset, color: s.color };
      }),
    };
  }

  // Build a canvas gradient spanning the box {x,y,w,h}.
  //
  // Angle is degrees clockwise with 0 = top to bottom (D7 section 3). Screen y
  // grows downward, so the direction vector for angle t is (-sin t, cos t): at
  // 0 that is (0,1), straight down, reproducing the top-to-bottom sweep both
  // renderers hardcoded before this field existed.
  //
  // The line is centred on the box and extended by the rectangle's support
  // along that direction, so the ramp spans the whole box at any angle instead
  // of running out at the corners.
  //
  // Takes ctx rather than closing over one, because canvas.js (the editor's
  // separate renderer) shares this. Duplicating it is how the Svg and
  // gradient-background gaps happened.
  function buildCanvasGradient(ctx, grad, box) {
    var stops = paintableStops(grad);
    var cx = box.x + box.w / 2;
    var cy = box.y + box.h / 2;
    var g;

    if (grad.gradient_type === "Radial") {
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(box.w, box.h) / 2);
    } else {
      var rad = (typeof grad.angle === "number" ? grad.angle : 0) * Math.PI / 180;
      var dx = -Math.sin(rad);
      var dy = Math.cos(rad);
      var half = (Math.abs(dx) * box.w + Math.abs(dy) * box.h) / 2;
      g = ctx.createLinearGradient(
        cx - dx * half, cy - dy * half,
        cx + dx * half, cy + dy * half
      );
    }

    for (var i = 0; i < stops.length; i++) {
      g.addColorStop(stops[i].offset, stops[i].color);
    }
    return g;
  }

  // A gradient wins over the flat colour when it can paint; otherwise the flat
  // colour stands, so a half-built gradient still shows something. Returns null
  // when there is nothing to paint at all.
  function gradientFillStyle(ctx, s, box) {
    if (isPaintableGradient(s.fill_gradient)) return buildCanvasGradient(ctx, s.fill_gradient, box);
    if (s.fill && s.fill !== "transparent") return s.fill;
    return null;
  }

  function gradientStrokeStyle(ctx, s, box) {
    if (isPaintableGradient(s.stroke_gradient)) return buildCanvasGradient(ctx, s.stroke_gradient, box);
    return s.stroke;
  }

  function boxOf(t) {
    return { x: t.x, y: t.y, w: t.width, h: t.height };
  }

  // Stop-by-stop, but only when both sides agree on type and stop count.
  // Resampling a 3-stop gradient onto a 5-stop one has no single right answer,
  // so mismatches hold the earlier value, which reads as a snap at the later
  // keyframe.
  function lerpGradient(g1, g2, t) {
    if (g1.gradient_type !== g2.gradient_type || g1.stops.length !== g2.stops.length) {
      return cloneGradient(g1);
    }
    var a1 = typeof g1.angle === "number" ? g1.angle : 0;
    var a2 = typeof g2.angle === "number" ? g2.angle : 0;
    return {
      gradient_type: g1.gradient_type,
      angle: a1 + (a2 - a1) * t,
      stops: g1.stops.map(function (s1, i) {
        var s2 = g2.stops[i];
        return {
          offset: s1.offset + (s2.offset - s1.offset) * t,
          color: lerpColor(s1.color, s2.color, t),
        };
      }),
    };
  }

  function getKeyframeValue(kv) {
    if (kv && typeof kv === "object" && "type" in kv) {
      return kv.value;
    }
    return kv;
  }

  function interpolate(keyframes, property, timeMs) {
    var relevant = [];
    for (var i = 0; i < keyframes.length; i++) {
      if (keyframes[i].property === property) {
        relevant.push(keyframes[i]);
      }
    }
    if (relevant.length === 0) return null;

    relevant.sort(function (a, b) { return a.time_ms - b.time_ms; });

    if (relevant.length === 1) {
      return getKeyframeValue(relevant[0].value);
    }

    var first = relevant[0];
    var last = relevant[relevant.length - 1];

    if (timeMs <= first.time_ms) return getKeyframeValue(first.value);
    if (timeMs >= last.time_ms) return getKeyframeValue(last.value);

    var before = first;
    var after = relevant[1];
    for (var i = 0; i < relevant.length - 1; i++) {
      if (relevant[i].time_ms <= timeMs && relevant[i + 1].time_ms >= timeMs) {
        before = relevant[i];
        after = relevant[i + 1];
        break;
      }
    }

    var duration = after.time_ms - before.time_ms;
    if (duration === 0) return getKeyframeValue(after.value);
    var rawT = (timeMs - before.time_ms) / duration;
    var t = applyEasing(rawT, after.easing);

    var bVal = getKeyframeValue(before.value);
    var aVal = getKeyframeValue(after.value);

    if (typeof bVal === "number" && typeof aVal === "number") {
      return lerpNumber(bVal, aVal, t);
    }
    if (typeof bVal === "string" && typeof aVal === "string" &&
        bVal.startsWith("#") && aVal.startsWith("#")) {
      return lerpColor(bVal, aVal, t);
    }
    // Gradient is a runtime value kind, unlike Offset/Scale which Rust resolves
    // away before a project reaches us. getKeyframeValue strips the {type,value}
    // wrapper, so a gradient arrives here as a bare object.
    if (isGradientValue(bVal) && isGradientValue(aVal)) {
      return lerpGradient(bVal, aVal, t);
    }
    if (typeof bVal === "boolean") {
      return rawT < 1.0 ? bVal : aVal;
    }
    return bVal;
  }

  function buildFilterString(filters) {
    if (!filters) return "none";
    var parts = [];
    if (filters.blur) parts.push("blur(" + filters.blur + "px)");
    if (filters.brightness !== null && filters.brightness !== undefined) parts.push("brightness(" + filters.brightness + ")");
    if (filters.contrast !== null && filters.contrast !== undefined) parts.push("contrast(" + filters.contrast + ")");
    if (filters.saturate !== null && filters.saturate !== undefined) parts.push("saturate(" + filters.saturate + ")");
    if (filters.hue_rotate) parts.push("hue-rotate(" + filters.hue_rotate + "deg)");
    if (filters.grayscale) parts.push("grayscale(" + filters.grayscale + ")");
    if (filters.sepia) parts.push("sepia(" + filters.sepia + ")");
    if (filters.drop_shadow) {
      var ds = filters.drop_shadow;
      parts.push("drop-shadow(" + ds.offset_x + "px " + ds.offset_y + "px " + ds.blur + "px " + ds.color + ")");
    }
    return parts.length > 0 ? parts.join(" ") : "none";
  }

  function cubicBezier(p0, p1, p2, p3, t) {
    var u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  }

  // Samples per segment for the arc-length table. A Bezier's curve parameter is
  // not proportional to distance travelled, so walking t linearly makes an object
  // crawl at the ends and race through the middle. We sample the curve, build a
  // cumulative distance table, then invert it to find the t for a given distance.
  var PATH_SAMPLES_PER_SEGMENT = 64;

  function segmentControls(a, b) {
    return {
      c1x: a.control_out ? a.control_out.x : a.x,
      c1y: a.control_out ? a.control_out.y : a.y,
      c2x: b.control_in ? b.control_in.x : b.x,
      c2y: b.control_in ? b.control_in.y : b.y,
    };
  }

  // For one segment: the sampled t values and the cumulative distance at each.
  function buildSegmentTable(a, b) {
    var c = segmentControls(a, b);
    var ts = [0];
    var dists = [0];
    var px = a.x, py = a.y, acc = 0;
    for (var s = 1; s <= PATH_SAMPLES_PER_SEGMENT; s++) {
      var t = s / PATH_SAMPLES_PER_SEGMENT;
      var nx = cubicBezier(a.x, c.c1x, c.c2x, b.x, t);
      var ny = cubicBezier(a.y, c.c1y, c.c2y, b.y, t);
      var dx = nx - px, dy = ny - py;
      acc += Math.sqrt(dx * dx + dy * dy);
      ts.push(t);
      dists.push(acc);
      px = nx; py = ny;
    }
    return { ts: ts, dists: dists, length: acc, ctrl: c };
  }

  // Invert the table: distance along the segment -> curve parameter t.
  function tForDistance(table, dist) {
    var dists = table.dists;
    if (dist <= 0) return 0;
    if (dist >= table.length) return 1;

    var lo = 0, hi = dists.length - 1;
    while (lo + 1 < hi) {
      var mid = (lo + hi) >> 1;
      if (dists[mid] <= dist) lo = mid; else hi = mid;
    }
    var span = dists[hi] - dists[lo];
    var frac = span > 0 ? (dist - dists[lo]) / span : 0;
    return table.ts[lo] + (table.ts[hi] - table.ts[lo]) * frac;
  }

  function evaluateMotionPath(path, progress) {
    if (!path || !path.points || path.points.length === 0) return null;
    if (path.points.length === 1) return { x: path.points[0].x, y: path.points[0].y };

    progress = Math.max(0, Math.min(1, progress));
    var n = path.points.length - 1;
    var tables = [];
    var totalLength = 0;

    for (var i = 0; i < n; i++) {
      var table = buildSegmentTable(path.points[i], path.points[i + 1]);
      tables.push(table);
      totalLength += table.length;
    }

    if (totalLength === 0) return { x: path.points[0].x, y: path.points[0].y };

    var targetDist = progress * totalLength;
    var accumulated = 0;
    for (var i = 0; i < n; i++) {
      var table = tables[i];
      if (accumulated + table.length >= targetDist || i === n - 1) {
        var localT = tForDistance(table, targetDist - accumulated);
        var a = path.points[i], b = path.points[i + 1];
        var c = table.ctrl;
        return {
          x: cubicBezier(a.x, c.c1x, c.c2x, b.x, localT),
          y: cubicBezier(a.y, c.c1y, c.c2y, b.y, localT),
        };
      }
      accumulated += table.length;
    }
    var last = path.points[n];
    return { x: last.x, y: last.y };
  }

  function cloneFilters(filters) {
    if (!filters) return null;
    var out = {};
    for (var k in filters) {
      if (!Object.prototype.hasOwnProperty.call(filters, k)) continue;
      var v = filters[k];
      // drop_shadow is the only nested object; copy it so resolving never
      // writes back into the source project.
      out[k] = (v && typeof v === "object") ? Object.assign({}, v) : v;
    }
    return out;
  }

  function resolveObjectAtTime(obj, timeMs) {
    var hiddenByLifespan =
      (obj.appear_at_ms !== null && obj.appear_at_ms !== undefined && timeMs < obj.appear_at_ms) ||
      (obj.disappear_at_ms !== null && obj.disappear_at_ms !== undefined && timeMs > obj.disappear_at_ms);

    var resolved = {
      id: obj.id,
      name: obj.name,
      object_type: obj.object_type,
      content: obj.content,
      visible: obj.visible,
      locked: obj.locked,
      z_index: obj.z_index,
      events: obj.events,
      motion_path: obj.motion_path || null,
      video_trim_start_ms: obj.video_trim_start_ms || 0,
      video_trim_end_ms: obj.video_trim_end_ms || null,
      video_muted: obj.video_muted !== false,
      audio_volume: obj.audio_volume !== undefined ? obj.audio_volume : 1.0,
      audio_loop: obj.audio_loop || false,
      text_wrap: obj.text_wrap || false,
      appear_at_ms: obj.appear_at_ms,
      disappear_at_ms: obj.disappear_at_ms,
      filters: cloneFilters(obj.filters),
      transform: {
        x: obj.transform.x,
        y: obj.transform.y,
        width: obj.transform.width,
        height: obj.transform.height,
        rotation: obj.transform.rotation,
        opacity: obj.transform.opacity,
      },
      style: {
        fill: obj.style.fill,
        // Rust serialises these as null rather than omitting them, matching how
        // Background.gradient already behaves. null and absent mean the same.
        fill_gradient: cloneGradient(obj.style.fill_gradient),
        stroke: obj.style.stroke,
        stroke_gradient: cloneGradient(obj.style.stroke_gradient),
        stroke_width: obj.style.stroke_width,
        font_family: obj.style.font_family,
        font_size: obj.style.font_size,
        font_weight: obj.style.font_weight,
        text_align: obj.style.text_align,
        line_height: obj.style.line_height,
        border_radius: obj.style.border_radius,
      },
      _typewriter_progress: null,
    };

    // Lifespan gates visibility but must still return a fully-formed object, so
    // name-keyed lookups and hit testing can still see it.
    if (hiddenByLifespan) {
      resolved.visible = false;
      return resolved;
    }

    if (!obj.keyframes || obj.keyframes.length === 0) return resolved;

    var props = [
      "transform.x", "transform.y", "transform.width", "transform.height",
      "transform.rotation", "transform.opacity",
      "style.fill", "style.stroke", "style.stroke_width",
      "style.fill_gradient", "style.stroke_gradient",
      "style.font_size", "style.border_radius",
      "filters.blur", "filters.brightness", "filters.contrast",
      "filters.saturate", "filters.hue_rotate", "filters.grayscale",
      "filters.sepia",
      "visible", "_typewriter_progress", "_path_progress", "audio_volume",
    ];

    var pathProgress = null;
    for (var i = 0; i < props.length; i++) {
      var prop = props[i];
      var val = interpolate(obj.keyframes, prop, timeMs);
      if (val === null) continue;

      if (prop === "visible") {
        resolved.visible = val;
      } else if (prop === "_typewriter_progress") {
        resolved._typewriter_progress = val;
      } else if (prop === "_path_progress") {
        pathProgress = val;
      } else if (prop === "audio_volume") {
        resolved.audio_volume = val;
      } else {
        var parts = prop.split(".");
        if (parts.length === 2) {
          // A filter keyframe on an object that declares no filters still has
          // to land somewhere.
          if (!resolved[parts[0]]) resolved[parts[0]] = {};
          // At or past a keyframe's own time, interpolate returns that
          // keyframe's value by reference. For a scalar that is harmless; for a
          // gradient it would hand the caller the source project's object and
          // let a mutation write straight back into it.
          resolved[parts[0]][parts[1]] =
            isGradientValue(val) ? cloneGradient(val) : val;
        }
      }
    }

    if (pathProgress !== null && obj.motion_path) {
      var pos = evaluateMotionPath(obj.motion_path, pathProgress);
      if (pos) {
        resolved.transform.x = pos.x - resolved.transform.width / 2;
        resolved.transform.y = pos.y - resolved.transform.height / 2;
      }
    }

    return resolved;
  }

  // --- Event system ---

  var eventState = {
    firedTimers: {},
    firedSceneEnds: {},
    hoveredObjectIds: {},
    runtimeVisibility: {},
    canvas: null,
    interactive: false,
  };

  function initEvents(canvasEl, interactive) {
    eventState.canvas = canvasEl;
    eventState.interactive = interactive;
    if (canvasEl && interactive) {
      canvasEl.addEventListener("click", onRuntimeClick);
      canvasEl.addEventListener("mousemove", onRuntimeMouseMove);
    }
  }

  function cleanupEvents() {
    if (eventState.canvas) {
      eventState.canvas.removeEventListener("click", onRuntimeClick);
      eventState.canvas.removeEventListener("mousemove", onRuntimeMouseMove);
    }
    eventState.firedTimers = {};
    eventState.firedSceneEnds = {};
    eventState.hoveredObjectIds = {};
    eventState.runtimeVisibility = {};
    eventState.canvas = null;
    eventState.interactive = false;
  }

  function resetEventState() {
    eventState.firedTimers = {};
    eventState.firedSceneEnds = {};
    eventState.hoveredObjectIds = {};
    eventState.runtimeVisibility = {};
  }

  // Hit testing has to see the objects as they are actually drawn: lifespan
  // applied, visible keyframes applied, transforms interpolated. Resolving the
  // whole scene per mousemove would be wasteful, so memoise on scene+time —
  // every pointer event between two frames shares one resolve.
  var hitCache = { sceneIndex: -1, timeMs: -1, objects: null };

  function resolvedObjectsForHitTest() {
    var scene = getCurrentScene();
    if (!scene) return [];
    if (hitCache.objects &&
        hitCache.sceneIndex === state.currentSceneIndex &&
        hitCache.timeMs === state.currentTimeMs) {
      return hitCache.objects;
    }
    var out = [];
    for (var i = 0; i < scene.objects.length; i++) {
      out.push(resolveObjectAtTime(scene.objects[i], state.currentTimeMs));
    }
    hitCache.sceneIndex = state.currentSceneIndex;
    hitCache.timeMs = state.currentTimeMs;
    hitCache.objects = out;
    return out;
  }

  function isHitVisible(obj) {
    return eventState.runtimeVisibility[obj.id] !== undefined
      ? eventState.runtimeVisibility[obj.id]
      : obj.visible;
  }

  function pointerStageCoords(e) {
    if (!eventState.canvas) return null;
    var rect = eventState.canvas.getBoundingClientRect();
    return runtimeScreenToStage(e.clientX - rect.left, e.clientY - rect.top);
  }

  function onRuntimeClick(e) {
    if (!state.isPlaying || !state.project) return;
    if (!getCurrentScene()) return;

    var stageCoords = pointerStageCoords(e);
    if (!stageCoords) return;

    var objects = resolvedObjectsForHitTest().slice().sort(function (a, b) {
      return b.z_index - a.z_index;
    });

    for (var i = 0; i < objects.length; i++) {
      var obj = objects[i];
      // A Hotspot is invisible on screen but still clickable; everything else
      // must be visible to receive the click.
      if (!isHitVisible(obj)) continue;

      if (runtimePointInRect(stageCoords.x, stageCoords.y, obj.transform)) {
        fireEventsForTrigger(obj, "Click");
        break;
      }
    }
  }

  function onRuntimeMouseMove(e) {
    if (!state.isPlaying || !state.project) return;
    if (!getCurrentScene()) return;

    var stageCoords = pointerStageCoords(e);
    if (!stageCoords) return;

    var objects = resolvedObjectsForHitTest();
    for (var i = 0; i < objects.length; i++) {
      var obj = objects[i];
      var inside = isHitVisible(obj) &&
        runtimePointInRect(stageCoords.x, stageCoords.y, obj.transform);
      var wasInside = !!eventState.hoveredObjectIds[obj.id];

      if (inside && !wasInside) {
        eventState.hoveredObjectIds[obj.id] = true;
        fireEventsForTrigger(obj, "HoverEnter");
      } else if (!inside && wasInside) {
        delete eventState.hoveredObjectIds[obj.id];
        fireEventsForTrigger(obj, "HoverLeave");
      }
    }
  }

  function runtimeScreenToStage(mx, my) {
    if (typeof CitCatCanvas !== "undefined" && CitCatCanvas.getPan) {
      var pan = CitCatCanvas.getPan();
      var zoom = CitCatCanvas.getZoom();
      return { x: (mx - pan.x) / zoom, y: (my - pan.y) / zoom };
    }
    if (state.project && eventState.canvas) {
      var rect = eventState.canvas.getBoundingClientRect();
      var canvasPixelX = mx * (eventState.canvas.width / rect.width);
      var canvasPixelY = my * (eventState.canvas.height / rect.height);
      var cw = eventState.canvas.width;
      var ch = eventState.canvas.height;
      var sw = state.project.meta.width;
      var sh = state.project.meta.height;
      var scale = Math.min(cw / sw, ch / sh);
      var ox = (cw - sw * scale) / 2;
      var oy = (ch - sh * scale) / 2;
      return { x: (canvasPixelX - ox) / scale, y: (canvasPixelY - oy) / scale };
    }
    return null;
  }

  function runtimePointInRect(px, py, t) {
    return px >= t.x && px <= t.x + t.width && py >= t.y && py <= t.y + t.height;
  }

  function fireEventsForTrigger(obj, triggerType) {
    if (!obj.events) return;
    for (var i = 0; i < obj.events.length; i++) {
      var ev = obj.events[i];
      var trigger = ev.trigger;
      if (trigger.type === triggerType || trigger === triggerType) {
        executeAction(ev.action);
      }
    }
  }

  function checkTimerTriggers(scene, timeMs) {
    for (var i = 0; i < scene.objects.length; i++) {
      var obj = scene.objects[i];
      if (!obj.events) continue;
      for (var j = 0; j < obj.events.length; j++) {
        var ev = obj.events[j];
        if (ev.trigger.type === "Timer") {
          var timerKey = obj.id + ":" + ev.id;
          if (!eventState.firedTimers[timerKey] && timeMs >= ev.trigger.delay_ms) {
            eventState.firedTimers[timerKey] = true;
            executeAction(ev.action);
          }
        }
      }
    }
  }

  function checkSceneEndTriggers(scene) {
    for (var i = 0; i < scene.objects.length; i++) {
      var obj = scene.objects[i];
      if (!obj.events) continue;
      for (var j = 0; j < obj.events.length; j++) {
        var ev = obj.events[j];
        if (ev.trigger.type === "SceneEnd" || ev.trigger === "SceneEnd") {
          // tick() re-enters this block every frame while a transition holds,
          // so gate it the same way timer triggers are gated.
          var endKey = obj.id + ":" + ev.id;
          if (!eventState.firedSceneEnds[endKey]) {
            eventState.firedSceneEnds[endKey] = true;
            executeAction(ev.action);
          }
        }
      }
    }
  }

  function executeAction(action) {
    if (!action || !state.project) return;

    switch (action.type) {
      case "GotoScene":
        var idx = state.project.scenes.findIndex(function (s) {
          return s.id === action.scene_id;
        });
        if (idx >= 0) {
          resetEventState();
          resetWaitFired();
          state.currentSceneIndex = idx;
          state.currentTimeMs = 0;
          if (state.onSceneChange) state.onSceneChange(idx);
          // A wait point halts the rAF chain; resetWaitFired() clears the flag but
          // the handler that would have rescheduled it was just removed. Restart here.
          if (state.isPlaying) {
            if (state.animFrameId) cancelAnimationFrame(state.animFrameId);
            state.lastFrameTime = performance.now();
            state.animFrameId = requestAnimationFrame(tick);
          }
        }
        break;

      case "ToggleVisible":
        var obj = findObjectById(action.object_id);
        if (obj) {
          var current = eventState.runtimeVisibility[obj.id] !== undefined
            ? eventState.runtimeVisibility[obj.id]
            : obj.visible;
          eventState.runtimeVisibility[obj.id] = !current;
        }
        break;

      case "PlayAnimation":
        // In this context, "play" means the object's keyframes animate normally
        // (they already do during playback, so this is a no-op for now;
        // per-object pause/play state can be added as a refinement)
        break;

      case "PauseAnimation":
        break;

      case "SetProperty":
        var obj = findObjectById(action.object_id);
        if (obj && action.property && action.value !== undefined) {
          var val = getKeyframeValue(action.value);
          var parts = action.property.split(".");
          if (parts.length === 2) {
            if (obj[parts[0]]) obj[parts[0]][parts[1]] = val;
          } else if (parts.length === 1) {
            obj[parts[0]] = val;
          }
        }
        break;
    }
  }

  function findObjectById(objectId) {
    var scene = getCurrentScene();
    if (!scene) return null;
    for (var i = 0; i < scene.objects.length; i++) {
      if (scene.objects[i].id === objectId) return scene.objects[i];
    }
    return null;
  }

  function getRuntimeVisibility(objId) {
    if (eventState.runtimeVisibility[objId] !== undefined) {
      return eventState.runtimeVisibility[objId];
    }
    return null;
  }

  // --- State ---

  // --- Wait point state ---

  var waitState = {
    waiting: false,
    waitPointId: null,
    firedWaitPoints: {},
    timerStart: 0,
    timerDelay: 0,
    waitClickHandler: null,
  };

  function resetWaitState() {
    if (waitState.waitClickHandler && eventState.canvas) {
      eventState.canvas.removeEventListener("click", waitState.waitClickHandler);
    }
    waitState.waiting = false;
    waitState.waitPointId = null;
    waitState.firedWaitPoints = {};
    waitState.timerStart = 0;
    waitState.timerDelay = 0;
    waitState.waitClickHandler = null;
  }

  function resetWaitFired() {
    if (waitState.waitClickHandler && eventState.canvas) {
      eventState.canvas.removeEventListener("click", waitState.waitClickHandler);
    }
    waitState.waiting = false;
    waitState.waitPointId = null;
    waitState.firedWaitPoints = {};
    waitState.timerStart = 0;
    waitState.timerDelay = 0;
    waitState.waitClickHandler = null;
  }

  function checkWaitPoints(scene, timeMs) {
    if (!scene.wait_points || scene.wait_points.length === 0) return false;
    if (waitState.waiting) return true;

    for (var i = 0; i < scene.wait_points.length; i++) {
      var wp = scene.wait_points[i];
      if (waitState.firedWaitPoints[wp.id]) continue;
      if (timeMs >= wp.time_ms) {
        waitState.waiting = true;
        waitState.waitPointId = wp.id;
        waitState.firedWaitPoints[wp.id] = true;
        state.currentTimeMs = wp.time_ms;
        startWaitResume(wp.resume_on);
        return true;
      }
    }
    return false;
  }

  function startWaitResume(resumeOn) {
    var type = resumeOn.type || resumeOn;

    if (type === "Timer") {
      waitState.timerStart = performance.now();
      waitState.timerDelay = resumeOn.delay_ms;
      requestAnimationFrame(waitTimerTick);
    } else if (type === "AnyClick") {
      installWaitClickHandler(null);
    } else if (type === "Click") {
      installWaitClickHandler(resumeOn.object_id);
    } else if (type === "ClickOrTimer") {
      waitState.timerStart = performance.now();
      waitState.timerDelay = resumeOn.delay_ms;
      installWaitClickHandler(resumeOn.object_id || null);
      requestAnimationFrame(waitTimerTick);
    }
  }

  function installWaitClickHandler(objectId) {
    var canvas = eventState.canvas;
    if (!canvas) return;

    waitState.waitClickHandler = function (e) {
      if (!waitState.waiting) return;

      if (objectId) {
        var stageCoords = pointerStageCoords(e);
        if (!stageCoords) return;
        if (!getCurrentScene()) return;

        // Match against the resolved object, so the target is hit where it is
        // drawn rather than where it was authored.
        var objects = resolvedObjectsForHitTest();
        var targetObj = null;
        for (var i = 0; i < objects.length; i++) {
          if (objects[i].id === objectId) {
            targetObj = objects[i];
            break;
          }
        }
        if (!targetObj) return;
        if (!runtimePointInRect(stageCoords.x, stageCoords.y, targetObj.transform)) return;
      }

      resumeFromWait();
    };
    canvas.addEventListener("click", waitState.waitClickHandler);
  }

  function waitTimerTick() {
    if (!waitState.waiting) return;
    var elapsed = performance.now() - waitState.timerStart;
    if (elapsed >= waitState.timerDelay) {
      resumeFromWait();
      return;
    }
    requestAnimationFrame(waitTimerTick);
  }

  function resumeFromWait() {
    if (waitState.waitClickHandler && eventState.canvas) {
      eventState.canvas.removeEventListener("click", waitState.waitClickHandler);
    }
    waitState.waiting = false;
    waitState.waitPointId = null;
    waitState.waitClickHandler = null;
    state.lastFrameTime = performance.now();
    state.animFrameId = requestAnimationFrame(tick);
  }

  function isWaiting() {
    return waitState.waiting;
  }

  function getWaitingAtMs() {
    if (waitState.waiting) return state.currentTimeMs;
    return null;
  }

  var state = {
    project: null,
    currentSceneIndex: 0,
    currentTimeMs: 0,
    isPlaying: false,
    lastFrameTime: 0,
    animFrameId: null,
    onTimeUpdate: null,
    onSceneChange: null,
    onPlayStateChange: null,
  };

  // <video> and <audio> elements live inside the renderStandalone closure, but
  // pause/stop/setProject are module level. A renderer registers here so those
  // can reach its elements -- without this, nothing ever calls pause() on a
  // track and a looping sound outlives the project that started it.
  var mediaHooks = [];

  function registerMediaHooks(hooks) {
    mediaHooks.push(hooks);
    return function () {
      var i = mediaHooks.indexOf(hooks);
      if (i >= 0) mediaHooks.splice(i, 1);
    };
  }

  function notifyMedia(name) {
    for (var i = 0; i < mediaHooks.length; i++) {
      var fn = mediaHooks[i][name];
      if (fn) {
        try { fn(); } catch (e) { /* one bad element must not stall playback */ }
      }
    }
  }

  function setProject(project) {
    // Elements belong to the old project; releasing them here stops a track
    // from playing on over the top of whatever is loaded next.
    notifyMedia("onDispose");
    state.project = project;
  }

  function getSceneAtIndex(index) {
    if (!state.project || index < 0 || index >= state.project.scenes.length) return null;
    return state.project.scenes[index];
  }

  function getCurrentScene() {
    return getSceneAtIndex(state.currentSceneIndex);
  }

  function play() {
    if (state.isPlaying) return;
    if (!state.project || state.project.scenes.length === 0) return;
    state.isPlaying = true;
    state.lastFrameTime = performance.now();
    state.animFrameId = requestAnimationFrame(tick);
    if (state.onPlayStateChange) state.onPlayStateChange(true);
  }

  function pause() {
    if (!state.isPlaying) return;
    state.isPlaying = false;
    if (state.animFrameId) {
      cancelAnimationFrame(state.animFrameId);
      state.animFrameId = null;
    }
    notifyMedia("onPause");
    if (state.onPlayStateChange) state.onPlayStateChange(false);
  }

  function stop() {
    pause();
    resetEventState();
    resetWaitFired();
    state.currentSceneIndex = 0;
    state.currentTimeMs = 0;
    // Rewind as well as pause: stop() returns the timeline to the start, so a
    // replay must restart its audio rather than resume it mid-track.
    notifyMedia("onStop");
    if (state.onTimeUpdate) state.onTimeUpdate(0, 0);
    if (state.onSceneChange) state.onSceneChange(0);
    if (state.onPlayStateChange) state.onPlayStateChange(false);
  }

  function seekTo(sceneIndex, timeMs) {
    if (!state.project) return;
    sceneIndex = Math.max(0, Math.min(sceneIndex, state.project.scenes.length - 1));
    var scene = getSceneAtIndex(sceneIndex);
    if (!scene) return;
    timeMs = Math.max(0, Math.min(timeMs, scene.duration_ms));
    var sceneChanged = sceneIndex !== state.currentSceneIndex;
    state.currentSceneIndex = sceneIndex;
    state.currentTimeMs = timeMs;
    if (sceneChanged && state.onSceneChange) state.onSceneChange(sceneIndex);
    if (state.onTimeUpdate) state.onTimeUpdate(sceneIndex, timeMs);
  }

  function tick(now) {
    if (!state.isPlaying) return;
    if (waitState.waiting) return;

    var elapsed = now - state.lastFrameTime;
    state.lastFrameTime = now;
    state.currentTimeMs += elapsed;

    var scene = getCurrentScene();
    if (!scene) {
      stop();
      return;
    }

    if (checkWaitPoints(scene, state.currentTimeMs)) {
      if (state.onTimeUpdate) state.onTimeUpdate(state.currentSceneIndex, state.currentTimeMs);
      return;
    }

    checkTimerTriggers(scene, state.currentTimeMs);

    if (state.currentTimeMs >= scene.duration_ms) {
      checkSceneEndTriggers(scene);

      var boundary = getBoundaryTransition(state.currentSceneIndex);
      var transitionDuration = boundary ? boundary.duration_ms : 0;
      var overflowTime = state.currentTimeMs - scene.duration_ms;

      if (overflowTime < transitionDuration) {
        if (state.onTimeUpdate) state.onTimeUpdate(state.currentSceneIndex, state.currentTimeMs);
        state.animFrameId = requestAnimationFrame(tick);
        return;
      }

      resetEventState();
      resetWaitFired();
      if (state.currentSceneIndex < state.project.scenes.length - 1) {
        state.currentSceneIndex++;
        state.currentTimeMs = 0;
        if (state.onSceneChange) state.onSceneChange(state.currentSceneIndex);
      } else {
        if (state.project.export_settings && state.project.export_settings.loop_playback) {
          state.currentSceneIndex = 0;
          state.currentTimeMs = 0;
          if (state.onSceneChange) state.onSceneChange(0);
        } else {
          stop();
          return;
        }
      }
    }

    if (state.onTimeUpdate) state.onTimeUpdate(state.currentSceneIndex, state.currentTimeMs);
    state.animFrameId = requestAnimationFrame(tick);
  }

  function getResolvedScene(sceneIndex, timeMs) {
    var scene = getSceneAtIndex(sceneIndex);
    if (!scene) return null;
    var objects = [];
    for (var i = 0; i < scene.objects.length; i++) {
      objects.push(resolveObjectAtTime(scene.objects[i], timeMs));
    }
    return {
      id: scene.id,
      name: scene.name,
      duration_ms: scene.duration_ms,
      background: scene.background,
      transition_in: scene.transition_in,
      transition_out: scene.transition_out,
      objects: objects,
      sort_order: scene.sort_order,
    };
  }

  // Which scene follows this one, honouring loop_playback. -1 when playback ends.
  function getNextSceneIndex(sceneIndex) {
    if (!state.project) return -1;
    if (sceneIndex < state.project.scenes.length - 1) return sceneIndex + 1;
    if (state.project.export_settings && state.project.export_settings.loop_playback) {
      return 0;
    }
    return -1;
  }

  // The transition that governs the boundary leaving sceneIndex.
  //
  // The incoming scene's transition_in wins; the outgoing scene's transition_out
  // is the fallback. An author building scene B decides how B enters without
  // having to edit scene A. Setting transition_in to Cut is meaningful: it means
  // "enter hard", and deliberately does not inherit A's transition_out.
  //
  // Returns null for a cut, or when there is no scene to transition into --
  // the last scene of a non-looping project has nothing to blend towards, so it
  // ends at duration_ms with no hold.
  function getBoundaryTransition(sceneIndex) {
    var nextIndex = getNextSceneIndex(sceneIndex);
    if (nextIndex < 0) return null;

    var outgoing = getSceneAtIndex(sceneIndex);
    var incoming = getSceneAtIndex(nextIndex);
    if (!outgoing || !incoming) return null;

    var chosen = incoming.transition_in || outgoing.transition_out || null;
    if (!chosen || chosen.kind === "Cut") return null;
    if (!chosen.duration_ms || chosen.duration_ms <= 0) return null;

    return {
      kind: chosen.kind,
      duration_ms: chosen.duration_ms,
      nextIndex: nextIndex,
      source: incoming.transition_in ? "transition_in" : "transition_out",
    };
  }

  function getTransitionState() {
    var scene = getCurrentScene();
    if (!scene) return null;
    if (state.currentTimeMs <= scene.duration_ms) return null;

    var boundary = getBoundaryTransition(state.currentSceneIndex);
    if (!boundary) return null;

    var overflowTime = state.currentTimeMs - scene.duration_ms;
    if (overflowTime >= boundary.duration_ms) return null;

    return {
      kind: boundary.kind,
      source: boundary.source,
      progress: overflowTime / boundary.duration_ms,
      outgoingScene: getResolvedScene(state.currentSceneIndex, scene.duration_ms),
      incomingScene: getResolvedScene(boundary.nextIndex, 0),
    };
  }

  // --- Standalone renderer for export ---

  function renderStandalone(canvasEl, assets) {
    var ctx = canvasEl.getContext("2d");
    var imgCache = {};
    var vidCache = {};
    var svgCache = {};

    // Images decode asynchronously. While playing, the next frame picks them up
    // on its own, but a paused first frame would stay blank forever without a
    // repaint when the decode lands.
    function loadAssetImage(src) {
      if (imgCache[src]) return imgCache[src];
      var img = new Image();
      img.onload = function () { renderFrame(); };
      if (assets && assets[src]) {
        img.src = assets[src];
      } else {
        img.src = src;
      }
      imgCache[src] = img;
      return img;
    }

    // An Svg object carries its markup inline rather than a path, so it is keyed
    // on the object and re-encoded when that markup changes.
    function loadSvgImage(obj) {
      var key = obj.id + ":" + obj.content.length;
      if (svgCache[key]) return svgCache[key];
      var img = new Image();
      img.onload = function () { renderFrame(); };
      img.src = "data:image/svg+xml;base64," +
        btoa(unescape(encodeURIComponent(obj.content)));
      svgCache[key] = img;
      return img;
    }

    function sourceFor(src) {
      return (assets && assets[src]) ? assets[src] : src;
    }

    // Keyed on the object, not the source URL. Trim is a per-object property,
    // so two objects reusing one clip need two elements with two playheads --
    // a URL-keyed cache silently gave them one, and one trim.
    function loadVideo(obj) {
      var v = vidCache[obj.id];
      if (v) return v;
      v = document.createElement("video");
      v.muted = obj.video_muted !== false;
      v.playsInline = true;
      v.preload = "auto";
      v.style.display = "none";
      // A paused scene paints once and never again, so without these the
      // placeholder would stand until something else moved the timeline.
      v.addEventListener("loadeddata", renderFrame);
      v.addEventListener("seeked", renderFrame);
      v.src = sourceFor(obj.content);
      document.body.appendChild(v);
      vidCache[obj.id] = v;
      return v;
    }

    // Where the clip should be, in its own timebase, for a given scene time.
    function videoTargetSeconds(obj, sceneTimeMs) {
      var startMs = obj.video_trim_start_ms || 0;
      var target = startMs + Math.max(0, sceneTimeMs);
      if (obj.video_trim_end_ms != null && target > obj.video_trim_end_ms) {
        target = obj.video_trim_end_ms;      // hold the last frame in range
      }
      return target / 1000;
    }

    // Chromium reports seekable [[0,0]] when the server does not honour HTTP
    // Range, and then silently ignores every currentTime assignment. Detect it
    // so playback can be driven instead of scrubbed, rather than freezing on
    // frame 0 with no explanation.
    function canSeek(v) {
      return v.seekable && v.seekable.length > 0 && v.seekable.end(v.seekable.length - 1) > 0;
    }

    var VIDEO_DRIFT_S = 0.15;

    function syncVideo(obj, v, sceneTimeMs) {
      if (v.readyState < 1) return;
      var want = videoTargetSeconds(obj, sceneTimeMs);
      var past = obj.video_trim_end_ms != null &&
                 (obj.video_trim_end_ms - (obj.video_trim_start_ms || 0)) < sceneTimeMs;

      if (!state.isPlaying || past) {
        if (!v.paused) v.pause();
        if (canSeek(v) && Math.abs(v.currentTime - want) > 0.01) v.currentTime = want;
        return;
      }
      // Playing: let the decoder carry the frames and only correct real drift.
      // Assigning currentTime every frame makes it stutter.
      if (canSeek(v) && Math.abs(v.currentTime - want) > VIDEO_DRIFT_S) v.currentTime = want;
      if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    }

    // --- animated GIF ---------------------------------------------------
    // An <img> that is not composited on screen does not advance its frames,
    // and drawImage copies whatever frame it is showing -- so a GIF drawn to a
    // canvas is frozen on frame 0. Decoding the frames ourselves is the only
    // way to animate one. ImageDecoder is Chromium-only today; elsewhere this
    // degrades to the static first frame, which is the old behaviour.
    var GIF_FRAME_CAP = 300;
    var gifCache = {};

    function isGif(src) {
      return /\.gif(\?|#|$)/i.test(src) || /^data:image\/gif[;,]/i.test(src);
    }

    function loadGif(src) {
      var g = gifCache[src];
      if (g) return g;
      g = { frames: null, totalMs: 0, failed: false };
      gifCache[src] = g;

      if (typeof ImageDecoder === "undefined") {
        g.failed = true;               // fall back to the <img> still
        return g;
      }

      fetch(sourceFor(src))
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (buf) {
          var dec = new ImageDecoder({ data: buf, type: "image/gif" });
          return dec.tracks.ready.then(function () {
            var track = dec.tracks.selectedTrack;
            var count = Math.min(track.frameCount, GIF_FRAME_CAP);
            if (!track.animated || count < 2) throw new Error("not animated");
            var frames = [];
            var chain = Promise.resolve();
            for (var i = 0; i < count; i++) {
              (function (idx) {
                chain = chain.then(function () {
                  return dec.decode({ frameIndex: idx }).then(function (res) {
                    var img = res.image;
                    // A VideoFrame holds decoder memory until closed; an
                    // ImageBitmap is a plain drawable we can keep.
                    var durMs = (img.duration || 100000) / 1000;
                    return createImageBitmap(img).then(function (bmp) {
                      img.close();
                      frames.push({ bmp: bmp, durMs: durMs });
                    });
                  });
                });
              })(i);
            }
            return chain.then(function () {
              g.frames = frames;
              g.totalMs = frames.reduce(function (a, f) { return a + f.durMs; }, 0);
              renderFrame();
            });
          });
        })
        .catch(function () { g.failed = true; });

      return g;
    }

    function gifFrameAt(g, timeMs) {
      if (!g.frames || !g.frames.length || g.totalMs <= 0) return null;
      var t = timeMs % g.totalMs;          // GIFs loop by default
      for (var i = 0; i < g.frames.length; i++) {
        if (t < g.frames[i].durMs) return g.frames[i].bmp;
        t -= g.frames[i].durMs;
      }
      return g.frames[g.frames.length - 1].bmp;
    }

    // --- audio ----------------------------------------------------------
    var audCache = {};
    function loadAudio(obj) {
      var a = audCache[obj.id];
      if (a) return a;
      a = document.createElement("audio");
      a.preload = "auto";
      a.volume = obj.audio_volume !== undefined && obj.audio_volume !== null
        ? clamp01(obj.audio_volume) : 1.0;
      a.loop = !!obj.audio_loop;
      a.style.display = "none";
      a.src = sourceFor(obj.content);
      // Attached like video: an element only the closure can reach cannot be
      // inspected, paused from outside, or released.
      document.body.appendChild(a);
      audCache[obj.id] = a;
      return a;
    }

    function eachMedia(fn) {
      var k;
      for (k in vidCache) if (vidCache.hasOwnProperty(k)) fn(vidCache[k]);
      for (k in audCache) if (audCache.hasOwnProperty(k)) fn(audCache[k]);
    }

    var unregisterMedia = registerMediaHooks({
      onPause: function () {
        eachMedia(function (el) { if (!el.paused) el.pause(); });
      },
      onStop: function () {
        eachMedia(function (el) {
          if (!el.paused) el.pause();
          try { el.currentTime = 0; } catch (e) { /* not seekable */ }
        });
      },
      onDispose: function () {
        eachMedia(function (el) {
          if (!el.paused) el.pause();
          el.removeAttribute("src");
          if (el.parentNode) el.parentNode.removeChild(el);
        });
        vidCache = {};
        audCache = {};
        for (var k in gifCache) {
          if (gifCache.hasOwnProperty(k) && gifCache[k].frames) {
            gifCache[k].frames.forEach(function (f) { f.bmp.close(); });
          }
        }
        gifCache = {};
        unregisterMedia();
      },
    });

    function roundRect(c, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      c.beginPath();
      c.moveTo(x + r, y);
      c.lineTo(x + w - r, y);
      c.quadraticCurveTo(x + w, y, x + w, y + r);
      c.lineTo(x + w, y + h - r);
      c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      c.lineTo(x + r, y + h);
      c.quadraticCurveTo(x, y + h, x, y + h - r);
      c.lineTo(x, y + r);
      c.quadraticCurveTo(x, y, x + r, y);
      c.closePath();
    }

    // Multiplied into every object's own opacity, so a whole scene can be
    // faded as one layer during a crossfade.
    var layerAlpha = 1;

    function makeGradient(grad, box) {
      return buildCanvasGradient(ctx, grad, box);
    }

    // A gradient wins over the flat colour when it can paint; otherwise the
    // flat colour stands, so an unfinished gradient still shows something.
    // Returns null when there is nothing to paint at all.
    function fillPaint(s, box) {
      return gradientFillStyle(ctx, s, box);
    }

    function strokePaint(s, box) {
      return gradientStrokeStyle(ctx, s, box);
    }

    function wrapText(text, maxWidth) {
      var paragraphs = text.split("\n");
      var result = [];
      for (var p = 0; p < paragraphs.length; p++) {
        var words = paragraphs[p].split(" ");
        var line = "";
        for (var w = 0; w < words.length; w++) {
          var test = line ? line + " " + words[w] : words[w];
          if (ctx.measureText(test).width > maxWidth && line) {
            result.push(line);
            line = words[w];
          } else {
            line = test;
          }
        }
        result.push(line);
      }
      return result;
    }

    function renderObj(obj) {
      var t = obj.transform;
      var s = obj.style;
      ctx.save();
      if (t.rotation !== 0) {
        var cx = t.x + t.width / 2;
        var cy = t.y + t.height / 2;
        ctx.translate(cx, cy);
        ctx.rotate(t.rotation * Math.PI / 180);
        ctx.translate(-cx, -cy);
      }
      // Canvas *ignores* an out-of-range globalAlpha rather than clamping it,
      // silently keeping whatever the previous object left behind. Nothing
      // upstream constrains opacity -- not the model, not the effect resolver --
      // so a hand-authored keyframe or a plugin offset can land outside 0..1.
      // Clamp here, the last point where it can still be caught.
      ctx.globalAlpha = clamp01(t.opacity) * layerAlpha;

      if (obj.filters) {
        ctx.filter = buildFilterString(obj.filters);
      }

      switch (obj.object_type) {
        case "Text":
          ctx.font = s.font_weight + " " + s.font_size + "px " + s.font_family;
          ctx.fillStyle = fillPaint(s, boxOf(t)) || s.fill;
          ctx.textBaseline = "top";
          var align = s.text_align || "Left";
          ctx.textAlign = align === "Center" ? "center" : align === "Right" ? "right" : "left";
          var content = obj.content || "";
          if (obj._typewriter_progress !== null && obj._typewriter_progress !== undefined) {
            content = content.substring(0, Math.floor(content.length * obj._typewriter_progress));
          }
          var lines = obj.text_wrap ? wrapText(content, t.width) : content.split("\n");
          var lh = s.font_size * s.line_height;
          var tx = t.x;
          if (align === "Center") tx = t.x + t.width / 2;
          else if (align === "Right") tx = t.x + t.width;
          for (var li = 0; li < lines.length; li++) {
            ctx.fillText(lines[li], tx, t.y + li * lh);
          }
          break;
        case "Rect":
          var r = s.border_radius || 0;
          var rectBox = boxOf(t);
          var rectFill = fillPaint(s, rectBox);
          if (r > 0) {
            roundRect(ctx, t.x, t.y, t.width, t.height, r);
            if (rectFill) { ctx.fillStyle = rectFill; ctx.fill(); }
            if (s.stroke_width > 0) { ctx.strokeStyle = strokePaint(s, rectBox); ctx.lineWidth = s.stroke_width; ctx.stroke(); }
          } else {
            if (rectFill) { ctx.fillStyle = rectFill; ctx.fillRect(t.x, t.y, t.width, t.height); }
            if (s.stroke_width > 0) { ctx.strokeStyle = strokePaint(s, rectBox); ctx.lineWidth = s.stroke_width; ctx.strokeRect(t.x, t.y, t.width, t.height); }
          }
          break;
        case "Ellipse":
          var ellBox = boxOf(t);
          var ellFill = fillPaint(s, ellBox);
          ctx.beginPath();
          ctx.ellipse(t.x + t.width / 2, t.y + t.height / 2, t.width / 2, t.height / 2, 0, 0, Math.PI * 2);
          if (ellFill) { ctx.fillStyle = ellFill; ctx.fill(); }
          if (s.stroke_width > 0) { ctx.strokeStyle = strokePaint(s, ellBox); ctx.lineWidth = s.stroke_width; ctx.stroke(); }
          break;
        case "Image":
          if (obj.content) {
            // An animated GIF is drawn from decoded frames; everything else,
            // including a GIF we could not decode, falls back to the <img>.
            var frame = null;
            if (isGif(obj.content)) {
              var g = loadGif(obj.content);
              if (!g.failed) frame = gifFrameAt(g, state.currentTimeMs);
            }
            if (frame) {
              ctx.drawImage(frame, t.x, t.y, t.width, t.height);
            } else {
              var img = loadAssetImage(obj.content);
              if (img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, t.x, t.y, t.width, t.height);
              }
            }
          }
          break;
        case "Video":
          if (obj.content) {
            var vid = loadVideo(obj);
            syncVideo(obj, vid, state.currentTimeMs);
            if (vid.readyState >= 2) {
              ctx.drawImage(vid, t.x, t.y, t.width, t.height);
            } else {
              ctx.fillStyle = "#222";
              ctx.fillRect(t.x, t.y, t.width, t.height);
            }
          }
          break;
        case "Button":
          var btnBox = boxOf(t);
          roundRect(ctx, t.x, t.y, t.width, t.height, s.border_radius || 8);
          ctx.fillStyle = fillPaint(s, btnBox) || s.fill; ctx.fill();
          if (s.stroke_width > 0) { ctx.strokeStyle = strokePaint(s, btnBox); ctx.lineWidth = s.stroke_width; ctx.stroke(); }
          ctx.font = s.font_weight + " " + s.font_size + "px " + s.font_family;
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          var btnTxt = obj.content || "";
          if (obj._typewriter_progress !== null && obj._typewriter_progress !== undefined) {
            btnTxt = btnTxt.substring(0, Math.floor(btnTxt.length * obj._typewriter_progress));
          }
          ctx.fillText(btnTxt, t.x + t.width / 2, t.y + t.height / 2);
          ctx.textAlign = "left"; ctx.textBaseline = "top";
          break;
        case "Svg":
          if (obj.content) {
            var svgImg = loadSvgImage(obj);
            if (svgImg.complete && svgImg.naturalWidth > 0) {
              ctx.drawImage(svgImg, t.x, t.y, t.width, t.height);
            }
          }
          break;
        case "Hotspot":
          break;
      }
      if (obj.filters) {
        ctx.filter = "none";
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // A scene background is an image, or a gradient, or a flat colour, in that
    // order of precedence. Anything but the flat colour used to be dropped here,
    // so gradient backgrounds rendered flat in every export.
    function paintBackground(bg, sw, sh) {
      if (bg.image) {
        var img = loadAssetImage(bg.image);
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, 0, 0, sw, sh);
          return;
        }
      }
      if (isPaintableGradient(bg.gradient)) {
        // Same builder as object gradients, so a background honours angle and
        // clamps its stops identically. The box is the whole stage.
        ctx.fillStyle = makeGradient(bg.gradient, { x: 0, y: 0, w: sw, h: sh });
        ctx.fillRect(0, 0, sw, sh);
        return;
      }
      ctx.fillStyle = bg.fill || "#ffffff";
      ctx.fillRect(0, 0, sw, sh);
    }

    // Paint one resolved scene into the current transform: background, then
    // objects in z order.
    function paintScene(resolved, bg, sw, sh) {
      if (bg) {
        ctx.save();
        ctx.globalAlpha = layerAlpha;
        paintBackground(bg, sw, sh);
        ctx.restore();
      }
      if (!resolved) return;

      var objects = resolved.objects.slice().sort(function (a, b) { return a.z_index - b.z_index; });
      for (var i = 0; i < objects.length; i++) {
        var obj = objects[i];
        var vis = getRuntimeVisibility(obj.id);
        if (vis !== null) obj.visible = vis;
        if (!obj.visible) continue;
        if (obj.object_type === "Hotspot") continue;
        if (obj.object_type === "Audio") {
          if (obj.content) {
            // Created even while paused, so volume and loop keyframes settle
            // and the element exists to be paused. Pausing itself is driven by
            // the media hooks, not from here -- this branch only runs while
            // playing, which is exactly when a pause must not be missed.
            var aud = loadAudio(obj);
            aud.loop = !!obj.audio_loop;
            aud.volume = obj.audio_volume !== undefined && obj.audio_volume !== null
              ? clamp01(obj.audio_volume) : 1.0;
            if (state.isPlaying && aud.paused) {
              var ap = aud.play();
              if (ap && ap.catch) ap.catch(function () {});
            }
          }
          continue;
        }
        renderObj(obj);
      }
    }

    function sceneBg(resolved) {
      return resolved && resolved.background ? resolved.background : null;
    }

    // Composite the outgoing and incoming scenes according to the transition
    // kind. Without this every transition looks like a Cut.
    function paintTransition(trans, sw, sh) {
      var p = trans.progress;
      var out = trans.outgoingScene;
      var inc = trans.incomingScene;
      var outBg = sceneBg(out);
      var incBg = sceneBg(inc);

      switch (trans.kind) {
        case "Crossfade":
          paintScene(out, outBg, sw, sh);
          layerAlpha = p;
          paintScene(inc, incBg, sw, sh);
          layerAlpha = 1;
          break;

        case "WipeLeft":
          paintScene(out, outBg, sw, sh);
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, sw * p, sh);
          ctx.clip();
          paintScene(inc, incBg, sw, sh);
          ctx.restore();
          break;

        case "WipeRight":
          paintScene(out, outBg, sw, sh);
          ctx.save();
          ctx.beginPath();
          ctx.rect(sw * (1 - p), 0, sw * p, sh);
          ctx.clip();
          paintScene(inc, incBg, sw, sh);
          ctx.restore();
          break;

        // Anchored the way WipeLeft/WipeRight are: the named edge is where the
        // incoming scene appears, and the boundary travels away from it.
        case "WipeUp":
          paintScene(out, outBg, sw, sh);
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, sw, sh * p);
          ctx.clip();
          paintScene(inc, incBg, sw, sh);
          ctx.restore();
          break;

        case "WipeDown":
          paintScene(out, outBg, sw, sh);
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, sh * (1 - p), sw, sh * p);
          ctx.clip();
          paintScene(inc, incBg, sw, sh);
          ctx.restore();
          break;

        case "SlideLeft":
          ctx.save(); ctx.translate(-sw * p, 0);
          paintScene(out, outBg, sw, sh); ctx.restore();
          ctx.save(); ctx.translate(sw * (1 - p), 0);
          paintScene(inc, incBg, sw, sh); ctx.restore();
          break;

        case "SlideRight":
          ctx.save(); ctx.translate(sw * p, 0);
          paintScene(out, outBg, sw, sh); ctx.restore();
          ctx.save(); ctx.translate(-sw * (1 - p), 0);
          paintScene(inc, incBg, sw, sh); ctx.restore();
          break;

        default:
          paintScene(out, outBg, sw, sh);
      }
    }

    function renderFrame() {
      var scene = getCurrentScene();
      if (!scene) return;
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

      var sw = state.project.meta.width;
      var sh = state.project.meta.height;
      var cw = canvasEl.width;
      var ch = canvasEl.height;
      var scale = Math.min(cw / sw, ch / sh);
      var ox = (cw - sw * scale) / 2;
      var oy = (ch - sh * scale) / 2;

      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);

      var trans = getTransitionState();
      if (trans) {
        paintTransition(trans, sw, sh);
      } else {
        paintScene(
          getResolvedScene(state.currentSceneIndex, state.currentTimeMs),
          scene.background, sw, sh
        );
      }

      // Render subtitles
      if (scene.subtitle_track && scene.subtitle_track.entries) {
        var activeEntry = null;
        for (var si = 0; si < scene.subtitle_track.entries.length; si++) {
          var e = scene.subtitle_track.entries[si];
          if (state.currentTimeMs >= e.start_ms && state.currentTimeMs <= e.end_ms) {
            activeEntry = e;
            break;
          }
        }
        if (activeEntry) {
          var fontSize = 28;
          var padding = 8;
          ctx.font = "600 " + fontSize + "px system-ui";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          var lines = activeEntry.text.split("\n");
          var totalHeight = lines.length * (fontSize * 1.3) + padding * 2;
          var subY = sh - 40;
          ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
          var maxW = 0;
          for (var li = 0; li < lines.length; li++) {
            var w = ctx.measureText(lines[li]).width;
            if (w > maxW) maxW = w;
          }
          ctx.fillRect(sw / 2 - maxW / 2 - padding * 2, subY - totalHeight, maxW + padding * 4, totalHeight + padding);
          ctx.fillStyle = "#ffffff";
          for (var li = lines.length - 1; li >= 0; li--) {
            ctx.fillText(lines[li], sw / 2, subY - (lines.length - 1 - li) * (fontSize * 1.3));
          }
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
        }
      }

      ctx.restore();
    }

    var origOnTimeUpdate = state.onTimeUpdate;
    state.onTimeUpdate = function (si, ms) {
      renderFrame();
      if (origOnTimeUpdate) origOnTimeUpdate(si, ms);
    };

    state.onPlayStateChange = function (playing) {
      if (!playing) renderFrame();
    };

    state.onSceneChange = function () {
      renderFrame();
    };

    renderFrame();
  }

  return {
    interpolate: interpolate,
    resolveObjectAtTime: resolveObjectAtTime,
    evaluateMotionPath: evaluateMotionPath,
    setProject: setProject,
    play: play,
    pause: pause,
    stop: stop,
    seekTo: seekTo,
    getCurrentScene: getCurrentScene,
    getResolvedScene: getResolvedScene,
    getTransitionState: getTransitionState,
    getBoundaryTransition: getBoundaryTransition,
    getNextSceneIndex: getNextSceneIndex,
    initEvents: initEvents,
    cleanupEvents: cleanupEvents,
    getRuntimeVisibility: getRuntimeVisibility,
    renderStandalone: renderStandalone,
    isWaiting: isWaiting,
    getWaitingAtMs: getWaitingAtMs,
    state: state,
    // Shared with src/js/canvas.js, the editor's separate renderer, so the two
    // cannot disagree about colours or gradient geometry.
    parseColor: parseColor,
    formatColor: formatColor,
    lerpColor: lerpColor,
    isPaintableGradient: isPaintableGradient,
    paintableStops: paintableStops,
    buildCanvasGradient: buildCanvasGradient,
    gradientFillStyle: gradientFillStyle,
    gradientStrokeStyle: gradientStrokeStyle,
    boxOf: boxOf,
  };
})();

if (typeof window !== "undefined" && !window.__TAURI__) {
  var _engine = CitCatRuntime;
  window.CitCatRuntime = function (canvas, project, assets) {
    _engine.setProject(project);
    _engine.renderStandalone(canvas, assets);
    _engine.initEvents(canvas, true);
    this.play = function () { _engine.play(); };
    this.pause = function () { _engine.pause(); };
    this.stop = function () { _engine.stop(); };
    this.seekTo = function (si, ms) { _engine.seekTo(si, ms); };
  };
}
