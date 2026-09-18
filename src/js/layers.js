var CitCatLayers = (function () {
  var container = null;
  var draggedObjectId = null;
  var dragOverObjectId = null;

  function init() {
    container = document.getElementById("layers-list");
    if (!container) return;
    container.addEventListener("dragover", onDragOver);
    container.addEventListener("drop", onDrop);
  }

  function render(scene, selectedIds) {
    if (!container) return;
    container.innerHTML = "";
    if (!scene || !scene.objects) return;

    var objects = scene.objects.slice().sort(function (a, b) {
      return b.z_index - a.z_index;
    });

    for (var i = 0; i < objects.length; i++) {
      (function (obj) {
        var row = document.createElement("div");
        row.className = "layer-row";
        row.draggable = true;
        row.dataset.objectId = obj.id;

        if (selectedIds && selectedIds.has && selectedIds.has(obj.id)) {
          row.classList.add("selected");
        } else if (selectedIds === obj.id) {
          row.classList.add("selected");
        }

        var eyeBtn = document.createElement("button");
        eyeBtn.className = "layer-icon-btn";
        eyeBtn.textContent = obj.visible ? "\u{1F441}" : "—";
        eyeBtn.title = obj.visible ? "Hide" : "Show";
        eyeBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          CitCatApp.pushUndo("toggle visibility");
          CitCatApp.updateObjectForId(obj.id, "visible", !obj.visible);
        });
        row.appendChild(eyeBtn);

        var lockBtn = document.createElement("button");
        lockBtn.className = "layer-icon-btn";
        lockBtn.textContent = obj.locked ? "\u{1F512}" : "\u{1F513}";
        lockBtn.title = obj.locked ? "Unlock" : "Lock";
        lockBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          CitCatApp.pushUndo("toggle lock");
          CitCatApp.updateObjectForId(obj.id, "locked", !obj.locked);
        });
        row.appendChild(lockBtn);

        var typeIcon = getTypeIcon(obj.object_type);
        var typeSpan = document.createElement("span");
        typeSpan.className = "layer-type-icon";
        typeSpan.textContent = typeIcon;
        row.appendChild(typeSpan);

        var nameSpan = document.createElement("span");
        nameSpan.className = "layer-name";
        nameSpan.textContent = obj.name;
        row.appendChild(nameSpan);

        row.addEventListener("click", function () {
          CitCatApp.selectObject(obj.id);
        });

        row.addEventListener("dragstart", function (e) {
          draggedObjectId = obj.id;
          e.dataTransfer.effectAllowed = "move";
        });

        row.addEventListener("dragenter", function () {
          dragOverObjectId = obj.id;
          container.querySelectorAll(".layer-row").forEach(function (r) {
            r.classList.remove("drag-over");
          });
          row.classList.add("drag-over");
        });

        container.appendChild(row);
      })(objects[i]);
    }
  }

  function getTypeIcon(type) {
    switch (type) {
      case "Text": return "T";
      case "Rect": return "□";
      case "Ellipse": return "○";
      case "Image": return "\u{1F5BC}";
      case "Video": return "▶";
      case "Audio": return "\u{1F50A}";
      case "Button": return "⎕";
      case "Hotspot": return "⬚";
      default: return "?";
    }
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(e) {
    e.preventDefault();
    if (!draggedObjectId || !dragOverObjectId || draggedObjectId === dragOverObjectId) {
      cleanup();
      return;
    }

    var scene = CitCatApp.getActiveScene();
    if (!scene) { cleanup(); return; }

    var targetObj = scene.objects.find(function (o) { return o.id === dragOverObjectId; });
    if (targetObj) {
      CitCatApp.pushUndo("reorder layers");
      CitCatApp.reorderObjectTo(draggedObjectId, targetObj.z_index);
    }
    cleanup();
  }

  function cleanup() {
    draggedObjectId = null;
    dragOverObjectId = null;
    container.querySelectorAll(".layer-row").forEach(function (r) {
      r.classList.remove("drag-over");
    });
  }

  return {
    init: init,
    render: render,
  };
})();
