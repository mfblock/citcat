var CitCatTimeline = (function () {
  var invoke = window.__TAURI__.core.invoke;

  var container = null;
  var rulerCanvas = null;
  var tracksContainer = null;
  var rulerCtx = null;
  var playheadEl = null;

  var LABEL_WIDTH = 120;
  var RULER_HEIGHT = 24;
  var TRACK_HEIGHT = 28;
  var PX_PER_MS = 0.15;
  var DIAMOND_SIZE = 8;

  var scrollLeft = 0;
  var draggingPlayhead = false;
  var draggingKeyframe = null;
  var selectedKeyframeId = null;
  var contextMenuKf = null;
  var draggingWaitPoint = null;
  var contextMenuWp = null;
  var wpConfigPopup = null;

  function init() {
    container = document.getElementById("timeline-content");
    container.innerHTML = "";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.alignItems = "";
    container.style.justifyContent = "";
    container.style.position = "relative";
    container.style.overflow = "hidden";

    var rulerRow = document.createElement("div");
    rulerRow.className = "tl-ruler-row";
    container.appendChild(rulerRow);

    var rulerLabel = document.createElement("div");
    rulerLabel.className = "tl-label tl-ruler-label";
    rulerRow.appendChild(rulerLabel);

    rulerCanvas = document.createElement("canvas");
    rulerCanvas.className = "tl-ruler-canvas";
    rulerRow.appendChild(rulerCanvas);
    rulerCtx = rulerCanvas.getContext("2d");

    tracksContainer = document.createElement("div");
    tracksContainer.className = "tl-tracks";
    container.appendChild(tracksContainer);

    playheadEl = document.createElement("div");
    playheadEl.className = "tl-playhead";
    container.appendChild(playheadEl);

    rulerCanvas.addEventListener("mousedown", onRulerMouseDown);
    rulerCanvas.addEventListener("dblclick", onRulerDblClick);
    tracksContainer.addEventListener("mousedown", onTracksMouseDown);
    tracksContainer.addEventListener("dblclick", onTracksDblClick);
    tracksContainer.addEventListener("contextmenu", onTracksContextMenu);
    container.addEventListener("mousedown", onWaitPointMouseDown);
    container.addEventListener("contextmenu", onWaitPointContextMenu);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    container.addEventListener("wheel", onWheel, { passive: false });

    createContextMenu();
    createWaitPointContextMenu();
  }

  function msToX(ms) {
    return LABEL_WIDTH + ms * PX_PER_MS - scrollLeft;
  }

  function xToMs(x) {
    return Math.max(0, Math.round((x - LABEL_WIDTH + scrollLeft) / PX_PER_MS));
  }

  function render(scene, activeSceneId, selectedObjId, playheadMs) {
    if (!container || !scene) return;

    var totalWidth = container.clientWidth;
    var trackAreaWidth = totalWidth - LABEL_WIDTH;
    rulerCanvas.width = trackAreaWidth;
    rulerCanvas.height = RULER_HEIGHT;

    drawRuler(scene.duration_ms, trackAreaWidth, scene.wait_points || []);
    drawTracks(scene, selectedObjId);
    drawWaitPointMarkers(scene.wait_points || [], scene.duration_ms);
    updatePlayhead(playheadMs, scene.duration_ms);
  }

  function drawRuler(durationMs, width, waitPoints) {
    var ctx = rulerCtx;
    ctx.clearRect(0, 0, width, RULER_HEIGHT);
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, width, RULER_HEIGHT);

    var startMs = Math.floor(scrollLeft / PX_PER_MS / 100) * 100;
    var endMs = Math.ceil((scrollLeft + width) / PX_PER_MS / 100) * 100;

    ctx.strokeStyle = "#555";
    ctx.fillStyle = "#999";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "center";

    for (var ms = startMs; ms <= Math.min(endMs, durationMs); ms += 100) {
      var x = ms * PX_PER_MS - scrollLeft;
      if (x < 0 || x > width) continue;

      if (ms % 1000 === 0) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, RULER_HEIGHT);
        ctx.stroke();
        ctx.fillText((ms / 1000) + "s", x, 14);
      } else if (ms % 500 === 0) {
        ctx.beginPath();
        ctx.moveTo(x, RULER_HEIGHT - 10);
        ctx.lineTo(x, RULER_HEIGHT);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x, RULER_HEIGHT - 5);
        ctx.lineTo(x, RULER_HEIGHT);
        ctx.stroke();
      }
    }

    if (waitPoints) {
      for (var wi = 0; wi < waitPoints.length; wi++) {
        var wpX = waitPoints[wi].time_ms * PX_PER_MS - scrollLeft;
        if (wpX < 0 || wpX > width) continue;
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(wpX, 0);
        ctx.lineTo(wpX, RULER_HEIGHT);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = "#f59e0b";
        ctx.font = "9px -apple-system, sans-serif";
        ctx.textAlign = "center";
        var wpType = waitPoints[wi].resume_on.type || waitPoints[wi].resume_on;
        var label = wpType === "Timer" ? "⏸" : wpType === "AnyClick" || wpType === "Click" ? "👆" : "⏸👆";
        ctx.fillText(label, wpX, 10);
        ctx.textAlign = "center";
      }
    }

    var durX = durationMs * PX_PER_MS - scrollLeft;
    if (durX >= 0 && durX <= width) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(durX, 0);
      ctx.lineTo(durX, RULER_HEIGHT);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  function drawTracks(scene, selectedObjId) {
    tracksContainer.innerHTML = "";
    var objects = scene.objects.slice().sort(function (a, b) {
      return b.z_index - a.z_index;
    });

    for (var i = 0; i < objects.length; i++) {
      var obj = objects[i];
      var row = document.createElement("div");
      row.className = "tl-track-row" + (obj.id === selectedObjId ? " selected" : "");
      row.dataset.objectId = obj.id;

      var label = document.createElement("div");
      label.className = "tl-label";
      label.textContent = obj.name;
      label.title = obj.name;
      row.appendChild(label);

      var track = document.createElement("div");
      track.className = "tl-track";
      track.dataset.objectId = obj.id;

      var bar = document.createElement("div");
      bar.className = "tl-track-bar";
      var barStart = msToX(0) - LABEL_WIDTH;
      var barEnd = msToX(scene.duration_ms) - LABEL_WIDTH;
      bar.style.left = Math.max(0, barStart) + "px";
      bar.style.width = Math.max(0, barEnd - Math.max(0, barStart)) + "px";
      track.appendChild(bar);

      if (obj.keyframes) {
        for (var k = 0; k < obj.keyframes.length; k++) {
          var kf = obj.keyframes[k];
          var diamond = document.createElement("div");
          diamond.className = "tl-diamond" + (kf.id === selectedKeyframeId ? " selected" : "");
          var kfX = msToX(kf.time_ms) - LABEL_WIDTH - DIAMOND_SIZE / 2;
          diamond.style.left = kfX + "px";
          diamond.dataset.keyframeId = kf.id;
          diamond.dataset.objectId = obj.id;
          diamond.dataset.timeMs = kf.time_ms;
          diamond.dataset.property = kf.property;
          diamond.title = kf.property + " @ " + kf.time_ms + "ms (" + kf.easing + ")";
          track.appendChild(diamond);
        }
      }

      row.appendChild(track);
      tracksContainer.appendChild(row);
    }
  }

  function drawWaitPointMarkers(waitPoints, durationMs) {
    var existing = container.querySelectorAll(".tl-waitpoint-marker");
    for (var i = 0; i < existing.length; i++) existing[i].remove();

    if (!waitPoints) return;
    for (var i = 0; i < waitPoints.length; i++) {
      var wp = waitPoints[i];
      var x = msToX(wp.time_ms);
      var marker = document.createElement("div");
      marker.className = "tl-waitpoint-marker";
      marker.style.left = x + "px";
      marker.style.top = RULER_HEIGHT + "px";
      marker.style.height = (container.clientHeight - RULER_HEIGHT) + "px";
      marker.dataset.waitpointId = wp.id;
      marker.dataset.timeMs = wp.time_ms;
      marker.title = formatWaitPointTooltip(wp);
      container.appendChild(marker);
    }
  }

  function formatWaitPointTooltip(wp) {
    var type = wp.resume_on.type || wp.resume_on;
    switch (type) {
      case "AnyClick": return "Wait @ " + wp.time_ms + "ms — resume on any click";
      case "Click": return "Wait @ " + wp.time_ms + "ms — resume on click: " + (wp.resume_on.object_id || "?");
      case "Timer": return "Wait @ " + wp.time_ms + "ms — resume after " + wp.resume_on.delay_ms + "ms";
      case "ClickOrTimer": return "Wait @ " + wp.time_ms + "ms — click or " + wp.resume_on.delay_ms + "ms";
      default: return "Wait @ " + wp.time_ms + "ms";
    }
  }

  function updatePlayhead(timeMs) {
    if (!playheadEl) return;
    var x = msToX(timeMs);
    playheadEl.style.left = x + "px";
    playheadEl.style.top = "0";
    playheadEl.style.height = container.clientHeight + "px";
  }

  function onRulerMouseDown(e) {
    draggingPlayhead = true;
    var rect = rulerCanvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var ms = xToMs(x + LABEL_WIDTH);
    var scene = CitCatApp.getActiveScene();
    if (scene) {
      ms = Math.min(ms, scene.duration_ms);
    }
    CitCatApp.setPlayheadTime(ms);
  }

  function onTracksMouseDown(e) {
    var diamond = e.target.closest(".tl-diamond");
    if (diamond) {
      draggingKeyframe = {
        keyframeId: diamond.dataset.keyframeId,
        objectId: diamond.dataset.objectId,
        startX: e.clientX,
        startMs: parseInt(diamond.dataset.timeMs),
      };
      selectedKeyframeId = diamond.dataset.keyframeId;
      CitCatApp.requestRender();
      e.preventDefault();
      return;
    }

    var track = e.target.closest(".tl-track");
    if (track) {
      draggingPlayhead = true;
      var rect = track.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var ms = xToMs(x + LABEL_WIDTH);
      var scene = CitCatApp.getActiveScene();
      if (scene) ms = Math.min(ms, scene.duration_ms);
      CitCatApp.setPlayheadTime(ms);
    }

    var row = e.target.closest(".tl-track-row");
    if (row && row.dataset.objectId) {
      CitCatApp.selectObject(row.dataset.objectId);
    }
  }

  function onTracksDblClick(e) {
    var track = e.target.closest(".tl-track");
    if (!track) return;
    var objectId = track.dataset.objectId;
    if (!objectId) return;

    var rect = track.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var timeMs = xToMs(x + LABEL_WIDTH);
    var scene = CitCatApp.getActiveScene();
    if (scene) timeMs = Math.min(timeMs, scene.duration_ms);

    var sceneId = scene ? scene.id : null;
    if (!sceneId) return;

    var obj = scene.objects.find(function (o) { return o.id === objectId; });
    if (!obj) return;

    invoke("keyframe_add", {
      sceneId: sceneId,
      objectId: objectId,
      timeMs: timeMs,
      property: "transform.opacity",
      value: { type: "Number", value: obj.transform.opacity },
      easing: "Linear",
    }).then(function (kf) {
      obj.keyframes.push(kf);
      CitCatApp.requestRender();
    });
  }

  function onTracksContextMenu(e) {
    var diamond = e.target.closest(".tl-diamond");
    if (!diamond) return;
    e.preventDefault();

    contextMenuKf = {
      keyframeId: diamond.dataset.keyframeId,
      objectId: diamond.dataset.objectId,
    };

    var menu = document.getElementById("tl-context-menu");
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";
    menu.hidden = false;
  }

  function createContextMenu() {
    var menu = document.createElement("div");
    menu.id = "tl-context-menu";
    menu.className = "tl-context-menu";
    menu.hidden = true;

    var deleteItem = document.createElement("div");
    deleteItem.className = "tl-context-item";
    deleteItem.textContent = "Delete keyframe";
    deleteItem.addEventListener("click", function () {
      if (!contextMenuKf) return;
      var scene = CitCatApp.getActiveScene();
      if (!scene) return;
      invoke("keyframe_delete", {
        sceneId: scene.id,
        objectId: contextMenuKf.objectId,
        keyframeId: contextMenuKf.keyframeId,
      }).then(function () {
        var obj = scene.objects.find(function (o) { return o.id === contextMenuKf.objectId; });
        if (obj) {
          obj.keyframes = obj.keyframes.filter(function (k) {
            return k.id !== contextMenuKf.keyframeId;
          });
        }
        if (selectedKeyframeId === contextMenuKf.keyframeId) selectedKeyframeId = null;
        contextMenuKf = null;
        CitCatApp.requestRender();
      });
      menu.hidden = true;
    });
    menu.appendChild(deleteItem);

    var easings = ["Linear", "EaseIn", "EaseOut", "EaseInOut"];
    for (var i = 0; i < easings.length; i++) {
      (function (easing) {
        var item = document.createElement("div");
        item.className = "tl-context-item";
        item.textContent = "Easing: " + easing;
        item.addEventListener("click", function () {
          if (!contextMenuKf) return;
          var scene = CitCatApp.getActiveScene();
          if (!scene) return;
          invoke("keyframe_update", {
            sceneId: scene.id,
            objectId: contextMenuKf.objectId,
            keyframeId: contextMenuKf.keyframeId,
            easing: easing,
          }).then(function (updated) {
            var obj = scene.objects.find(function (o) { return o.id === contextMenuKf.objectId; });
            if (obj) {
              var idx = obj.keyframes.findIndex(function (k) { return k.id === updated.id; });
              if (idx >= 0) obj.keyframes[idx] = updated;
            }
            contextMenuKf = null;
            CitCatApp.requestRender();
          });
          menu.hidden = true;
        });
        menu.appendChild(item);
      })(easings[i]);
    }

    document.body.appendChild(menu);
    document.addEventListener("click", function (e) {
      if (!e.target.closest("#tl-context-menu")) {
        menu.hidden = true;
      }
    });
  }

  function onRulerDblClick(e) {
    var rect = rulerCanvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var ms = xToMs(x + LABEL_WIDTH);
    var scene = CitCatApp.getActiveScene();
    if (!scene) return;
    ms = Math.min(ms, scene.duration_ms);
    showWaitPointConfig(ms, null, e.clientX, e.clientY);
  }

  function onWaitPointMouseDown(e) {
    var marker = e.target.closest(".tl-waitpoint-marker");
    if (!marker) return;
    e.preventDefault();
    draggingWaitPoint = {
      id: marker.dataset.waitpointId,
      startX: e.clientX,
      startMs: parseInt(marker.dataset.timeMs),
    };
  }

  function onWaitPointContextMenu(e) {
    var marker = e.target.closest(".tl-waitpoint-marker");
    if (!marker) return;
    e.preventDefault();
    contextMenuWp = { waitpointId: marker.dataset.waitpointId };
    var menu = document.getElementById("tl-wp-context-menu");
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";
    menu.hidden = false;
  }

  function createWaitPointContextMenu() {
    var menu = document.createElement("div");
    menu.id = "tl-wp-context-menu";
    menu.className = "tl-context-menu";
    menu.hidden = true;

    var editItem = document.createElement("div");
    editItem.className = "tl-context-item";
    editItem.textContent = "Edit wait point";
    editItem.addEventListener("click", function () {
      if (!contextMenuWp) return;
      menu.hidden = true;
      var scene = CitCatApp.getActiveScene();
      if (!scene) return;
      var wp = scene.wait_points.find(function (w) { return w.id === contextMenuWp.waitpointId; });
      if (!wp) return;
      showWaitPointConfig(wp.time_ms, wp, menu.getBoundingClientRect().left, menu.getBoundingClientRect().top);
      contextMenuWp = null;
    });
    menu.appendChild(editItem);

    var deleteItem = document.createElement("div");
    deleteItem.className = "tl-context-item";
    deleteItem.textContent = "Delete wait point";
    deleteItem.addEventListener("click", function () {
      if (!contextMenuWp) return;
      var scene = CitCatApp.getActiveScene();
      if (!scene) return;
      invoke("waitpoint_delete", {
        sceneId: scene.id,
        waitpointId: contextMenuWp.waitpointId,
      }).then(function () {
        scene.wait_points = scene.wait_points.filter(function (w) {
          return w.id !== contextMenuWp.waitpointId;
        });
        contextMenuWp = null;
        CitCatApp.requestRender();
      });
      menu.hidden = true;
    });
    menu.appendChild(deleteItem);

    document.body.appendChild(menu);
    document.addEventListener("click", function (e) {
      if (!e.target.closest("#tl-wp-context-menu")) {
        menu.hidden = true;
      }
    });
  }

  function showWaitPointConfig(timeMs, existingWp, px, py) {
    if (wpConfigPopup) wpConfigPopup.remove();

    var popup = document.createElement("div");
    popup.className = "tl-wp-config";
    popup.style.position = "fixed";
    popup.style.left = px + "px";
    popup.style.top = py + "px";
    popup.style.zIndex = "200";

    var scene = CitCatApp.getActiveScene();
    var objects = scene ? scene.objects : [];

    var html = '<div class="tl-wp-config-inner">';
    html += '<div class="tl-wp-config-row"><label>Time (ms)<input type="number" id="wp-time" value="' + timeMs + '" min="0" step="100"></label></div>';
    html += '<div class="tl-wp-config-row"><label>Resume on<select id="wp-resume-type">';
    var types = [
      { val: "AnyClick", label: "Any click" },
      { val: "Click", label: "Click on object" },
      { val: "Timer", label: "Timer" },
      { val: "ClickOrTimer", label: "Click or timer" },
    ];
    var currentType = existingWp ? (existingWp.resume_on.type || existingWp.resume_on) : "AnyClick";
    for (var i = 0; i < types.length; i++) {
      html += '<option value="' + types[i].val + '"' + (currentType === types[i].val ? ' selected' : '') + '>' + types[i].label + '</option>';
    }
    html += '</select></label></div>';
    html += '<div id="wp-object-row" class="tl-wp-config-row" style="display:none"><label>Object<select id="wp-object-id">';
    for (var i = 0; i < objects.length; i++) {
      var sel = existingWp && existingWp.resume_on.object_id === objects[i].id ? ' selected' : '';
      html += '<option value="' + objects[i].id + '"' + sel + '>' + objects[i].name + '</option>';
    }
    html += '</select></label></div>';
    var delayVal = existingWp && existingWp.resume_on.delay_ms ? existingWp.resume_on.delay_ms : 5000;
    html += '<div id="wp-timer-row" class="tl-wp-config-row" style="display:none"><label>Delay (ms)<input type="number" id="wp-delay" value="' + delayVal + '" min="100" step="100"></label></div>';
    html += '<div class="tl-wp-config-buttons"><button id="wp-save" class="small-btn">Save</button><button id="wp-cancel" class="small-btn">Cancel</button></div>';
    html += '</div>';
    popup.innerHTML = html;

    document.body.appendChild(popup);
    wpConfigPopup = popup;

    function updateFieldVisibility() {
      var type = document.getElementById("wp-resume-type").value;
      document.getElementById("wp-object-row").style.display = (type === "Click" || type === "ClickOrTimer") ? "" : "none";
      document.getElementById("wp-timer-row").style.display = (type === "Timer" || type === "ClickOrTimer") ? "" : "none";
    }
    document.getElementById("wp-resume-type").addEventListener("change", updateFieldVisibility);
    updateFieldVisibility();

    document.getElementById("wp-cancel").addEventListener("click", function () {
      popup.remove();
      wpConfigPopup = null;
    });

    document.getElementById("wp-save").addEventListener("click", function () {
      var time = parseInt(document.getElementById("wp-time").value) || 0;
      var type = document.getElementById("wp-resume-type").value;
      var resumeOn;

      switch (type) {
        case "AnyClick":
          resumeOn = { type: "AnyClick" };
          break;
        case "Click":
          resumeOn = { type: "Click", object_id: document.getElementById("wp-object-id").value };
          break;
        case "Timer":
          resumeOn = { type: "Timer", delay_ms: parseInt(document.getElementById("wp-delay").value) || 5000 };
          break;
        case "ClickOrTimer":
          var objEl = document.getElementById("wp-object-id");
          resumeOn = {
            type: "ClickOrTimer",
            object_id: objEl.value || null,
            delay_ms: parseInt(document.getElementById("wp-delay").value) || 5000,
          };
          break;
      }

      if (existingWp) {
        invoke("waitpoint_update", {
          sceneId: scene.id,
          waitpointId: existingWp.id,
          timeMs: time,
          resumeOn: resumeOn,
        }).then(function (updated) {
          var idx = scene.wait_points.findIndex(function (w) { return w.id === updated.id; });
          if (idx >= 0) scene.wait_points[idx] = updated;
          CitCatApp.requestRender();
        });
      } else {
        invoke("waitpoint_add", {
          sceneId: scene.id,
          timeMs: time,
          resumeOn: resumeOn,
        }).then(function (wp) {
          scene.wait_points.push(wp);
          scene.wait_points.sort(function (a, b) { return a.time_ms - b.time_ms; });
          CitCatApp.requestRender();
        });
      }

      popup.remove();
      wpConfigPopup = null;
    });
  }

  function onMouseMove(e) {
    if (draggingPlayhead) {
      var rect = container.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var ms = xToMs(x);
      var scene = CitCatApp.getActiveScene();
      if (scene) ms = CitCatMath.clamp(ms, 0, scene.duration_ms);
      CitCatApp.setPlayheadTime(ms);
      return;
    }

    if (draggingWaitPoint) {
      var dx = e.clientX - draggingWaitPoint.startX;
      var deltaMs = Math.round(dx / PX_PER_MS);
      var newMs = Math.max(0, draggingWaitPoint.startMs + deltaMs);
      var scene = CitCatApp.getActiveScene();
      if (scene) newMs = Math.min(newMs, scene.duration_ms);

      var wp = scene ? scene.wait_points.find(function (w) { return w.id === draggingWaitPoint.id; }) : null;
      if (wp) wp.time_ms = newMs;
      CitCatApp.requestRender();
      return;
    }

    if (draggingKeyframe) {
      var dx = e.clientX - draggingKeyframe.startX;
      var deltaMs = Math.round(dx / PX_PER_MS);
      var newMs = Math.max(0, draggingKeyframe.startMs + deltaMs);
      var scene = CitCatApp.getActiveScene();
      if (scene) newMs = Math.min(newMs, scene.duration_ms);

      var obj = scene ? scene.objects.find(function (o) { return o.id === draggingKeyframe.objectId; }) : null;
      if (obj) {
        var kf = obj.keyframes.find(function (k) { return k.id === draggingKeyframe.keyframeId; });
        if (kf) kf.time_ms = newMs;
      }
      CitCatApp.requestRender();
    }
  }

  function onMouseUp() {
    if (draggingWaitPoint) {
      var scene = CitCatApp.getActiveScene();
      if (scene) {
        var wp = scene.wait_points.find(function (w) { return w.id === draggingWaitPoint.id; });
        if (wp) {
          invoke("waitpoint_update", {
            sceneId: scene.id,
            waitpointId: draggingWaitPoint.id,
            timeMs: wp.time_ms,
          });
          scene.wait_points.sort(function (a, b) { return a.time_ms - b.time_ms; });
        }
      }
      draggingWaitPoint = null;
    }
    if (draggingKeyframe) {
      var scene = CitCatApp.getActiveScene();
      if (scene) {
        var obj = scene.objects.find(function (o) { return o.id === draggingKeyframe.objectId; });
        if (obj) {
          var kf = obj.keyframes.find(function (k) { return k.id === draggingKeyframe.keyframeId; });
          if (kf) {
            invoke("keyframe_update", {
              sceneId: scene.id,
              objectId: draggingKeyframe.objectId,
              keyframeId: draggingKeyframe.keyframeId,
              timeMs: kf.time_ms,
            });
          }
        }
      }
    }
    draggingPlayhead = false;
    draggingKeyframe = null;
    draggingWaitPoint = null;
  }

  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      var factor = e.deltaY > 0 ? 0.9 : 1.1;
      PX_PER_MS = CitCatMath.clamp(PX_PER_MS * factor, 0.02, 2.0);
    } else {
      scrollLeft = Math.max(0, scrollLeft + e.deltaX + e.deltaY);
    }
    CitCatApp.requestRender();
  }

  return {
    init: init,
    render: render,
    updatePlayhead: updatePlayhead,
  };
})();
