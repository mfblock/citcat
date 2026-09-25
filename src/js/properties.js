var CitCatProperties = (function () {
  var currentObj = null;
  var updating = false;
  var fillPaint = null;
  var strokePaint = null;
  var bgPaint = null;

  function init() {
    var fields = [
      "prop-x", "prop-y", "prop-w", "prop-h", "prop-rotation",
      "prop-opacity", "prop-opacity-slider",
      "prop-stroke-width", "prop-border-radius",
      "prop-font-family", "prop-font-size", "prop-font-weight",
    ];

    fields.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", onFieldChange);
      el.addEventListener("change", onFieldChange);
    });

    document.getElementById("prop-name").addEventListener("change", function () {
      if (!currentObj || updating) return;
      CitCatApp.updateObjectField("name", this.value);
    });

    document.getElementById("prop-content").addEventListener("input", function () {
      if (!currentObj || updating) return;
      CitCatApp.updateObjectField("content", this.value);
    });

    document.querySelectorAll(".align-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!currentObj || updating) return;
        document.querySelectorAll(".align-btn").forEach(function (b) {
          b.classList.remove("active");
        });
        this.classList.add("active");
        CitCatApp.updateStyleField("text_align", this.dataset.align);
      });
    });

    document.getElementById("z-front").addEventListener("click", function () {
      CitCatApp.reorderObject("front");
    });
    document.getElementById("z-up").addEventListener("click", function () {
      CitCatApp.reorderObject("up");
    });
    document.getElementById("z-down").addEventListener("click", function () {
      CitCatApp.reorderObject("down");
    });
    document.getElementById("z-back").addEventListener("click", function () {
      CitCatApp.reorderObject("back");
    });

    initEventUI();
    initPaintUI();

    var videoChangeBtn = document.getElementById("btn-video-change");
    if (videoChangeBtn) {
      videoChangeBtn.addEventListener("click", function () {
        if (!currentObj) return;
        window.__TAURI__.core.invoke("dialog_open_video").then(function (path) {
          if (!path) return;
          CitCatApp.pushUndo("change video");
          CitCatApp.updateObjectField("content", path);
        });
      });
    }

    var videoTrimStart = document.getElementById("prop-video-trim-start");
    if (videoTrimStart) {
      videoTrimStart.addEventListener("change", function () {
        if (!currentObj || updating) return;
        var val = parseInt(this.value) || 0;
        window.__TAURI__.core.invoke("object_update", {
          sceneId: null, objectId: currentObj.id,
          videoTrimStartMs: val,
        });
        currentObj.video_trim_start_ms = val;
      });
    }

    var videoTrimEnd = document.getElementById("prop-video-trim-end");
    if (videoTrimEnd) {
      videoTrimEnd.addEventListener("change", function () {
        if (!currentObj || updating) return;
        var raw = this.value.trim();
        var val = raw === "" ? null : parseInt(raw) || null;
        window.__TAURI__.core.invoke("object_update", {
          sceneId: null, objectId: currentObj.id,
          videoTrimEndMs: val,
        });
        currentObj.video_trim_end_ms = val;
      });
    }

    var videoMuted = document.getElementById("prop-video-muted");
    if (videoMuted) {
      videoMuted.addEventListener("change", function () {
        if (!currentObj || updating) return;
        window.__TAURI__.core.invoke("object_update", {
          sceneId: null, objectId: currentObj.id,
          videoMuted: this.checked,
        });
        currentObj.video_muted = this.checked;
      });
    }

    var audioChangeBtn = document.getElementById("btn-audio-change");
    if (audioChangeBtn) {
      audioChangeBtn.addEventListener("click", function () {
        if (!currentObj) return;
        window.__TAURI__.core.invoke("dialog_open_audio").then(function (path) {
          if (!path) return;
          CitCatApp.pushUndo("change audio");
          CitCatApp.updateObjectField("content", path);
        });
      });
    }

    var audioVolume = document.getElementById("prop-audio-volume");
    if (audioVolume) {
      audioVolume.addEventListener("input", function () {
        if (!currentObj || updating) return;
        var val = parseInt(this.value) || 100;
        document.getElementById("audio-volume-display").textContent = val + "%";
        var normalized = val / 100;
        window.__TAURI__.core.invoke("object_update", {
          sceneId: null, objectId: currentObj.id,
          audioVolume: normalized,
        });
        currentObj.audio_volume = normalized;
      });
    }

    var audioLoop = document.getElementById("prop-audio-loop");
    if (audioLoop) {
      audioLoop.addEventListener("change", function () {
        if (!currentObj || updating) return;
        window.__TAURI__.core.invoke("object_update", {
          sceneId: null, objectId: currentObj.id,
          audioLoop: this.checked,
        });
        currentObj.audio_loop = this.checked;
      });
    }

    var textWrap = document.getElementById("prop-text-wrap");
    if (textWrap) {
      textWrap.addEventListener("change", function () {
        if (!currentObj || updating) return;
        window.__TAURI__.core.invoke("object_update", {
          sceneId: null, objectId: currentObj.id,
          textWrap: this.checked,
        });
        currentObj.text_wrap = this.checked;
        CitCatApp.requestRender();
      });
    }

    var appearAt = document.getElementById("prop-appear-at");
    if (appearAt) {
      appearAt.addEventListener("change", function () {
        if (!currentObj || updating) return;
        var raw = this.value.trim();
        var val = raw === "" ? null : parseInt(raw) || null;
        window.__TAURI__.core.invoke("object_update", {
          sceneId: null, objectId: currentObj.id,
          appearAtMs: val,
        });
        currentObj.appear_at_ms = val;
        CitCatApp.requestRender();
      });
    }

    var disappearAt = document.getElementById("prop-disappear-at");
    if (disappearAt) {
      disappearAt.addEventListener("change", function () {
        if (!currentObj || updating) return;
        var raw = this.value.trim();
        var val = raw === "" ? null : parseInt(raw) || null;
        window.__TAURI__.core.invoke("object_update", {
          sceneId: null, objectId: currentObj.id,
          disappearAtMs: val,
        });
        currentObj.disappear_at_ms = val;
        CitCatApp.requestRender();
      });
    }

    var clearPathBtn = document.getElementById("btn-clear-path");
    if (clearPathBtn) {
      clearPathBtn.addEventListener("click", function () {
        var obj = CitCatApp.getSelectedObject();
        if (obj) CitCatApp.clearMotionPath(obj);
      });
    }

    var addBindingBtn = document.getElementById("btn-add-binding");
    if (addBindingBtn) {
      addBindingBtn.addEventListener("click", function () {
        var prop = document.getElementById("binding-property").value;
        var col = document.getElementById("binding-column").value.trim();
        if (!prop || !col) return;
        CitCatApp.addBinding(prop, col, { type: "None" }).then(function () {
          showBindings(currentObj);
          document.getElementById("binding-column").value = "";
        });
      });
    }

    var setCondBtn = document.getElementById("btn-set-condition");
    if (setCondBtn) {
      setCondBtn.addEventListener("click", function () {
        var col = document.getElementById("cond-column").value.trim();
        var op = document.getElementById("cond-operator").value;
        var val = document.getElementById("cond-value").value;
        if (!col) {
          CitCatApp.setCondition(null);
        } else {
          CitCatApp.setCondition({ column: col, operator: op, value: val });
        }
      });
    }

    var clearCondBtn = document.getElementById("btn-clear-condition");
    if (clearCondBtn) {
      clearCondBtn.addEventListener("click", function () {
        CitCatApp.setCondition(null).then(function () {
          showCondition(currentObj);
        });
      });
    }

    var filterSliders = ["filter-blur", "filter-brightness", "filter-contrast", "filter-saturate", "filter-hue", "filter-grayscale", "filter-sepia"];
    filterSliders.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("input", onFilterChange);
    });
    var shadowEnable = document.getElementById("filter-shadow-enable");
    if (shadowEnable) {
      shadowEnable.addEventListener("change", function () {
        var opts = document.getElementById("filter-shadow-opts");
        if (opts) opts.hidden = !this.checked;
        onFilterChange();
      });
    }
    ["filter-shadow-x", "filter-shadow-y", "filter-shadow-blur",
     "filter-shadow-color", "filter-shadow-alpha"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("input", onFilterChange);
    });
  }

  function initPaintUI() {
    var fillHost = document.getElementById("fill-paint");
    if (fillHost) {
      fillPaint = CitCatPaintEditor.create(fillHost, {
        label: "Fill",
        onChange: function (paint) {
          if (!currentObj || updating) return;
          var s = currentObj.style;
          s.fill = paint.color;
          s.fill_gradient = paint.gradient;   // null, not absent -- matches Rust
          CitCatApp.updateObjectStyle(s);
        },
      });
    }

    var strokeHost = document.getElementById("stroke-paint");
    if (strokeHost) {
      strokePaint = CitCatPaintEditor.create(strokeHost, {
        label: "Stroke",
        allowNone: true,
        onChange: function (paint) {
          if (!currentObj || updating) return;
          var s = currentObj.style;
          s.stroke = paint.color;
          s.stroke_gradient = paint.gradient;
          CitCatApp.updateObjectStyle(s);
        },
      });
    }

    var bgHost = document.getElementById("bg-paint");
    if (bgHost) {
      bgPaint = CitCatPaintEditor.create(bgHost, {
        label: "Background",
        onChange: function (paint) {
          if (updating) return;
          var scene = CitCatApp.getActiveScene();
          if (!scene) return;
          CitCatApp.updateSceneBackground({
            fill: paint.color,
            gradient: paint.gradient,
            image: scene.background ? scene.background.image || null : null,
          });
        },
      });
    }

    var bgImageBtn = document.getElementById("btn-bg-image");
    if (bgImageBtn) {
      bgImageBtn.addEventListener("click", function () {
        window.__TAURI__.core.invoke("dialog_open_image").then(function (path) {
          if (!path) return;
          var scene = CitCatApp.getActiveScene();
          if (!scene) return;
          var bg = scene.background || {};
          CitCatApp.updateSceneBackground({
            fill: bg.fill || "#ffffff",
            gradient: bg.gradient || null,
            image: path,
          });
          showSceneBackground();
        });
      });
    }

    var bgImageClear = document.getElementById("btn-bg-image-clear");
    if (bgImageClear) {
      bgImageClear.addEventListener("click", function () {
        var scene = CitCatApp.getActiveScene();
        if (!scene) return;
        var bg = scene.background || {};
        CitCatApp.updateSceneBackground({
          fill: bg.fill || "#ffffff",
          gradient: bg.gradient || null,
          image: null,
        });
        showSceneBackground();
      });
    }
  }

  // Shown in place of the old "select an object" empty state: with nothing
  // selected the scene itself is the thing you are editing.
  function showSceneBackground() {
    var scene = CitCatApp.getActiveScene();
    var pathEl = document.getElementById("bg-image-path");
    if (!scene || !bgPaint) return;

    updating = true;
    var bg = scene.background || { fill: "#ffffff" };
    bgPaint.set(bg.fill || "#ffffff", bg.gradient || null);
    if (pathEl) pathEl.textContent = bg.image || "(none)";
    updating = false;
  }

  var editingEventId = null;

  function initEventUI() {
    document.getElementById("btn-add-event").addEventListener("click", function () {
      editingEventId = null;
      populateEventForm();
      document.getElementById("event-form").hidden = false;
    });

    document.getElementById("event-form-cancel").addEventListener("click", function () {
      document.getElementById("event-form").hidden = true;
      editingEventId = null;
    });

    document.getElementById("event-form-save").addEventListener("click", saveEvent);

    document.getElementById("event-trigger-type").addEventListener("change", function () {
      document.getElementById("event-timer-label").hidden = this.value !== "Timer";
    });

    document.getElementById("event-action-type").addEventListener("change", function () {
      var val = this.value;
      document.getElementById("event-target-scene-row").hidden = val !== "GotoScene";
      document.getElementById("event-target-object-row").hidden =
        val !== "ToggleVisible" && val !== "SetProperty";
      document.getElementById("event-set-prop-row").hidden = val !== "SetProperty";
    });
  }

  function populateEventForm(ev) {
    var scenes = CitCatApp.getScenes();
    var objects = CitCatApp.getSceneObjects();

    var sceneSelect = document.getElementById("event-target-scene");
    sceneSelect.innerHTML = "";
    for (var i = 0; i < scenes.length; i++) {
      var opt = document.createElement("option");
      opt.value = scenes[i].id;
      opt.textContent = scenes[i].name;
      sceneSelect.appendChild(opt);
    }

    var objectSelect = document.getElementById("event-target-object");
    objectSelect.innerHTML = "";
    for (var i = 0; i < objects.length; i++) {
      var opt = document.createElement("option");
      opt.value = objects[i].id;
      opt.textContent = objects[i].name;
      objectSelect.appendChild(opt);
    }

    if (ev) {
      var triggerType = ev.trigger.type || ev.trigger;
      document.getElementById("event-trigger-type").value = triggerType;
      document.getElementById("event-timer-label").hidden = triggerType !== "Timer";
      if (triggerType === "Timer") {
        document.getElementById("event-timer-delay").value = ev.trigger.delay_ms || 1000;
      }

      var actionType = ev.action.type;
      document.getElementById("event-action-type").value = actionType;
      document.getElementById("event-target-scene-row").hidden = actionType !== "GotoScene";
      document.getElementById("event-target-object-row").hidden =
        actionType !== "ToggleVisible" && actionType !== "SetProperty";
      document.getElementById("event-set-prop-row").hidden = actionType !== "SetProperty";

      if (actionType === "GotoScene") {
        sceneSelect.value = ev.action.scene_id;
      }
      if (actionType === "ToggleVisible" || actionType === "SetProperty") {
        objectSelect.value = ev.action.object_id;
      }
      if (actionType === "SetProperty") {
        document.getElementById("event-set-property").value = ev.action.property || "";
        document.getElementById("event-set-value").value =
          ev.action.value && ev.action.value.value !== undefined ? ev.action.value.value : "";
      }
    } else {
      document.getElementById("event-trigger-type").value = "Click";
      document.getElementById("event-timer-label").hidden = true;
      document.getElementById("event-action-type").value = "GotoScene";
      document.getElementById("event-target-scene-row").hidden = false;
      document.getElementById("event-target-object-row").hidden = true;
      document.getElementById("event-set-prop-row").hidden = true;
      document.getElementById("event-set-property").value = "";
      document.getElementById("event-set-value").value = "";
    }
  }

  function buildTrigger() {
    var type = document.getElementById("event-trigger-type").value;
    if (type === "Timer") {
      return { type: "Timer", delay_ms: parseInt(document.getElementById("event-timer-delay").value) || 1000 };
    }
    return { type: type };
  }

  function buildAction() {
    var type = document.getElementById("event-action-type").value;
    switch (type) {
      case "GotoScene":
        return { type: "GotoScene", scene_id: document.getElementById("event-target-scene").value };
      case "ToggleVisible":
        return { type: "ToggleVisible", object_id: document.getElementById("event-target-object").value };
      case "SetProperty":
        var val = document.getElementById("event-set-value").value;
        var numVal = parseFloat(val);
        var kfValue;
        if (!isNaN(numVal) && val.trim() !== "") {
          kfValue = { type: "Number", value: numVal };
        } else if (val === "true" || val === "false") {
          kfValue = { type: "Bool", value: val === "true" };
        } else {
          kfValue = { type: "Color", value: val };
        }
        return {
          type: "SetProperty",
          object_id: document.getElementById("event-target-object").value,
          property: document.getElementById("event-set-property").value,
          value: kfValue,
        };
      default:
        return { type: "GotoScene", scene_id: "" };
    }
  }

  function saveEvent() {
    var trigger = buildTrigger();
    var action = buildAction();

    if (editingEventId) {
      CitCatApp.updateEvent(editingEventId, trigger, action).then(function () {
        document.getElementById("event-form").hidden = true;
        editingEventId = null;
        showEvents(currentObj);
      });
    } else {
      CitCatApp.addEvent(trigger, action).then(function () {
        document.getElementById("event-form").hidden = true;
        showEvents(currentObj);
      });
    }
  }

  function showEvents(obj) {
    var list = document.getElementById("events-list");
    list.innerHTML = "";
    if (!obj || !obj.events || obj.events.length === 0) return;

    for (var i = 0; i < obj.events.length; i++) {
      (function (ev) {
        var item = document.createElement("div");
        item.className = "event-item";

        var label = document.createElement("span");
        label.className = "event-item-label";
        label.textContent = describeTrigger(ev.trigger) + " → " + describeAction(ev.action);
        item.appendChild(label);

        var actions = document.createElement("div");
        actions.className = "event-item-actions";

        var editBtn = document.createElement("button");
        editBtn.textContent = "✎";
        editBtn.title = "Edit";
        editBtn.addEventListener("click", function () {
          editingEventId = ev.id;
          populateEventForm(ev);
          document.getElementById("event-form").hidden = false;
        });
        actions.appendChild(editBtn);

        var delBtn = document.createElement("button");
        delBtn.textContent = "×";
        delBtn.title = "Delete";
        delBtn.addEventListener("click", function () {
          CitCatApp.deleteEvent(ev.id).then(function () {
            showEvents(currentObj);
          });
        });
        actions.appendChild(delBtn);

        item.appendChild(actions);
        list.appendChild(item);
      })(obj.events[i]);
    }
  }

  function describeTrigger(trigger) {
    var type = trigger.type || trigger;
    switch (type) {
      case "Click": return "Click";
      case "HoverEnter": return "Hover In";
      case "HoverLeave": return "Hover Out";
      case "Timer": return "Timer " + (trigger.delay_ms || 0) + "ms";
      case "SceneEnd": return "Scene End";
      default: return type;
    }
  }

  function describeAction(action) {
    switch (action.type) {
      case "GotoScene":
        var scenes = CitCatApp.getScenes();
        var scene = scenes.find(function (s) { return s.id === action.scene_id; });
        return "Go to " + (scene ? scene.name : "?");
      case "ToggleVisible":
        var objects = CitCatApp.getSceneObjects();
        var obj = objects.find(function (o) { return o.id === action.object_id; });
        return "Toggle " + (obj ? obj.name : "?");
      case "SetProperty":
        return "Set " + (action.property || "?");
      case "PlayAnimation": return "Play anim";
      case "PauseAnimation": return "Pause anim";
      default: return action.type;
    }
  }

  function onFieldChange() {
    if (!currentObj || updating) return;
    var t = currentObj.transform;
    var s = currentObj.style;

    var x = parseFloat(document.getElementById("prop-x").value) || 0;
    var y = parseFloat(document.getElementById("prop-y").value) || 0;
    var w = Math.max(1, parseFloat(document.getElementById("prop-w").value) || 1);
    var h = Math.max(1, parseFloat(document.getElementById("prop-h").value) || 1);
    var rot = parseFloat(document.getElementById("prop-rotation").value) || 0;

    var opacityEl = document.getElementById("prop-opacity");
    var sliderEl = document.getElementById("prop-opacity-slider");
    var opacitySource = this.id === "prop-opacity-slider" ? sliderEl : opacityEl;
    var opacityVal = CitCatMath.clamp(parseFloat(opacitySource.value) || 0, 0, 100);

    if (this.id === "prop-opacity-slider") {
      opacityEl.value = Math.round(opacityVal);
    } else if (this.id === "prop-opacity") {
      sliderEl.value = Math.round(opacityVal);
    }

    CitCatApp.updateObjectTransform({
      x: x, y: y, width: w, height: h,
      rotation: rot, opacity: opacityVal / 100,
    });

    // Fill, stroke and both gradients are owned by the paint editors; carry
    // them through untouched so this handler cannot clobber them.
    CitCatApp.updateObjectStyle({
      fill: s.fill,
      fill_gradient: s.fill_gradient || null,
      stroke: s.stroke,
      stroke_gradient: s.stroke_gradient || null,
      stroke_width: parseFloat(document.getElementById("prop-stroke-width").value) || 0,
      border_radius: parseFloat(document.getElementById("prop-border-radius").value) || 0,
      font_family: document.getElementById("prop-font-family").value,
      font_size: parseFloat(document.getElementById("prop-font-size").value) || 24,
      font_weight: parseInt(document.getElementById("prop-font-weight").value) || 400,
      text_align: s.text_align,
      line_height: s.line_height,
    });
  }

  function onFilterChange() {
    if (!currentObj || updating) return;
    var blur = parseFloat(document.getElementById("filter-blur").value) || 0;
    var brightness = parseFloat(document.getElementById("filter-brightness").value) / 100;
    var contrast = parseFloat(document.getElementById("filter-contrast").value) / 100;
    var saturate = parseFloat(document.getElementById("filter-saturate").value) / 100;
    var hue = parseFloat(document.getElementById("filter-hue").value) || 0;
    var grayscale = parseFloat(document.getElementById("filter-grayscale").value) / 100;
    var sepia = parseFloat(document.getElementById("filter-sepia").value) / 100;

    document.getElementById("filter-blur-val").textContent = blur;
    document.getElementById("filter-brightness-val").textContent = Math.round(brightness * 100);
    document.getElementById("filter-contrast-val").textContent = Math.round(contrast * 100);
    document.getElementById("filter-saturate-val").textContent = Math.round(saturate * 100);
    document.getElementById("filter-hue-val").textContent = hue;
    document.getElementById("filter-grayscale-val").textContent = Math.round(grayscale * 100);
    document.getElementById("filter-sepia-val").textContent = Math.round(sepia * 100);

    var hasAny = blur > 0 || brightness !== 1 || contrast !== 1 || saturate !== 1 || hue !== 0 || grayscale > 0 || sepia > 0;
    var shadowEnabled = document.getElementById("filter-shadow-enable").checked;

    if (!hasAny && !shadowEnabled) {
      CitCatApp.updateObjectFilters(null);
      return;
    }

    var filters = {};
    if (blur > 0) filters.blur = blur;
    if (brightness !== 1) filters.brightness = brightness;
    if (contrast !== 1) filters.contrast = contrast;
    if (saturate !== 1) filters.saturate = saturate;
    if (hue !== 0) filters.hue_rotate = hue;
    if (grayscale > 0) filters.grayscale = grayscale;
    if (sepia > 0) filters.sepia = sepia;
    if (shadowEnabled) {
      filters.drop_shadow = {
        offset_x: parseFloat(document.getElementById("filter-shadow-x").value) || 0,
        offset_y: parseFloat(document.getElementById("filter-shadow-y").value) || 0,
        blur: parseFloat(document.getElementById("filter-shadow-blur").value) || 0,
        color: CitCatPaintEditor.joinColor(
          document.getElementById("filter-shadow-color").value || "#000000",
          parseInt(document.getElementById("filter-shadow-alpha").value, 10)
        ),
      };
    }
    CitCatApp.updateObjectFilters(filters);
  }

  function showFilters(obj) {
    var f = obj.filters || {};
    document.getElementById("filter-blur").value = f.blur || 0;
    document.getElementById("filter-blur-val").textContent = f.blur || 0;
    document.getElementById("filter-brightness").value = Math.round((f.brightness || 1) * 100);
    document.getElementById("filter-brightness-val").textContent = Math.round((f.brightness || 1) * 100);
    document.getElementById("filter-contrast").value = Math.round((f.contrast || 1) * 100);
    document.getElementById("filter-contrast-val").textContent = Math.round((f.contrast || 1) * 100);
    document.getElementById("filter-saturate").value = Math.round((f.saturate || 1) * 100);
    document.getElementById("filter-saturate-val").textContent = Math.round((f.saturate || 1) * 100);
    document.getElementById("filter-hue").value = f.hue_rotate || 0;
    document.getElementById("filter-hue-val").textContent = f.hue_rotate || 0;
    document.getElementById("filter-grayscale").value = Math.round((f.grayscale || 0) * 100);
    document.getElementById("filter-grayscale-val").textContent = Math.round((f.grayscale || 0) * 100);
    document.getElementById("filter-sepia").value = Math.round((f.sepia || 0) * 100);
    document.getElementById("filter-sepia-val").textContent = Math.round((f.sepia || 0) * 100);

    var hasShadow = f.drop_shadow != null;
    document.getElementById("filter-shadow-enable").checked = hasShadow;
    document.getElementById("filter-shadow-opts").hidden = !hasShadow;
    if (hasShadow) {
      document.getElementById("filter-shadow-x").value = f.drop_shadow.offset_x || 0;
      document.getElementById("filter-shadow-y").value = f.drop_shadow.offset_y || 0;
      document.getElementById("filter-shadow-blur").value = f.drop_shadow.blur || 0;
      var sc = CitCatPaintEditor.splitColor(f.drop_shadow.color || "#000000");
      document.getElementById("filter-shadow-color").value = sc.hex;
      document.getElementById("filter-shadow-alpha").value = sc.alpha;
    }
  }

  function show(obj) {
    currentObj = obj;
    updating = true;

    document.getElementById("props-empty").hidden = true;
    document.getElementById("props-content").hidden = false;

    var t = obj.transform;
    var s = obj.style;

    document.getElementById("prop-name").value = obj.name;
    document.getElementById("prop-x").value = Math.round(t.x);
    document.getElementById("prop-y").value = Math.round(t.y);
    document.getElementById("prop-w").value = Math.round(t.width);
    document.getElementById("prop-h").value = Math.round(t.height);
    document.getElementById("prop-rotation").value = Math.round(t.rotation);
    document.getElementById("prop-opacity").value = Math.round(t.opacity * 100);
    document.getElementById("prop-opacity-slider").value = Math.round(t.opacity * 100);

    if (fillPaint) fillPaint.set(s.fill, s.fill_gradient);
    if (strokePaint) strokePaint.set(s.stroke, s.stroke_gradient);
    document.getElementById("prop-stroke-width").value = s.stroke_width;
    document.getElementById("prop-border-radius").value = s.border_radius;

    document.getElementById("prop-font-family").value = s.font_family;
    document.getElementById("prop-font-size").value = s.font_size;
    document.getElementById("prop-font-weight").value = s.font_weight;

    document.querySelectorAll(".align-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.align === s.text_align);
    });

    var isText = obj.object_type === "Text" || obj.object_type === "Button";
    var isVideo = obj.object_type === "Video";
    document.getElementById("text-style-props").style.display = isText ? "grid" : "none";

    var contentSection = document.getElementById("content-section");
    var videoSection = document.getElementById("video-section");

    var isAudio = obj.object_type === "Audio";
    var audioSection = document.getElementById("audio-section");

    if (isVideo) {
      contentSection.style.display = "none";
      if (videoSection) {
        videoSection.style.display = "block";
        document.getElementById("video-path-display").textContent = obj.content || "(no file)";
        document.getElementById("prop-video-trim-start").value = obj.video_trim_start_ms || 0;
        document.getElementById("prop-video-trim-end").value = obj.video_trim_end_ms || "";
        document.getElementById("prop-video-muted").checked = obj.video_muted !== false;
      }
      if (audioSection) audioSection.style.display = "none";
    } else if (isAudio) {
      contentSection.style.display = "none";
      if (videoSection) videoSection.style.display = "none";
      if (audioSection) {
        audioSection.style.display = "block";
        document.getElementById("audio-path-display").textContent = obj.content || "(no file)";
        var trimStart = document.getElementById("prop-audio-trim-start");
        if (trimStart) trimStart.value = obj.video_trim_start_ms || 0;
        var trimEnd = document.getElementById("prop-audio-trim-end");
        if (trimEnd) trimEnd.value = obj.video_trim_end_ms || "";
        var vol = document.getElementById("prop-audio-volume");
        if (vol) vol.value = Math.round((obj.audio_volume !== undefined ? obj.audio_volume : 1.0) * 100);
        var volDisplay = document.getElementById("audio-volume-display");
        if (volDisplay) volDisplay.textContent = Math.round((obj.audio_volume !== undefined ? obj.audio_volume : 1.0) * 100) + "%";
        var loop = document.getElementById("prop-audio-loop");
        if (loop) loop.checked = !!obj.audio_loop;
      }
    } else {
      contentSection.style.display =
        (obj.object_type === "Text" || obj.object_type === "Button") ? "block" : "none";
      if (videoSection) videoSection.style.display = "none";
      if (audioSection) audioSection.style.display = "none";
    }

    if (isText) {
      document.getElementById("prop-content").value = obj.content || "";
    }

    var textWrapSection = document.getElementById("text-wrap-section");
    if (textWrapSection) {
      textWrapSection.style.display = (isText && obj.object_type === "Text") ? "block" : "none";
      var twCb = document.getElementById("prop-text-wrap");
      if (twCb) twCb.checked = !!obj.text_wrap;
    }

    var lifespanSection = document.getElementById("lifespan-section");
    if (lifespanSection) {
      var appearInput = document.getElementById("prop-appear-at");
      var disappearInput = document.getElementById("prop-disappear-at");
      if (appearInput) appearInput.value = obj.appear_at_ms !== null && obj.appear_at_ms !== undefined ? obj.appear_at_ms : "";
      if (disappearInput) disappearInput.value = obj.disappear_at_ms !== null && obj.disappear_at_ms !== undefined ? obj.disappear_at_ms : "";
    }

    var alignSection = document.getElementById("alignment-section");
    if (alignSection) {
      var ids = CitCatApp.getSelectedObjectIds();
      alignSection.hidden = !(ids && ids.size > 1);
    }

    var showRadius = obj.object_type === "Rect" || obj.object_type === "Button";
    document.getElementById("label-border-radius").style.display = showRadius ? "flex" : "none";

    showEvents(obj);
    document.getElementById("event-form").hidden = true;
    editingEventId = null;

    showMotionPath(obj);
    showBindings(obj);
    showCondition(obj);
    showFilters(obj);

    updating = false;
  }

  function showMotionPath(obj) {
    var section = document.getElementById("motion-path-section");
    if (!section) return;
    if (obj.motion_path && obj.motion_path.points && obj.motion_path.points.length > 0) {
      section.hidden = false;
      document.getElementById("path-point-count").textContent =
        obj.motion_path.points.length + " points";
    } else {
      section.hidden = false;
      document.getElementById("path-point-count").textContent = "No path";
    }
  }

  function showBindings(obj) {
    var section = document.getElementById("bindings-section");
    if (!section) return;
    var list = document.getElementById("bindings-list");
    list.innerHTML = "";

    if (!obj.data_bindings || obj.data_bindings.length === 0) {
      return;
    }

    for (var i = 0; i < obj.data_bindings.length; i++) {
      (function (binding) {
        var item = document.createElement("div");
        item.className = "event-item";
        var label = document.createElement("span");
        label.className = "event-item-label";
        label.textContent = binding.property + " ← " + binding.column;
        item.appendChild(label);
        var delBtn = document.createElement("button");
        delBtn.textContent = "×";
        delBtn.addEventListener("click", function () {
          CitCatApp.deleteBinding(binding.id).then(function () {
            showBindings(currentObj);
          });
        });
        var actions = document.createElement("div");
        actions.className = "event-item-actions";
        actions.appendChild(delBtn);
        item.appendChild(actions);
        list.appendChild(item);
      })(obj.data_bindings[i]);
    }
  }

  function showCondition(obj) {
    var section = document.getElementById("condition-section");
    if (!section) return;
    var col = document.getElementById("cond-column");
    var op = document.getElementById("cond-operator");
    var val = document.getElementById("cond-value");
    if (obj.condition) {
      col.value = obj.condition.column || "";
      op.value = obj.condition.operator || "Equals";
      val.value = obj.condition.value || "";
    } else {
      col.value = "";
      op.value = "Equals";
      val.value = "";
    }
  }

  function hide() {
    currentObj = null;
    document.getElementById("props-empty").hidden = false;
    document.getElementById("props-content").hidden = true;
    showSceneBackground();
  }

  return {
    init: init,
    show: show,
    hide: hide,
    showSceneBackground: showSceneBackground,
  };
})();
