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

  function parseHex(hex) {
    hex = hex.replace("#", "");
    return {
      r: parseInt(hex.substring(0, 2), 16) || 0,
      g: parseInt(hex.substring(2, 4), 16) || 0,
      b: parseInt(hex.substring(4, 6), 16) || 0,
    };
  }

  function lerpColor(c1, c2, t) {
    var a = parseHex(c1);
    var b = parseHex(c2);
    var r = Math.round(a.r + (b.r - a.r) * t);
    var g = Math.round(a.g + (b.g - a.g) * t);
    var bl = Math.round(a.b + (b.b - a.b) * t);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
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
        stroke: obj.style.stroke,
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
          resolved[parts[0]][parts[1]] = val;
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

  function setProject(project) {
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
    if (state.onPlayStateChange) state.onPlayStateChange(false);
  }

  function stop() {
    pause();
    resetEventState();
    resetWaitFired();
    state.currentSceneIndex = 0;
    state.currentTimeMs = 0;
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

      var hasTransition = scene.transition_out && scene.transition_out.kind !== "Cut";
      var transitionDuration = hasTransition ? scene.transition_out.duration_ms : 0;
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

  function getTransitionState() {
    var scene = getCurrentScene();
    if (!scene) return null;
    if (state.currentTimeMs <= scene.duration_ms) return null;

    var hasTransition = scene.transition_out && scene.transition_out.kind !== "Cut";
    if (!hasTransition) return null;

    var overflowTime = state.currentTimeMs - scene.duration_ms;
    var transitionDuration = scene.transition_out.duration_ms;
    if (overflowTime >= transitionDuration) return null;

    var nextIndex = state.currentSceneIndex + 1;
    if (nextIndex >= state.project.scenes.length) return null;

    return {
      kind: scene.transition_out.kind,
      progress: overflowTime / transitionDuration,
      outgoingScene: getResolvedScene(state.currentSceneIndex, scene.duration_ms),
      incomingScene: getResolvedScene(nextIndex, 0),
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

    function loadVideo(src, muted) {
      if (vidCache[src]) return vidCache[src];
      var vid = document.createElement("video");
      vid.muted = muted !== false;
      vid.playsInline = true;
      vid.preload = "auto";
      vid.style.display = "none";
      if (assets && assets[src]) {
        vid.src = assets[src];
      } else {
        vid.src = src;
      }
      document.body.appendChild(vid);
      vidCache[src] = vid;
      return vid;
    }

    var audCache = {};
    function loadAudio(src, volume, loop) {
      if (audCache[src]) return audCache[src];
      var aud = document.createElement("audio");
      aud.preload = "auto";
      aud.volume = volume !== undefined ? volume : 1.0;
      aud.loop = !!loop;
      if (assets && assets[src]) {
        aud.src = assets[src];
      } else {
        aud.src = src;
      }
      audCache[src] = aud;
      return aud;
    }

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
      ctx.globalAlpha = t.opacity * layerAlpha;

      if (obj.filters) {
        ctx.filter = buildFilterString(obj.filters);
      }

      switch (obj.object_type) {
        case "Text":
          ctx.font = s.font_weight + " " + s.font_size + "px " + s.font_family;
          ctx.fillStyle = s.fill;
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
          if (r > 0) {
            roundRect(ctx, t.x, t.y, t.width, t.height, r);
            if (s.fill && s.fill !== "transparent") { ctx.fillStyle = s.fill; ctx.fill(); }
            if (s.stroke_width > 0) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.stroke_width; ctx.stroke(); }
          } else {
            if (s.fill && s.fill !== "transparent") { ctx.fillStyle = s.fill; ctx.fillRect(t.x, t.y, t.width, t.height); }
            if (s.stroke_width > 0) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.stroke_width; ctx.strokeRect(t.x, t.y, t.width, t.height); }
          }
          break;
        case "Ellipse":
          ctx.beginPath();
          ctx.ellipse(t.x + t.width / 2, t.y + t.height / 2, t.width / 2, t.height / 2, 0, 0, Math.PI * 2);
          if (s.fill && s.fill !== "transparent") { ctx.fillStyle = s.fill; ctx.fill(); }
          if (s.stroke_width > 0) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.stroke_width; ctx.stroke(); }
          break;
        case "Image":
          if (obj.content) {
            var img = loadAssetImage(obj.content);
            if (img.complete && img.naturalWidth > 0) {
              ctx.drawImage(img, t.x, t.y, t.width, t.height);
            }
          }
          break;
        case "Video":
          if (obj.content) {
            var muted = obj.video_muted !== false;
            var vid = loadVideo(obj.content, muted);
            if (vid.readyState >= 2) {
              ctx.drawImage(vid, t.x, t.y, t.width, t.height);
            } else {
              ctx.fillStyle = "#222";
              ctx.fillRect(t.x, t.y, t.width, t.height);
            }
          }
          break;
        case "Button":
          roundRect(ctx, t.x, t.y, t.width, t.height, s.border_radius || 8);
          ctx.fillStyle = s.fill; ctx.fill();
          if (s.stroke_width > 0) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.stroke_width; ctx.stroke(); }
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
      if (bg.gradient && bg.gradient.stops && bg.gradient.stops.length >= 2) {
        var grad;
        if (bg.gradient.gradient_type === "Radial") {
          grad = ctx.createRadialGradient(
            sw / 2, sh / 2, 0,
            sw / 2, sh / 2, Math.max(sw, sh) / 2
          );
        } else {
          grad = ctx.createLinearGradient(0, 0, 0, sh);
        }
        for (var i = 0; i < bg.gradient.stops.length; i++) {
          grad.addColorStop(bg.gradient.stops[i].offset, bg.gradient.stops[i].color);
        }
        ctx.fillStyle = grad;
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
          if (obj.content && state.isPlaying) {
            var aud = loadAudio(obj.content, obj.audio_volume, obj.audio_loop);
            if (aud.paused) aud.play().catch(function(){});
            aud.volume = obj.audio_volume !== undefined ? obj.audio_volume : 1.0;
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
    initEvents: initEvents,
    cleanupEvents: cleanupEvents,
    getRuntimeVisibility: getRuntimeVisibility,
    renderStandalone: renderStandalone,
    isWaiting: isWaiting,
    getWaitingAtMs: getWaitingAtMs,
    state: state,
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
