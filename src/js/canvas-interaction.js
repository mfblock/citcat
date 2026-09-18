var CitCatInteraction = (function () {
  var invoke = window.__TAURI__.core.invoke;
  var isDragging = false;
  var isPanning = false;
  var isResizing = false;
  var isDraggingPathPoint = false;
  var isDraggingControlPoint = false;
  var isRubberBand = false;
  var dragPathPointIndex = -1;
  var dragControlType = null;
  var dragStart = { x: 0, y: 0 };
  var objStart = { x: 0, y: 0, w: 0, h: 0 };
  var activeHandle = null;
  var rubberBandStart = { x: 0, y: 0 };
  var multiDragStarts = {};

  function init() {
    var canvas = CitCatCanvas.getCanvas();

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("dblclick", onDblClick);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    window.addEventListener("keydown", function (e) {
      if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || document.activeElement.tagName === "SELECT") return;
      if (e.code === "Delete" || e.code === "Backspace") {
        CitCatApp.deleteSelected();
      }
    });
  }

  function onMouseDown(e) {
    var canvas = CitCatCanvas.getCanvas();
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    if (e.button === 1) {
      isPanning = true;
      dragStart.x = e.clientX;
      dragStart.y = e.clientY;
      canvas.style.cursor = "grabbing";
      return;
    }

    if (e.button !== 0) return;

    if (CitCatApp.isPlayMode()) return;

    var pan = CitCatCanvas.getPan();
    var zoom = CitCatCanvas.getZoom();
    var stage = CitCatMath.screenToStage(mx, my, pan, zoom);

    var tool = CitCatApp.getActiveTool();
    if (tool === "path") {
      handlePathToolClick(stage.x, stage.y);
      return;
    }
    if (tool !== "select") {
      CitCatApp.addObjectAtPosition(tool, stage.x, stage.y);
      return;
    }

    // Path point dragging
    var selectedObj = CitCatApp.getSelectedObject();
    if (selectedObj && selectedObj.motion_path) {
      var pathHit = hitTestPathPoint(stage.x, stage.y, selectedObj.motion_path);
      if (pathHit) {
        if (pathHit.type === "point") {
          isDraggingPathPoint = true;
          dragPathPointIndex = pathHit.index;
          dragStart.x = stage.x;
          dragStart.y = stage.y;
        } else {
          isDraggingControlPoint = true;
          dragPathPointIndex = pathHit.index;
          dragControlType = pathHit.type;
          dragStart.x = stage.x;
          dragStart.y = stage.y;
        }
        return;
      }
    }

    // Handle resize
    if (selectedObj) {
      var handle = CitCatMath.hitTestHandle(stage.x, stage.y, selectedObj);
      if (handle) {
        isResizing = true;
        activeHandle = handle;
        var t = selectedObj.transform;
        objStart = { x: t.x, y: t.y, w: t.width, h: t.height };
        dragStart.x = stage.x;
        dragStart.y = stage.y;
        return;
      }
    }

    var scene = CitCatApp.getActiveScene();
    if (!scene) return;

    var sorted = scene.objects.slice().sort(function (a, b) {
      return a.z_index - b.z_index;
    });
    var hit = CitCatCanvas.hitTest(stage.x, stage.y, sorted);

    if (hit) {
      if (e.shiftKey) {
        CitCatApp.toggleMultiSelect(hit.id);
      } else {
        var selIds = CitCatApp.getSelectedObjectIds();
        if (selIds && selIds.has && selIds.has(hit.id)) {
          // Already in multi-select, start multi-drag
        } else {
          CitCatApp.selectObject(hit.id);
        }
      }
      isDragging = true;
      dragStart.x = stage.x;
      dragStart.y = stage.y;

      // Store start positions for multi-drag
      multiDragStarts = {};
      var ids = CitCatApp.getSelectedObjectIds();
      if (ids && ids.forEach) {
        ids.forEach(function (id) {
          var obj = scene.objects.find(function (o) { return o.id === id; });
          if (obj) multiDragStarts[id] = { x: obj.transform.x, y: obj.transform.y };
        });
      }
      if (!multiDragStarts[hit.id]) {
        multiDragStarts[hit.id] = { x: hit.transform.x, y: hit.transform.y };
      }
      objStart.x = hit.transform.x;
      objStart.y = hit.transform.y;
    } else {
      if (!e.shiftKey) {
        CitCatApp.selectObject(null);
      }
      // Start rubber band selection
      isRubberBand = true;
      rubberBandStart.x = stage.x;
      rubberBandStart.y = stage.y;
    }
  }

  function onMouseMove(e) {
    var canvas = CitCatCanvas.getCanvas();

    if (isPanning) {
      var dx = e.clientX - dragStart.x;
      var dy = e.clientY - dragStart.y;
      CitCatCanvas.applyPan(dx, dy);
      dragStart.x = e.clientX;
      dragStart.y = e.clientY;
      CitCatApp.requestRender();
      return;
    }

    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var pan = CitCatCanvas.getPan();
    var zoom = CitCatCanvas.getZoom();
    var stage = CitCatMath.screenToStage(mx, my, pan, zoom);

    if (isDraggingPathPoint) {
      var obj = CitCatApp.getSelectedObject();
      if (obj && obj.motion_path && obj.motion_path.points[dragPathPointIndex]) {
        var pt = obj.motion_path.points[dragPathPointIndex];
        var odx = stage.x - dragStart.x;
        var ody = stage.y - dragStart.y;
        pt.x += odx;
        pt.y += ody;
        if (pt.control_in) { pt.control_in.x += odx; pt.control_in.y += ody; }
        if (pt.control_out) { pt.control_out.x += odx; pt.control_out.y += ody; }
        dragStart.x = stage.x;
        dragStart.y = stage.y;
        CitCatApp.requestRender();
      }
      return;
    }

    if (isDraggingControlPoint) {
      var obj = CitCatApp.getSelectedObject();
      if (obj && obj.motion_path && obj.motion_path.points[dragPathPointIndex]) {
        var pt = obj.motion_path.points[dragPathPointIndex];
        var cp = dragControlType === "control_in" ? pt.control_in : pt.control_out;
        if (cp) {
          cp.x = stage.x;
          cp.y = stage.y;
          CitCatApp.requestRender();
        }
      }
      return;
    }

    if (isRubberBand) {
      // TODO: draw rubber band rectangle on canvas overlay
      CitCatApp.requestRender();
      return;
    }

    if (!isDragging && !isResizing) {
      var selectedObj = CitCatApp.getSelectedObject();
      if (selectedObj) {
        var handle = CitCatMath.hitTestHandle(stage.x, stage.y, selectedObj);
        canvas.style.cursor = handle ? handle.cursor : "default";
      }
      return;
    }

    var dx = stage.x - dragStart.x;
    var dy = stage.y - dragStart.y;

    if (isDragging) {
      var scene = CitCatApp.getActiveScene();
      var ids = CitCatApp.getSelectedObjectIds();
      if (ids && ids.size > 1 && scene) {
        ids.forEach(function (id) {
          var obj = scene.objects.find(function (o) { return o.id === id; });
          if (obj && multiDragStarts[id]) {
            obj.transform.x = Math.round(multiDragStarts[id].x + dx);
            obj.transform.y = Math.round(multiDragStarts[id].y + dy);
          }
        });
      } else {
        var obj = CitCatApp.getSelectedObject();
        if (obj) {
          obj.transform.x = CitCatApp.snapToGrid(Math.round(objStart.x + dx));
          obj.transform.y = CitCatApp.snapToGrid(Math.round(objStart.y + dy));
        }
      }
      CitCatApp.requestRender();
    }

    if (isResizing) {
      var obj = CitCatApp.getSelectedObject();
      if (!obj) return;
      var t = obj.transform;
      var minSize = 10;

      if (e.shiftKey && isCornerHandle(activeHandle.id)) {
        var aspect = objStart.w / objStart.h;
        var newW, newH;
        switch (activeHandle.id) {
          case "br":
            newW = Math.max(minSize, Math.round(objStart.w + dx));
            newH = Math.round(newW / aspect);
            t.width = newW;
            t.height = Math.max(minSize, newH);
            break;
          case "bl":
            newW = Math.max(minSize, Math.round(objStart.w - dx));
            newH = Math.round(newW / aspect);
            t.x = Math.round(objStart.x + objStart.w - newW);
            t.width = newW;
            t.height = Math.max(minSize, newH);
            break;
          case "tr":
            newW = Math.max(minSize, Math.round(objStart.w + dx));
            newH = Math.round(newW / aspect);
            t.y = Math.round(objStart.y + objStart.h - newH);
            t.width = newW;
            t.height = Math.max(minSize, newH);
            break;
          case "tl":
            newW = Math.max(minSize, Math.round(objStart.w - dx));
            newH = Math.round(newW / aspect);
            t.x = Math.round(objStart.x + objStart.w - newW);
            t.y = Math.round(objStart.y + objStart.h - newH);
            t.width = newW;
            t.height = Math.max(minSize, newH);
            break;
        }
      } else {
        switch (activeHandle.id) {
          case "br":
            t.width = Math.max(minSize, Math.round(objStart.w + dx));
            t.height = Math.max(minSize, Math.round(objStart.h + dy));
            break;
          case "bl":
            t.x = Math.round(objStart.x + dx);
            t.width = Math.max(minSize, Math.round(objStart.w - dx));
            t.height = Math.max(minSize, Math.round(objStart.h + dy));
            break;
          case "tr":
            t.y = Math.round(objStart.y + dy);
            t.width = Math.max(minSize, Math.round(objStart.w + dx));
            t.height = Math.max(minSize, Math.round(objStart.h - dy));
            break;
          case "tl":
            t.x = Math.round(objStart.x + dx);
            t.y = Math.round(objStart.y + dy);
            t.width = Math.max(minSize, Math.round(objStart.w - dx));
            t.height = Math.max(minSize, Math.round(objStart.h - dy));
            break;
          case "tc":
            t.y = Math.round(objStart.y + dy);
            t.height = Math.max(minSize, Math.round(objStart.h - dy));
            break;
          case "bc":
            t.height = Math.max(minSize, Math.round(objStart.h + dy));
            break;
          case "ml":
            t.x = Math.round(objStart.x + dx);
            t.width = Math.max(minSize, Math.round(objStart.w - dx));
            break;
          case "mr":
            t.width = Math.max(minSize, Math.round(objStart.w + dx));
            break;
        }
      }
      CitCatApp.requestRender();
    }
  }

  function isCornerHandle(id) {
    return id === "tl" || id === "tr" || id === "bl" || id === "br";
  }

  function onMouseUp(e) {
    var canvas = CitCatCanvas.getCanvas();

    if (isPanning) {
      isPanning = false;
      canvas.style.cursor = "default";
      return;
    }

    if (isDraggingPathPoint || isDraggingControlPoint) {
      var obj = CitCatApp.getSelectedObject();
      if (obj && obj.motion_path) {
        CitCatApp.commitMotionPath(obj);
      }
      isDraggingPathPoint = false;
      isDraggingControlPoint = false;
      dragPathPointIndex = -1;
      dragControlType = null;
      return;
    }

    if (isRubberBand) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var pan = CitCatCanvas.getPan();
      var zoom = CitCatCanvas.getZoom();
      var stageEnd = CitCatMath.screenToStage(mx, my, pan, zoom);

      var x1 = Math.min(rubberBandStart.x, stageEnd.x);
      var y1 = Math.min(rubberBandStart.y, stageEnd.y);
      var x2 = Math.max(rubberBandStart.x, stageEnd.x);
      var y2 = Math.max(rubberBandStart.y, stageEnd.y);

      if (Math.abs(x2 - x1) > 5 || Math.abs(y2 - y1) > 5) {
        var scene = CitCatApp.getActiveScene();
        if (scene) {
          var hitIds = [];
          for (var i = 0; i < scene.objects.length; i++) {
            var obj = scene.objects[i];
            if (!obj.visible || obj.locked) continue;
            var t = obj.transform;
            if (t.x < x2 && t.x + t.width > x1 && t.y < y2 && t.y + t.height > y1) {
              hitIds.push(obj.id);
            }
          }
          if (hitIds.length > 0) {
            CitCatApp.selectMultiple(hitIds);
          }
        }
      }
      isRubberBand = false;
      CitCatApp.requestRender();
      return;
    }

    if (isDragging || isResizing) {
      var ids = CitCatApp.getSelectedObjectIds();
      if (ids && ids.size > 1) {
        CitCatApp.commitMultiTransform();
      } else {
        var obj = CitCatApp.getSelectedObject();
        if (obj) {
          CitCatApp.commitObjectTransform(obj);
        }
      }
    }

    isDragging = false;
    isResizing = false;
    activeHandle = null;
    multiDragStarts = {};
    canvas.style.cursor = "default";
  }

  function handlePathToolClick(stageX, stageY) {
    var obj = CitCatApp.getSelectedObject();
    if (!obj) return;

    var scene = CitCatApp.getActiveScene();
    if (!scene) return;

    var point = { x: stageX, y: stageY, control_in: null, control_out: null };
    var pointIndex = obj.motion_path ? obj.motion_path.points.length : 0;

    invoke("path_add_point", {
      sceneId: scene.id,
      objectId: obj.id,
      pointIndex: pointIndex,
      point: point,
    }).then(function (path) {
      obj.motion_path = path;
      if (path.points.length === 2) {
        CitCatApp.addPathProgressKeyframes(obj);
      }
      CitCatApp.requestRender();
    });
  }

  function hitTestPathPoint(stageX, stageY, path) {
    if (!path || !path.points) return null;
    var threshold = 10 / CitCatCanvas.getZoom();

    for (var i = 0; i < path.points.length; i++) {
      var pt = path.points[i];
      if (pt.control_in) {
        var dx = stageX - pt.control_in.x;
        var dy = stageY - pt.control_in.y;
        if (Math.sqrt(dx * dx + dy * dy) < threshold) {
          return { type: "control_in", index: i };
        }
      }
      if (pt.control_out) {
        var dx = stageX - pt.control_out.x;
        var dy = stageY - pt.control_out.y;
        if (Math.sqrt(dx * dx + dy * dy) < threshold) {
          return { type: "control_out", index: i };
        }
      }
    }

    for (var i = 0; i < path.points.length; i++) {
      var pt = path.points[i];
      var dx = stageX - pt.x;
      var dy = stageY - pt.y;
      if (Math.sqrt(dx * dx + dy * dy) < threshold) {
        return { type: "point", index: i };
      }
    }
    return null;
  }

  function onDblClick(e) {
    if (CitCatApp.isPlayMode()) return;
    var canvas = CitCatCanvas.getCanvas();
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var pan = CitCatCanvas.getPan();
    var zoom = CitCatCanvas.getZoom();
    var stage = CitCatMath.screenToStage(mx, my, pan, zoom);

    var obj = CitCatApp.getSelectedObject();
    if (obj && obj.motion_path && obj.motion_path.points.length > 1) {
      var pathHit = hitTestPathPoint(stage.x, stage.y, obj.motion_path);
      if (pathHit && pathHit.type === "point") {
        var scene = CitCatApp.getActiveScene();
        if (scene) {
          invoke("path_delete_point", {
            sceneId: scene.id,
            objectId: obj.id,
            pointIndex: pathHit.index,
          }).then(function (path) {
            obj.motion_path = path && path.points && path.points.length > 0 ? path : null;
            CitCatApp.requestRender();
          });
        }
      }
    }
  }

  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      CitCatCanvas.applyZoom(e.deltaY);
      CitCatApp.requestRender();
    }
  }

  return {
    init: init,
  };
})();
