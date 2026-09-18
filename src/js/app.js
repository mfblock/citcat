var CitCatApp = (function () {
  var invoke = window.__TAURI__.core.invoke;

  var project = null;
  var activeSceneId = null;
  var selectedObjectId = null;
  var selectedObjectIds = new Set();
  var savePath = null;
  var renderRequested = false;
  var playheadMs = 0;
  var isPlaying = false;
  var previewRowData = null;
  var dataConnected = false;
  var dirty = false;
  var clipboard = null;
  var gridSnap = false;
  var gridSize = 10;

  function init() {
    CitCatCanvas.init(document.getElementById("stage-canvas"));
    CitCatInteraction.init();
    CitCatProperties.init();
    CitCatToolbar.init();
    CitCatScenes.init();
    CitCatTimeline.init();
    CitCatDataPanel.init();
    if (typeof CitCatLayers !== "undefined") CitCatLayers.init();
    if (typeof Splitters !== "undefined") Splitters.init();

    CitCatRuntime.state.onTimeUpdate = function (sceneIndex, timeMs) {
      playheadMs = timeMs;
      var scene = project.scenes[sceneIndex];
      if (scene && scene.id !== activeSceneId) {
        activeSceneId = scene.id;
      }
      requestRender();
    };

    CitCatRuntime.state.onSceneChange = function (sceneIndex) {
      if (project && project.scenes[sceneIndex]) {
        activeSceneId = project.scenes[sceneIndex].id;
      }
    };

    CitCatRuntime.state.onPlayStateChange = function (playing) {
      isPlaying = playing;
      if (!playing) {
        CitCatRuntime.cleanupEvents();
      }
      updatePlaybackButtons();
      requestRender();
    };

    invoke("project_get").then(function (p) {
      project = p;
      CitCatRuntime.setProject(p);
      CitCatCanvas.setStageSize(p.meta.width, p.meta.height);
      if (p.scenes.length > 0) {
        activeSceneId = p.scenes[0].id;
      }
      updateWindowTitle();
      renderAll();
    });
  }

  function updatePlaybackButtons() {
    var playBtn = document.getElementById("btn-play");
    var pauseBtn = document.getElementById("btn-pause");
    if (playBtn) playBtn.classList.toggle("active", isPlaying);
    if (pauseBtn) pauseBtn.classList.toggle("active", !isPlaying && playheadMs > 0);
  }

  function renderAll() {
    var scene = getActiveScene();
    if (scene) {
      var renderScene = scene;
      if (previewRowData && !isPlaying) {
        renderScene = resolveBindingsForPreview(scene);
      }
      var selArg = isPlaying ? null : (selectedObjectIds.size > 1 ? selectedObjectIds : selectedObjectId);
      if (isPlaying || hasKeyframes(renderScene)) {
        var resolved = resolveSceneAtTime(renderScene, playheadMs);
        CitCatCanvas.render(resolved, selectedObjectId, selArg, playheadMs);
      } else {
        CitCatCanvas.render(renderScene, selectedObjectId, selArg, playheadMs);
      }
      CitCatScenes.render(project.scenes, activeSceneId);
      CitCatTimeline.render(scene, activeSceneId, selectedObjectId, playheadMs);
      if (typeof CitCatLayers !== "undefined") CitCatLayers.render(scene, selArg);
    }
    if (!isPlaying) {
      var obj = getSelectedObject();
      if (obj) {
        CitCatProperties.show(obj);
      } else {
        CitCatProperties.hide();
      }
    }
  }

  function hasKeyframes(scene) {
    for (var i = 0; i < scene.objects.length; i++) {
      if (scene.objects[i].keyframes && scene.objects[i].keyframes.length > 0) return true;
    }
    return false;
  }

  function resolveSceneAtTime(scene, timeMs) {
    var resolved = {
      id: scene.id,
      name: scene.name,
      duration_ms: scene.duration_ms,
      background: scene.background,
      objects: [],
      transition_in: scene.transition_in,
      transition_out: scene.transition_out,
      sort_order: scene.sort_order,
    };
    for (var i = 0; i < scene.objects.length; i++) {
      var obj = CitCatRuntime.resolveObjectAtTime(scene.objects[i], timeMs);
      var vis = CitCatRuntime.getRuntimeVisibility(obj.id);
      if (vis !== null) obj.visible = vis;
      resolved.objects.push(obj);
    }
    return resolved;
  }

  function requestRender() {
    if (!renderRequested) {
      renderRequested = true;
      requestAnimationFrame(function () {
        renderRequested = false;
        renderAll();
      });
    }
  }

  function getActiveScene() {
    if (!project || !activeSceneId) return null;
    return project.scenes.find(function (s) {
      return s.id === activeSceneId;
    }) || null;
  }

  function getActiveSceneIndex() {
    if (!project || !activeSceneId) return -1;
    return project.scenes.findIndex(function (s) {
      return s.id === activeSceneId;
    });
  }

  function getSelectedObject() {
    if (!selectedObjectId) return null;
    var scene = getActiveScene();
    if (!scene) return null;
    return scene.objects.find(function (o) {
      return o.id === selectedObjectId;
    }) || null;
  }

  function selectObject(id) {
    selectedObjectId = id;
    selectedObjectIds.clear();
    if (id) selectedObjectIds.add(id);
    requestRender();
  }

  function toggleMultiSelect(id) {
    if (selectedObjectIds.has(id)) {
      selectedObjectIds.delete(id);
      if (selectedObjectId === id) {
        selectedObjectId = selectedObjectIds.size > 0 ? selectedObjectIds.values().next().value : null;
      }
    } else {
      selectedObjectIds.add(id);
      if (!selectedObjectId) selectedObjectId = id;
    }
    requestRender();
  }

  function selectMultiple(ids) {
    selectedObjectIds.clear();
    for (var i = 0; i < ids.length; i++) {
      selectedObjectIds.add(ids[i]);
    }
    selectedObjectId = ids.length > 0 ? ids[0] : null;
    requestRender();
  }

  function getSelectedObjectIds() {
    return selectedObjectIds;
  }

  function alignObjects(alignment) {
    var scene = getActiveScene();
    if (!scene || selectedObjectIds.size < 2) return;
    pushUndo("align " + alignment);

    var objs = scene.objects.filter(function (o) { return selectedObjectIds.has(o.id); });
    if (objs.length < 2) return;

    switch (alignment) {
      case "left":
        var minX = Math.min.apply(null, objs.map(function (o) { return o.transform.x; }));
        objs.forEach(function (o) { o.transform.x = minX; });
        break;
      case "center-h":
        var cx = objs.reduce(function (sum, o) { return sum + o.transform.x + o.transform.width / 2; }, 0) / objs.length;
        objs.forEach(function (o) { o.transform.x = Math.round(cx - o.transform.width / 2); });
        break;
      case "right":
        var maxR = Math.max.apply(null, objs.map(function (o) { return o.transform.x + o.transform.width; }));
        objs.forEach(function (o) { o.transform.x = Math.round(maxR - o.transform.width); });
        break;
      case "top":
        var minY = Math.min.apply(null, objs.map(function (o) { return o.transform.y; }));
        objs.forEach(function (o) { o.transform.y = minY; });
        break;
      case "center-v":
        var cy = objs.reduce(function (sum, o) { return sum + o.transform.y + o.transform.height / 2; }, 0) / objs.length;
        objs.forEach(function (o) { o.transform.y = Math.round(cy - o.transform.height / 2); });
        break;
      case "bottom":
        var maxB = Math.max.apply(null, objs.map(function (o) { return o.transform.y + o.transform.height; }));
        objs.forEach(function (o) { o.transform.y = Math.round(maxB - o.transform.height); });
        break;
      case "distribute-h":
        objs.sort(function (a, b) { return a.transform.x - b.transform.x; });
        if (objs.length > 2) {
          var firstX = objs[0].transform.x;
          var lastX = objs[objs.length - 1].transform.x;
          var spacing = (lastX - firstX) / (objs.length - 1);
          for (var i = 1; i < objs.length - 1; i++) {
            objs[i].transform.x = Math.round(firstX + spacing * i);
          }
        }
        break;
      case "distribute-v":
        objs.sort(function (a, b) { return a.transform.y - b.transform.y; });
        if (objs.length > 2) {
          var firstY = objs[0].transform.y;
          var lastY = objs[objs.length - 1].transform.y;
          var spacing = (lastY - firstY) / (objs.length - 1);
          for (var i = 1; i < objs.length - 1; i++) {
            objs[i].transform.y = Math.round(firstY + spacing * i);
          }
        }
        break;
    }

    objs.forEach(function (o) {
      invoke("object_update", {
        sceneId: activeSceneId,
        objectId: o.id,
        transform: o.transform,
      });
    });
    requestRender();
  }

  function commitMultiTransform() {
    var scene = getActiveScene();
    if (!scene) return;
    selectedObjectIds.forEach(function (id) {
      var obj = scene.objects.find(function (o) { return o.id === id; });
      if (obj) {
        invoke("object_update", {
          sceneId: activeSceneId,
          objectId: obj.id,
          transform: obj.transform,
        });
      }
    });
  }

  function updateObjectForId(objId, field, value) {
    var scene = getActiveScene();
    if (!scene) return;
    var obj = scene.objects.find(function (o) { return o.id === objId; });
    if (!obj) return;
    obj[field] = value;
    var args = { sceneId: activeSceneId, objectId: objId };
    args[field] = value;
    invoke("object_update", args);
    requestRender();
  }

  function reorderObjectTo(objectId, targetZ) {
    invoke("object_reorder", {
      sceneId: activeSceneId,
      objectId: objectId,
      zIndex: targetZ,
    }).then(function () {
      return invoke("project_get");
    }).then(function (p) {
      project = p;
      CitCatRuntime.setProject(p);
      requestRender();
    });
  }

  function getActiveTool() {
    return CitCatToolbar.getTool();
  }

  function setPlayheadTime(ms) {
    playheadMs = Math.max(0, ms);
    var scene = getActiveScene();
    if (scene) playheadMs = Math.min(playheadMs, scene.duration_ms);
    requestRender();
  }

  function getPlayheadTime() {
    return playheadMs;
  }

  function playToggle() {
    if (isPlaying) {
      CitCatRuntime.pause();
    } else {
      CitCatRuntime.setProject(project);
      var sceneIndex = getActiveSceneIndex();
      if (sceneIndex < 0) sceneIndex = 0;
      CitCatRuntime.seekTo(sceneIndex, playheadMs);
      CitCatRuntime.initEvents(document.getElementById("stage-canvas"), true);
      CitCatRuntime.play();
    }
  }

  function playStop() {
    CitCatRuntime.cleanupEvents();
    CitCatRuntime.stop();
    playheadMs = 0;
    requestRender();
  }

  function addObjectAtPosition(tool, stageX, stageY) {
    var typeMap = {
      text: "Text",
      rect: "Rect",
      ellipse: "Ellipse",
      image: "Image",
      button: "Button",
      hotspot: "Hotspot",
      video: "Video",
      audio: "Audio",
      svg: "Svg",
    };
    var objectType = typeMap[tool];
    if (!objectType || !activeSceneId) return;

    if (tool === "image") {
      addImageObject(stageX, stageY);
      return;
    }

    if (tool === "video") {
      addVideoObject(stageX, stageY);
      return;
    }

    if (tool === "audio") {
      addAudioObject(stageX, stageY);
      return;
    }

    if (tool === "svg") {
      addSvgObject(stageX, stageY);
      return;
    }

    pushUndo("add " + tool);
    invoke("object_add", { sceneId: activeSceneId, objectType: objectType })
      .then(function (obj) {
        obj.transform.x = Math.round(stageX - obj.transform.width / 2);
        obj.transform.y = Math.round(stageY - obj.transform.height / 2);
        var scene = getActiveScene();
        scene.objects.push(obj);
        selectedObjectId = obj.id;
        commitObjectTransform(obj);
        CitCatToolbar.resetToSelect();
        requestRender();
      })
      .catch(function (err) {
        console.error("Failed to add object:", err);
      });
  }

  function addImageObject(stageX, stageY) {
    invoke("dialog_open_image").then(function (path) {
      if (!path) return;
      invoke("object_add", { sceneId: activeSceneId, objectType: "Image" })
        .then(function (obj) {
          obj.transform.x = Math.round(stageX - obj.transform.width / 2);
          obj.transform.y = Math.round(stageY - obj.transform.height / 2);
          obj.content = path;
          var scene = getActiveScene();
          scene.objects.push(obj);
          selectedObjectId = obj.id;
          invoke("object_update", {
            sceneId: activeSceneId,
            objectId: obj.id,
            transform: obj.transform,
            content: obj.content,
          });
          CitCatToolbar.resetToSelect();
          requestRender();
        });
    });
  }

  function deleteSelected() {
    if (!activeSceneId) return;
    if (selectedObjectIds.size > 1) {
      pushUndo("delete objects");
      var promises = [];
      selectedObjectIds.forEach(function (id) {
        promises.push(invoke("object_delete", { sceneId: activeSceneId, objectId: id }));
      });
      Promise.all(promises).then(function () {
        var scene = getActiveScene();
        scene.objects = scene.objects.filter(function (o) {
          return !selectedObjectIds.has(o.id);
        });
        selectedObjectId = null;
        selectedObjectIds.clear();
        requestRender();
      });
      return;
    }
    if (!selectedObjectId) return;
    pushUndo("delete object");
    invoke("object_delete", { sceneId: activeSceneId, objectId: selectedObjectId })
      .then(function () {
        var scene = getActiveScene();
        scene.objects = scene.objects.filter(function (o) {
          return o.id !== selectedObjectId;
        });
        selectedObjectId = null;
        selectedObjectIds.clear();
        requestRender();
      });
  }

  function commitObjectTransform(obj) {
    invoke("object_update", {
      sceneId: activeSceneId,
      objectId: obj.id,
      transform: obj.transform,
    }).then(function (updated) {
      var scene = getActiveScene();
      var idx = scene.objects.findIndex(function (o) { return o.id === obj.id; });
      if (idx >= 0) scene.objects[idx] = updated;
      requestRender();
    });
  }

  function updateObjectTransform(transform) {
    var obj = getSelectedObject();
    if (!obj) return;
    obj.transform = transform;
    invoke("object_update", {
      sceneId: activeSceneId,
      objectId: obj.id,
      transform: transform,
    }).then(function (updated) {
      var scene = getActiveScene();
      var idx = scene.objects.findIndex(function (o) { return o.id === obj.id; });
      if (idx >= 0) scene.objects[idx] = updated;
      requestRender();
    });
  }

  function updateObjectStyle(style) {
    var obj = getSelectedObject();
    if (!obj) return;
    obj.style = style;
    invoke("object_update", {
      sceneId: activeSceneId,
      objectId: obj.id,
      style: style,
    });
    requestRender();
  }

  function updateObjectField(field, value) {
    var obj = getSelectedObject();
    if (!obj) return;
    obj[field] = value;
    var args = { sceneId: activeSceneId, objectId: obj.id };
    args[field] = value;
    invoke("object_update", args);
    requestRender();
  }

  function updateStyleField(field, value) {
    var obj = getSelectedObject();
    if (!obj) return;
    obj.style[field] = value;
    invoke("object_update", {
      sceneId: activeSceneId,
      objectId: obj.id,
      style: obj.style,
    });
    requestRender();
  }

  function reorderObject(direction) {
    var obj = getSelectedObject();
    if (!obj || !activeSceneId) return;
    var scene = getActiveScene();
    var maxZ = scene.objects.length - 1;
    var newZ;

    switch (direction) {
      case "front": newZ = maxZ; break;
      case "up": newZ = Math.min(obj.z_index + 1, maxZ); break;
      case "down": newZ = Math.max(obj.z_index - 1, 0); break;
      case "back": newZ = 0; break;
    }

    invoke("object_reorder", {
      sceneId: activeSceneId,
      objectId: obj.id,
      zIndex: newZ,
    }).then(function () {
      return invoke("project_get");
    }).then(function (p) {
      project = p;
      CitCatRuntime.setProject(p);
      requestRender();
    });
  }

  function switchScene(sceneId) {
    activeSceneId = sceneId;
    selectedObjectId = null;
    playheadMs = 0;
    requestRender();
  }

  function addScene() {
    var num = project.scenes.length + 1;
    invoke("scene_add", { name: "Scene " + num }).then(function (scene) {
      project.scenes.push(scene);
      CitCatRuntime.setProject(project);
      activeSceneId = scene.id;
      selectedObjectId = null;
      playheadMs = 0;
      requestRender();
    });
  }

  function deleteScene(sceneId) {
    invoke("scene_delete", { sceneId: sceneId })
      .then(function () {
        project.scenes = project.scenes.filter(function (s) {
          return s.id !== sceneId;
        });
        CitCatRuntime.setProject(project);
        if (activeSceneId === sceneId) {
          activeSceneId = project.scenes.length > 0 ? project.scenes[0].id : null;
        }
        selectedObjectId = null;
        playheadMs = 0;
        requestRender();
      })
      .catch(function (err) {
        console.error("Cannot delete scene:", err);
      });
  }

  function renameScene(sceneId, newName) {
    invoke("scene_update", { sceneId: sceneId, name: newName }).then(function (updated) {
      var scene = project.scenes.find(function (s) { return s.id === sceneId; });
      if (scene) scene.name = updated.name;
      requestRender();
    });
  }

  function updateSceneTransition(sceneId, transitionIn, transitionOut) {
    var args = { sceneId: sceneId };
    if (transitionIn !== undefined) args.transitionIn = transitionIn;
    if (transitionOut !== undefined) args.transitionOut = transitionOut;
    invoke("scene_update", args).then(function (updated) {
      var scene = project.scenes.find(function (s) { return s.id === sceneId; });
      if (scene) {
        scene.transition_in = updated.transition_in;
        scene.transition_out = updated.transition_out;
      }
      requestRender();
    });
  }

  function applyEffect(effectId) {
    var obj = getSelectedObject();
    if (!obj || !activeSceneId) return;

    invoke("effect_apply", {
      sceneId: activeSceneId,
      objectId: obj.id,
      effectId: effectId,
      timeMs: playheadMs,
    }).then(function (newKeyframes) {
      for (var i = 0; i < newKeyframes.length; i++) {
        var existing = obj.keyframes.findIndex(function (k) {
          return k.property === newKeyframes[i].property && k.time_ms === newKeyframes[i].time_ms;
        });
        if (existing >= 0) {
          obj.keyframes[existing] = newKeyframes[i];
        } else {
          obj.keyframes.push(newKeyframes[i]);
        }
      }
      obj.keyframes.sort(function (a, b) { return a.time_ms - b.time_ms; });
      requestRender();
    }).catch(function (err) {
      console.error("Failed to apply effect:", err);
    });
  }

  function addEvent(trigger, action) {
    var obj = getSelectedObject();
    if (!obj || !activeSceneId) return Promise.reject("No object selected");
    return invoke("event_add", {
      sceneId: activeSceneId,
      objectId: obj.id,
      trigger: trigger,
      action: action,
    }).then(function (ev) {
      obj.events.push(ev);
      requestRender();
      return ev;
    });
  }

  function updateEvent(eventId, trigger, action) {
    var obj = getSelectedObject();
    if (!obj || !activeSceneId) return Promise.reject("No object selected");
    var args = { sceneId: activeSceneId, objectId: obj.id, eventId: eventId };
    if (trigger !== undefined) args.trigger = trigger;
    if (action !== undefined) args.action = action;
    return invoke("event_update", args).then(function (updated) {
      var idx = obj.events.findIndex(function (e) { return e.id === eventId; });
      if (idx >= 0) obj.events[idx] = updated;
      requestRender();
      return updated;
    });
  }

  function deleteEvent(eventId) {
    var obj = getSelectedObject();
    if (!obj || !activeSceneId) return Promise.reject("No object selected");
    return invoke("event_delete", {
      sceneId: activeSceneId,
      objectId: obj.id,
      eventId: eventId,
    }).then(function () {
      obj.events = obj.events.filter(function (e) { return e.id !== eventId; });
      requestRender();
    });
  }

  function getScenes() {
    return project ? project.scenes : [];
  }

  function getSceneObjects() {
    var scene = getActiveScene();
    return scene ? scene.objects : [];
  }

  function saveProject() {
    if (savePath) {
      invoke("project_save", { path: savePath }).then(function () {
        dirty = false;
        updateWindowTitle();
      });
      return;
    }
    invoke("dialog_save_file").then(function (path) {
      if (!path) return;
      savePath = path;
      invoke("project_save", { path: path }).then(function () {
        dirty = false;
        updateWindowTitle();
      });
    });
  }

  function newProject() {
    invoke("project_new", { name: "Untitled", width: 1920, height: 1080, fps: 30 }).then(function (p) {
      project = p;
      CitCatRuntime.setProject(p);
      savePath = null;
      dirty = false;
      CitCatCanvas.setStageSize(p.meta.width, p.meta.height);
      activeSceneId = p.scenes.length > 0 ? p.scenes[0].id : null;
      selectedObjectId = null;
      playheadMs = 0;
      updateWindowTitle();
      renderAll();
    });
  }

  function openProject() {
    invoke("dialog_open_file").then(function (path) {
      if (!path) return;
      invoke("project_open", { path: path }).then(function (p) {
        project = p;
        CitCatRuntime.setProject(p);
        savePath = path;
        dirty = false;
        CitCatCanvas.setStageSize(p.meta.width, p.meta.height);
        activeSceneId = p.scenes.length > 0 ? p.scenes[0].id : null;
        selectedObjectId = null;
        playheadMs = 0;
        updateWindowTitle();
        renderAll();
      });
    });
  }

  function saveProjectAs() {
    invoke("dialog_save_file").then(function (path) {
      if (!path) return;
      savePath = path;
      invoke("project_save", { path: path }).then(function () {
        dirty = false;
        updateWindowTitle();
      });
    });
  }

  function addObjectOfType(type) {
    if (!activeSceneId) return;
    pushUndo("Add " + type);
    invoke("object_add", { sceneId: activeSceneId, objectType: type }).then(function (obj) {
      var scene = project.scenes.find(function (s) { return s.id === activeSceneId; });
      if (scene) scene.objects.push(obj);
      selectedObjectId = obj.id;
      renderAll();
    });
  }

  function nextScene() {
    var idx = project.scenes.findIndex(function (s) { return s.id === activeSceneId; });
    if (idx < project.scenes.length - 1) {
      activeSceneId = project.scenes[idx + 1].id;
      selectedObjectId = null;
      playheadMs = 0;
      renderAll();
    }
  }

  function prevScene() {
    var idx = project.scenes.findIndex(function (s) { return s.id === activeSceneId; });
    if (idx > 0) {
      activeSceneId = project.scenes[idx - 1].id;
      selectedObjectId = null;
      playheadMs = 0;
      renderAll();
    }
  }

  function getProject() {
    return project;
  }

  function commitMotionPath(obj) {
    if (!obj || !activeSceneId) return;
    invoke("path_set", {
      sceneId: activeSceneId,
      objectId: obj.id,
      motionPath: obj.motion_path || null,
    });
  }

  function clearMotionPath(obj) {
    if (!obj || !activeSceneId) return;
    invoke("path_set", {
      sceneId: activeSceneId,
      objectId: obj.id,
      motionPath: null,
    }).then(function () {
      obj.motion_path = null;
      obj.keyframes = obj.keyframes.filter(function (k) {
        return k.property !== "_path_progress";
      });
      requestRender();
    });
  }

  function addPathProgressKeyframes(obj) {
    if (!obj || !activeSceneId) return;
    var scene = getActiveScene();
    if (!scene) return;

    invoke("keyframe_add", {
      sceneId: activeSceneId,
      objectId: obj.id,
      timeMs: 0,
      property: "_path_progress",
      value: { type: "Number", value: 0.0 },
      easing: "EaseInOut",
    }).then(function (kf1) {
      obj.keyframes.push(kf1);
      return invoke("keyframe_add", {
        sceneId: activeSceneId,
        objectId: obj.id,
        timeMs: scene.duration_ms,
        property: "_path_progress",
        value: { type: "Number", value: 1.0 },
        easing: "EaseInOut",
      });
    }).then(function (kf2) {
      obj.keyframes.push(kf2);
      requestRender();
    });
  }

  function addBinding(property, column, transform) {
    var obj = getSelectedObject();
    if (!obj || !activeSceneId) return Promise.reject("No object selected");
    return invoke("binding_add", {
      sceneId: activeSceneId,
      objectId: obj.id,
      property: property,
      column: column,
      transform: transform,
    }).then(function (binding) {
      obj.data_bindings.push(binding);
      requestRender();
      return binding;
    });
  }

  function deleteBinding(bindingId) {
    var obj = getSelectedObject();
    if (!obj || !activeSceneId) return Promise.reject("No object selected");
    return invoke("binding_delete", {
      sceneId: activeSceneId,
      objectId: obj.id,
      bindingId: bindingId,
    }).then(function () {
      obj.data_bindings = obj.data_bindings.filter(function (b) { return b.id !== bindingId; });
      requestRender();
    });
  }

  function setCondition(condition) {
    var obj = getSelectedObject();
    if (!obj || !activeSceneId) return Promise.reject("No object selected");
    return invoke("condition_set", {
      sceneId: activeSceneId,
      objectId: obj.id,
      condition: condition || null,
    }).then(function () {
      obj.condition = condition || null;
      requestRender();
    });
  }

  function setPreviewRowData(rowData) {
    previewRowData = rowData;
    requestRender();
  }

  function getPreviewRowData() {
    return previewRowData;
  }

  function isDataConnected() {
    return dataConnected;
  }

  function setDataConnected(val) {
    dataConnected = val;
  }

  function resolveBindingsForPreview(scene) {
    if (!previewRowData) return scene;
    var resolved = {
      id: scene.id,
      name: scene.name,
      duration_ms: scene.duration_ms,
      background: scene.background,
      objects: [],
      transition_in: scene.transition_in,
      transition_out: scene.transition_out,
      sort_order: scene.sort_order,
    };
    for (var i = 0; i < scene.objects.length; i++) {
      var obj = JSON.parse(JSON.stringify(scene.objects[i]));
      if (obj.condition) {
        var colVal = previewRowData[obj.condition.column];
        colVal = colVal === null || colVal === undefined ? "" : String(colVal);
        var vis = true;
        switch (obj.condition.operator) {
          case "Equals": vis = colVal === obj.condition.value; break;
          case "NotEquals": vis = colVal !== obj.condition.value; break;
          case "Empty": vis = colVal === ""; break;
          case "NotEmpty": vis = colVal !== ""; break;
          case "GreaterThan": vis = parseFloat(colVal) > parseFloat(obj.condition.value); break;
          case "LessThan": vis = parseFloat(colVal) < parseFloat(obj.condition.value); break;
          case "Contains": vis = colVal.indexOf(obj.condition.value) >= 0; break;
        }
        obj.visible = vis;
      }
      for (var b = 0; b < obj.data_bindings.length; b++) {
        var binding = obj.data_bindings[b];
        var rawVal = previewRowData[binding.column];
        rawVal = rawVal === null || rawVal === undefined ? "" : String(rawVal);
        var val = rawVal;
        switch (binding.transform.type || binding.transform) {
          case "Uppercase": val = rawVal.toUpperCase(); break;
          case "Lowercase": val = rawVal.toLowerCase(); break;
          case "FormatCurrency":
            var num = parseFloat(rawVal) || 0;
            val = (binding.transform.symbol || "$") + num.toFixed(binding.transform.decimals || 2);
            break;
          case "ImagePath":
            val = (binding.transform.prefix || "") + rawVal;
            break;
        }
        switch (binding.property) {
          case "content": obj.content = val; break;
          case "style.fill": obj.style.fill = val; break;
          case "style.stroke": obj.style.stroke = val; break;
          case "visible": obj.visible = val === "true" || val === "1"; break;
        }
      }
      resolved.objects.push(obj);
    }
    return resolved;
  }

  function pushUndo(desc) {
    invoke("history_push", { description: desc || "edit" });
    dirty = true;
    updateWindowTitle();
  }

  function undo() {
    invoke("undo").then(function (p) {
      if (!p) return;
      project = p;
      CitCatRuntime.setProject(p);
      activeSceneId = p.scenes.length > 0 ? p.scenes[0].id : null;
      selectedObjectId = null;
      renderAll();
    });
  }

  function redo() {
    invoke("redo").then(function (p) {
      if (!p) return;
      project = p;
      CitCatRuntime.setProject(p);
      activeSceneId = p.scenes.length > 0 ? p.scenes[0].id : null;
      selectedObjectId = null;
      renderAll();
    });
  }

  function duplicateSelected() {
    if (!selectedObjectId || !activeSceneId) return;
    pushUndo("duplicate");
    invoke("object_duplicate", { sceneId: activeSceneId, objectId: selectedObjectId })
      .then(function (dup) {
        var scene = getActiveScene();
        scene.objects.push(dup);
        selectedObjectId = dup.id;
        requestRender();
      });
  }

  function copySelected() {
    var obj = getSelectedObject();
    if (!obj) return;
    clipboard = JSON.parse(JSON.stringify(obj));
  }

  function pasteObject() {
    if (!clipboard || !activeSceneId) return;
    pushUndo("paste");
    var tool = clipboard.object_type.toLowerCase();
    invoke("object_add", { sceneId: activeSceneId, objectType: clipboard.object_type })
      .then(function (newObj) {
        newObj.transform = JSON.parse(JSON.stringify(clipboard.transform));
        newObj.transform.x += 20;
        newObj.transform.y += 20;
        newObj.style = JSON.parse(JSON.stringify(clipboard.style));
        newObj.content = clipboard.content;
        var scene = getActiveScene();
        scene.objects.push(newObj);
        selectedObjectId = newObj.id;
        invoke("object_update", {
          sceneId: activeSceneId,
          objectId: newObj.id,
          transform: newObj.transform,
          style: newObj.style,
          content: newObj.content,
        });
        requestRender();
      });
  }

  function snapToGrid(val) {
    if (!gridSnap) return val;
    return Math.round(val / gridSize) * gridSize;
  }

  function toggleGridSnap() {
    gridSnap = !gridSnap;
  }

  function isGridSnap() {
    return gridSnap;
  }

  function updateWindowTitle() {
    var name = project ? project.meta.name : "Untitled";
    document.title = (dirty ? "* " : "") + name + " — CitCat";
  }

  function addVideoObject(stageX, stageY) {
    invoke("dialog_open_video").then(function (path) {
      if (!path) return;
      pushUndo("add video");
      invoke("object_add", { sceneId: activeSceneId, objectType: "Video" })
        .then(function (obj) {
          obj.transform.x = Math.round(stageX - obj.transform.width / 2);
          obj.transform.y = Math.round(stageY - obj.transform.height / 2);
          obj.content = path;
          var scene = getActiveScene();
          scene.objects.push(obj);
          selectedObjectId = obj.id;
          invoke("object_update", {
            sceneId: activeSceneId,
            objectId: obj.id,
            transform: obj.transform,
            content: obj.content,
          });
          CitCatToolbar.resetToSelect();
          requestRender();
        });
    });
  }

  function addAudioObject(stageX, stageY) {
    invoke("dialog_open_audio").then(function (path) {
      if (!path) return;
      pushUndo("add audio");
      invoke("object_add", { sceneId: activeSceneId, objectType: "Audio" })
        .then(function (obj) {
          obj.transform.x = Math.round(stageX - obj.transform.width / 2);
          obj.transform.y = Math.round(stageY - obj.transform.height / 2);
          obj.content = path;
          var scene = getActiveScene();
          scene.objects.push(obj);
          selectedObjectId = obj.id;
          selectedObjectIds.clear();
          selectedObjectIds.add(obj.id);
          invoke("object_update", {
            sceneId: activeSceneId,
            objectId: obj.id,
            transform: obj.transform,
            content: obj.content,
          });
          CitCatToolbar.resetToSelect();
          requestRender();
        });
    });
  }

  function addSvgObject(stageX, stageY) {
    invoke("dialog_open_svg").then(function (path) {
      if (!path) return;
      invoke("read_svg_file", { path: path }).then(function (svgContent) {
        pushUndo("add svg");
        invoke("object_add", { sceneId: activeSceneId, objectType: "Svg" })
          .then(function (obj) {
            obj.transform.x = Math.round(stageX - obj.transform.width / 2);
            obj.transform.y = Math.round(stageY - obj.transform.height / 2);
            obj.content = svgContent;
            var scene = getActiveScene();
            scene.objects.push(obj);
            selectedObjectId = obj.id;
            invoke("object_update", {
              sceneId: activeSceneId,
              objectId: obj.id,
              transform: obj.transform,
              content: obj.content,
            });
            CitCatToolbar.resetToSelect();
            requestRender();
          });
      });
    });
  }

  function updateObjectFilters(filters) {
    var obj = getSelectedObject();
    if (!obj || !activeSceneId) return;
    obj.filters = filters;
    invoke("object_update", {
      sceneId: activeSceneId,
      objectId: obj.id,
      filters: filters || null,
    });
    requestRender();
  }

  function showTemplateModal() {
    var modal = document.getElementById("template-modal");
    modal.hidden = false;
    refreshTemplateList();
  }

  function refreshTemplateList() {
    invoke("template_list").then(function (templates) {
      var list = document.getElementById("template-list");
      list.innerHTML = "";
      if (templates.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px;">No templates available</div>';
        return;
      }
      templates.forEach(function (name) {
        var item = document.createElement("div");
        item.style.cssText = "padding:6px 8px;cursor:pointer;border-radius:4px;font-size:13px;";
        item.textContent = name;
        item.addEventListener("mouseenter", function () { item.style.background = "var(--bg-hover)"; });
        item.addEventListener("mouseleave", function () { item.style.background = ""; });
        item.addEventListener("click", function () {
          invoke("template_load", { name: name }).then(function (p) {
            project = p;
            CitCatRuntime.setProject(p);
            savePath = null;
            dirty = false;
            CitCatCanvas.setStageSize(p.meta.width, p.meta.height);
            activeSceneId = p.scenes.length > 0 ? p.scenes[0].id : null;
            selectedObjectId = null;
            playheadMs = 0;
            updateWindowTitle();
            document.getElementById("template-modal").hidden = true;
            renderAll();
          });
        });
        list.appendChild(item);
      });
    });
  }

  function saveAsTemplate() {
    var nameEl = document.getElementById("template-save-name");
    var name = nameEl.value.trim();
    if (!name) return;
    invoke("template_save", { name: name }).then(function () {
      nameEl.value = "";
      refreshTemplateList();
    });
  }

  function showSubtitleModal() {
    document.getElementById("subtitle-modal").hidden = false;
  }

  function importSubtitles() {
    var scene = getActiveScene();
    if (!scene) return;
    invoke("dialog_open_file").then(function (path) {
      if (!path) return;
      invoke("subtitle_import", { sceneId: scene.id, path: path }).then(function () {
        return invoke("project_get");
      }).then(function (p) {
        project = p;
        CitCatRuntime.setProject(p);
        document.getElementById("subtitle-modal").hidden = true;
        var status = document.getElementById("subtitle-status");
        status.textContent = "Subtitles imported!";
        status.hidden = false;
        setTimeout(function () { status.hidden = true; }, 2000);
        renderAll();
      });
    });
  }

  function exportSubtitles(format) {
    var scene = getActiveScene();
    if (!scene) return;
    invoke("dialog_save_file").then(function (path) {
      if (!path) return;
      invoke("subtitle_export", { sceneId: scene.id, path: path, format: format }).then(function () {
        var status = document.getElementById("subtitle-status");
        status.textContent = "Subtitles exported!";
        status.hidden = false;
        setTimeout(function () { status.hidden = true; }, 2000);
      });
    });
  }

  function clearSubtitles() {
    var scene = getActiveScene();
    if (!scene) return;
    invoke("subtitle_clear", { sceneId: scene.id }).then(function () {
      scene.subtitle_track = null;
      renderAll();
    });
  }

  function reorderScenes(sceneIds) {
    invoke("scene_reorder", { sceneIds: sceneIds }).then(function () {
      return invoke("project_get");
    }).then(function (p) {
      project = p;
      CitCatRuntime.setProject(p);
      renderAll();
    });
  }

  function reloadEffects() {
    invoke("effects_reload").then(function (effects) {
      CitCatToolbar.refreshEffects && CitCatToolbar.refreshEffects(effects);
    });
  }

  function startPreview() {
    var overlay = document.getElementById("preview-overlay");
    var previewCanvas = document.getElementById("preview-canvas");
    if (!overlay || !previewCanvas || !project) return;

    overlay.hidden = false;
    previewCanvas.width = project.meta.width;
    previewCanvas.height = project.meta.height;

    var previewRuntime = new CitCatRuntime(previewCanvas, project, null);
    previewRuntime.play();

    var exitHandler = function (e) {
      if (e.key === "Escape") {
        previewRuntime.stop();
        previewRuntime.cleanupEvents();
        overlay.hidden = true;
        document.removeEventListener("keydown", exitHandler);
      }
    };
    document.addEventListener("keydown", exitHandler);
  }

  function initDragAndDrop() {
    var wrapper = document.getElementById("canvas-wrapper");
    var dropOverlay = document.getElementById("drop-overlay");
    if (!wrapper || !dropOverlay) return;

    var dragCount = 0;
    document.addEventListener("dragenter", function (e) {
      e.preventDefault();
      dragCount++;
      dropOverlay.hidden = false;
    });
    document.addEventListener("dragleave", function (e) {
      dragCount--;
      if (dragCount <= 0) {
        dragCount = 0;
        dropOverlay.hidden = true;
      }
    });
    document.addEventListener("dragover", function (e) {
      e.preventDefault();
    });
    document.addEventListener("drop", function (e) {
      e.preventDefault();
      dragCount = 0;
      dropOverlay.hidden = true;

      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || files.length === 0) return;

      for (var i = 0; i < files.length; i++) {
        handleDroppedFile(files[i]);
      }
    });
  }

  function handleDroppedFile(file) {
    var ext = file.name.split(".").pop().toLowerCase();
    var path = file.path || file.name;

    if (["png", "jpg", "jpeg", "gif", "webp"].indexOf(ext) >= 0) {
      pushUndo("drop image");
      invoke("object_add", { sceneId: activeSceneId, objectType: "Image" }).then(function (obj) {
        obj.content = path;
        var scene = getActiveScene();
        scene.objects.push(obj);
        invoke("object_update", { sceneId: activeSceneId, objectId: obj.id, content: path });
        requestRender();
      });
    } else if (ext === "svg") {
      invoke("read_svg_file", { path: path }).then(function (content) {
        pushUndo("drop svg");
        invoke("object_add", { sceneId: activeSceneId, objectType: "Svg" }).then(function (obj) {
          obj.content = content;
          var scene = getActiveScene();
          scene.objects.push(obj);
          invoke("object_update", { sceneId: activeSceneId, objectId: obj.id, content: content });
          requestRender();
        });
      });
    } else if (["mp4", "webm", "mov"].indexOf(ext) >= 0) {
      pushUndo("drop video");
      invoke("object_add", { sceneId: activeSceneId, objectType: "Video" }).then(function (obj) {
        obj.content = path;
        var scene = getActiveScene();
        scene.objects.push(obj);
        invoke("object_update", { sceneId: activeSceneId, objectId: obj.id, content: path });
        requestRender();
      });
    } else if (["mp3", "wav", "ogg", "m4a"].indexOf(ext) >= 0) {
      pushUndo("drop audio");
      invoke("object_add", { sceneId: activeSceneId, objectType: "Audio" }).then(function (obj) {
        obj.content = path;
        var scene = getActiveScene();
        scene.objects.push(obj);
        invoke("object_update", { sceneId: activeSceneId, objectId: obj.id, content: path });
        requestRender();
      });
    } else if (ext === "citcat") {
      invoke("project_open", { path: path }).then(function (p) {
        project = p;
        CitCatRuntime.setProject(p);
        savePath = path;
        dirty = false;
        CitCatCanvas.setStageSize(p.meta.width, p.meta.height);
        activeSceneId = p.scenes.length > 0 ? p.scenes[0].id : null;
        selectedObjectId = null;
        playheadMs = 0;
        updateWindowTitle();
        renderAll();
      });
    } else if (ext === "srt" || ext === "vtt") {
      invoke("subtitle_import", { sceneId: activeSceneId, path: path }).then(function () {
        return invoke("project_get");
      }).then(function (p) {
        project = p;
        CitCatRuntime.setProject(p);
        requestRender();
      });
    }
  }

  function doExportMp4() {
    var statusEl = document.getElementById("mp4-status");
    statusEl.hidden = false;
    statusEl.textContent = "Checking ffmpeg...";

    invoke("check_ffmpeg").then(function (version) {
      statusEl.textContent = "ffmpeg found: " + version;
      return invoke("dialog_export_mp4");
    }).then(function (path) {
      if (!path) { statusEl.hidden = true; return; }

      var res = document.getElementById("mp4-resolution").value.split("x");
      var width = parseInt(res[0]);
      var height = parseInt(res[1]);
      var crf = parseInt(document.getElementById("mp4-quality").value);
      var fps = project.meta.fps || 30;
      var totalMs = 0;
      for (var i = 0; i < project.scenes.length; i++) {
        totalMs += project.scenes[i].duration_ms;
      }
      var totalFrames = Math.ceil(totalMs * fps / 1000);

      statusEl.textContent = "Creating temp directory...";
      return invoke("mp4_create_temp_dir").then(function (tempDir) {
        statusEl.textContent = "Rendering frames (0/" + totalFrames + ")...";

        var offCanvas = document.createElement("canvas");
        offCanvas.width = width;
        offCanvas.height = height;
        var offCtx = offCanvas.getContext("2d");

        var frameIndex = 0;
        var sceneIndex = 0;
        var sceneTimeMs = 0;
        var sceneAccumMs = 0;

        function renderNextFrame() {
          if (frameIndex >= totalFrames) {
            statusEl.textContent = "Encoding video with ffmpeg...";
            return invoke("mp4_encode", { tempDir: tempDir, outputPath: path, fps: fps, crf: crf }).then(function () {
              statusEl.textContent = "MP4 export complete!";
              setTimeout(function () { statusEl.hidden = true; }, 3000);
            });
          }

          var timeMs = Math.round(frameIndex * 1000 / fps);
          while (sceneIndex < project.scenes.length - 1 && timeMs >= sceneAccumMs + project.scenes[sceneIndex].duration_ms) {
            sceneAccumMs += project.scenes[sceneIndex].duration_ms;
            sceneIndex++;
          }
          sceneTimeMs = timeMs - sceneAccumMs;

          var scene = project.scenes[sceneIndex];
          offCtx.clearRect(0, 0, width, height);
          var scaleX = width / project.meta.width;
          var scaleY = height / project.meta.height;
          offCtx.save();
          offCtx.scale(scaleX, scaleY);

          offCtx.fillStyle = scene.background.fill || "#ffffff";
          offCtx.fillRect(0, 0, project.meta.width, project.meta.height);

          var objects = scene.objects.slice().sort(function (a, b) { return a.z_index - b.z_index; });
          for (var i = 0; i < objects.length; i++) {
            var obj = CitCatRuntime.resolveObjectAtTime(objects[i], sceneTimeMs);
            if (!obj.visible) continue;
            if (obj.appear_at_ms != null && sceneTimeMs < obj.appear_at_ms) continue;
            if (obj.disappear_at_ms != null && sceneTimeMs > obj.disappear_at_ms) continue;
            renderObjectToCtx(offCtx, obj);
          }
          offCtx.restore();

          var dataUrl = offCanvas.toDataURL("image/png");

          return invoke("mp4_write_frame", { tempDir: tempDir, frameNumber: frameIndex, dataUrl: dataUrl }).then(function () {
            frameIndex++;
            if (frameIndex % 10 === 0) {
              statusEl.textContent = "Rendering frames (" + frameIndex + "/" + totalFrames + ")...";
            }
            return renderNextFrame();
          });
        }

        return renderNextFrame();
      });
    }).catch(function (err) {
      statusEl.textContent = "MP4 export failed: " + err;
      invoke("mp4_cleanup", { tempDir: "" }).catch(function () {});
      var warning = document.getElementById("mp4-ffmpeg-warning");
      if (typeof err === "string" && err.indexOf("ffmpeg not found") >= 0 && warning) {
        warning.hidden = false;
      }
    });
  }

  function renderObjectToCtx(ctx, obj) {
    var t = obj.transform;
    ctx.save();
    if (t.rotation) {
      var cx = t.x + t.width / 2;
      var cy = t.y + t.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate(t.rotation * Math.PI / 180);
      ctx.translate(-cx, -cy);
    }
    ctx.globalAlpha = t.opacity;
    if (obj.filters) {
      ctx.filter = CitCatCanvas.buildFilterString(obj.filters);
    }

    switch (obj.object_type) {
      case "Text":
        ctx.font = obj.style.font_weight + " " + obj.style.font_size + "px " + obj.style.font_family;
        ctx.fillStyle = obj.style.fill;
        ctx.textBaseline = "top";
        ctx.textAlign = obj.style.text_align === "Center" ? "center" : obj.style.text_align === "Right" ? "right" : "left";
        var tx = obj.style.text_align === "Center" ? t.x + t.width / 2 : obj.style.text_align === "Right" ? t.x + t.width : t.x;
        ctx.fillText(obj.content || "", tx, t.y);
        break;
      case "Rect":
        if (obj.style.fill && obj.style.fill !== "transparent") {
          ctx.fillStyle = obj.style.fill;
          ctx.fillRect(t.x, t.y, t.width, t.height);
        }
        break;
      case "Ellipse":
        ctx.beginPath();
        ctx.ellipse(t.x + t.width / 2, t.y + t.height / 2, t.width / 2, t.height / 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = obj.style.fill || "#8b5cf6";
        ctx.fill();
        break;
      case "Button":
        ctx.fillStyle = obj.style.fill;
        ctx.fillRect(t.x, t.y, t.width, t.height);
        ctx.font = obj.style.font_weight + " " + obj.style.font_size + "px " + obj.style.font_family;
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(obj.content || "", t.x + t.width / 2, t.y + t.height / 2);
        break;
    }
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function showExportDialog() {
    document.getElementById("export-modal").hidden = false;
  }

  function hideExportDialog() {
    document.getElementById("export-modal").hidden = true;
  }

  function doExport() {
    var singleFile = document.getElementById("export-single-file").checked;
    var autoplay = document.getElementById("export-autoplay").checked;
    var loop_ = document.getElementById("export-loop").checked;
    var batchEl = document.getElementById("export-batch");
    var doBatch = batchEl && !batchEl.hidden && batchEl.checked;
    var statusEl = document.getElementById("export-status");

    if (doBatch) {
      invoke("dialog_export_folder").then(function (dir) {
        if (!dir) return;
        statusEl.hidden = false;
        statusEl.textContent = "Batch exporting...";
        invoke("export_batch_html", {
          outputDir: dir,
          singleFile: singleFile,
          autoplay: autoplay,
          loopPlayback: loop_,
          nameColumn: null,
        }).then(function (count) {
          statusEl.textContent = "Exported " + count + " files!";
          setTimeout(function () { statusEl.hidden = true; }, 3000);
        }).catch(function (err) {
          statusEl.textContent = "Batch export failed: " + err;
        });
      });
      return;
    }

    invoke("dialog_export_save", { singleFile: singleFile }).then(function (path) {
      if (!path) return;
      statusEl.hidden = false;
      statusEl.textContent = "Exporting...";

      invoke("export_html", {
        path: path,
        singleFile: singleFile,
        autoplay: autoplay,
        loopPlayback: loop_,
      }).then(function () {
        statusEl.textContent = "Export complete!";
        setTimeout(function () { statusEl.hidden = true; }, 3000);
      }).catch(function (err) {
        statusEl.textContent = "Export failed: " + err;
      });
    });
  }

  window.addEventListener("DOMContentLoaded", function () {
    init();

    document.getElementById("btn-export").addEventListener("click", showExportDialog);
    document.getElementById("btn-preview").addEventListener("click", startPreview);
    document.getElementById("btn-data").addEventListener("click", function () {
      CitCatDataPanel.open();
    });

    var mp4Btn = document.getElementById("export-do-mp4");
    if (mp4Btn) mp4Btn.addEventListener("click", doExportMp4);

    document.getElementById("btn-templates").addEventListener("click", showTemplateModal);
    document.getElementById("template-close").addEventListener("click", function () {
      document.getElementById("template-modal").hidden = true;
    });
    document.getElementById("template-save-btn").addEventListener("click", saveAsTemplate);
    document.getElementById("template-modal").addEventListener("click", function (e) {
      if (e.target === this) this.hidden = true;
    });

    document.getElementById("btn-subtitles").addEventListener("click", showSubtitleModal);
    document.getElementById("subtitle-close").addEventListener("click", function () {
      document.getElementById("subtitle-modal").hidden = true;
    });
    document.getElementById("subtitle-import-btn").addEventListener("click", importSubtitles);
    document.getElementById("subtitle-export-srt-btn").addEventListener("click", function () { exportSubtitles("srt"); });
    document.getElementById("subtitle-export-vtt-btn").addEventListener("click", function () { exportSubtitles("vtt"); });
    document.getElementById("subtitle-clear-btn").addEventListener("click", clearSubtitles);
    document.getElementById("subtitle-modal").addEventListener("click", function (e) {
      if (e.target === this) this.hidden = true;
    });

    initDragAndDrop();

    invoke("check_ffmpeg").then(function () {
      var warning = document.getElementById("mp4-ffmpeg-warning");
      if (warning) warning.hidden = true;
    }).catch(function () {
      var warning = document.getElementById("mp4-ffmpeg-warning");
      if (warning) warning.hidden = false;
    });
    document.getElementById("export-close").addEventListener("click", hideExportDialog);
    document.getElementById("export-do").addEventListener("click", doExport);

    document.getElementById("export-modal").addEventListener("click", function (e) {
      if (e.target === this) hideExportDialog();
    });

    document.querySelectorAll(".export-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".export-tab").forEach(function (t) { t.classList.remove("active"); });
        document.querySelectorAll(".export-tab-content").forEach(function (c) { c.hidden = true; });
        this.classList.add("active");
        document.getElementById("export-tab-" + this.dataset.tab).hidden = false;
      });
    });
  });

  return {
    requestRender: requestRender,
    getActiveScene: getActiveScene,
    getSelectedObject: getSelectedObject,
    getActiveTool: getActiveTool,
    selectObject: selectObject,
    addObjectAtPosition: addObjectAtPosition,
    deleteSelected: deleteSelected,
    commitObjectTransform: commitObjectTransform,
    updateObjectTransform: updateObjectTransform,
    updateObjectStyle: updateObjectStyle,
    updateObjectField: updateObjectField,
    updateStyleField: updateStyleField,
    reorderObject: reorderObject,
    switchScene: switchScene,
    addScene: addScene,
    deleteScene: deleteScene,
    renameScene: renameScene,
    updateSceneTransition: updateSceneTransition,
    newProject: newProject,
    saveProject: saveProject,
    openProject: openProject,
    setPlayheadTime: setPlayheadTime,
    getPlayheadTime: getPlayheadTime,
    playToggle: playToggle,
    playStop: playStop,
    applyEffect: applyEffect,
    getProject: getProject,
    addEvent: addEvent,
    updateEvent: updateEvent,
    deleteEvent: deleteEvent,
    getScenes: getScenes,
    getSceneObjects: getSceneObjects,
    isPlayMode: function () { return isPlaying; },
    toggleMultiSelect: toggleMultiSelect,
    selectMultiple: selectMultiple,
    getSelectedObjectIds: getSelectedObjectIds,
    alignObjects: alignObjects,
    commitMultiTransform: commitMultiTransform,
    updateObjectForId: updateObjectForId,
    reorderObjectTo: reorderObjectTo,
    commitMotionPath: commitMotionPath,
    clearMotionPath: clearMotionPath,
    addPathProgressKeyframes: addPathProgressKeyframes,
    addBinding: addBinding,
    deleteBinding: deleteBinding,
    setCondition: setCondition,
    setPreviewRowData: setPreviewRowData,
    getPreviewRowData: getPreviewRowData,
    isDataConnected: isDataConnected,
    setDataConnected: setDataConnected,
    undo: undo,
    redo: redo,
    duplicateSelected: duplicateSelected,
    copySelected: copySelected,
    pasteObject: pasteObject,
    pushUndo: pushUndo,
    toggleGridSnap: toggleGridSnap,
    isGridSnap: isGridSnap,
    snapToGrid: snapToGrid,
    updateObjectFilters: updateObjectFilters,
    startPreview: startPreview,
    reorderScenes: reorderScenes,
    reloadEffects: reloadEffects,
    showTemplateModal: showTemplateModal,
    showSubtitleModal: showSubtitleModal,
    saveProjectAs: saveProjectAs,
    addObjectOfType: addObjectOfType,
    nextScene: nextScene,
    prevScene: prevScene,
    addVideoObject: addVideoObject,
    addAudioObject: addAudioObject,
    addSvgObject: addSvgObject,
  };
})();
