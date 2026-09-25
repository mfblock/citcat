var CitCatScenes = (function () {
  var invoke = window.__TAURI__.core.invoke;

  function init() {
    document.getElementById("btn-add-scene").addEventListener("click", function () {
      CitCatApp.addScene();
    });
    createTransitionMenu();
  }

  function render(scenes, activeSceneId) {
    var list = document.getElementById("scene-list");
    list.innerHTML = "";

    scenes.forEach(function (scene) {
      var item = document.createElement("div");
      item.className = "scene-item-thumb" + (scene.id === activeSceneId ? " active" : "");
      item.dataset.sceneId = scene.id;

      if (typeof CitCatCanvas !== "undefined" && CitCatCanvas.renderSceneThumbnail) {
        var thumbSrc = CitCatCanvas.renderSceneThumbnail(scene, 120, 68);
        var thumbImg = document.createElement("img");
        thumbImg.src = thumbSrc;
        thumbImg.alt = scene.name;
        item.appendChild(thumbImg);
      }

      var nameSpan = document.createElement("span");
      nameSpan.className = "scene-thumb-name";
      // Show how this scene is entered. transition_in governs the boundary into
      // it; transition_out only describes how it leaves, and is the fallback the
      // next scene uses when it declares no transition_in of its own.
      var label = scene.name;
      if (scene.transition_in && scene.transition_in.kind !== "Cut") {
        label += " [→ " + scene.transition_in.kind + "]";
      } else if (scene.transition_out && scene.transition_out.kind !== "Cut") {
        label += " [" + scene.transition_out.kind + " →]";
      }
      nameSpan.textContent = label;
      item.appendChild(nameSpan);

      var deleteBtn = document.createElement("button");
      deleteBtn.className = "scene-delete";
      deleteBtn.textContent = "×";
      deleteBtn.title = "Delete scene";
      item.appendChild(deleteBtn);

      item.draggable = true;
      item.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/plain", scene.id);
        e.dataTransfer.effectAllowed = "move";
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", function () {
        item.classList.remove("dragging");
        var indicators = list.querySelectorAll(".scene-drop-indicator");
        indicators.forEach(function (ind) { ind.remove(); });
      });
      item.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        item.style.borderTop = "2px solid var(--accent)";
      });
      item.addEventListener("dragleave", function () {
        item.style.borderTop = "";
      });
      item.addEventListener("drop", function (e) {
        e.preventDefault();
        item.style.borderTop = "";
        var draggedId = e.dataTransfer.getData("text/plain");
        if (draggedId === scene.id) return;
        var sceneIds = scenes.map(function (s) { return s.id; });
        var fromIdx = sceneIds.indexOf(draggedId);
        var toIdx = sceneIds.indexOf(scene.id);
        if (fromIdx < 0 || toIdx < 0) return;
        sceneIds.splice(fromIdx, 1);
        sceneIds.splice(toIdx, 0, draggedId);
        CitCatApp.reorderScenes(sceneIds);
      });

      item.addEventListener("click", function (e) {
        if (e.target === deleteBtn) return;
        CitCatApp.switchScene(scene.id);
      });

      item.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        showTransitionMenu(e.clientX, e.clientY, scene.id);
      });

      deleteBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        CitCatApp.deleteScene(scene.id);
      });

      nameSpan.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        var input = document.createElement("input");
        input.type = "text";
        input.value = scene.name;
        input.className = "scene-rename-input";
        input.style.cssText =
          "width:100%;background:var(--bg-input);border:1px solid var(--accent);border-radius:3px;color:var(--text-primary);font-size:12px;padding:2px 4px;";
        nameSpan.replaceWith(input);
        input.focus();
        input.select();

        function commit() {
          var newName = input.value.trim() || scene.name;
          CitCatApp.renameScene(scene.id, newName);
        }

        input.addEventListener("blur", commit);
        input.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") {
            ev.preventDefault();
            input.blur();
          }
          if (ev.key === "Escape") {
            input.value = scene.name;
            input.blur();
          }
        });
      });

      list.appendChild(item);
    });
  }

  var transMenuSceneId = null;

  function createTransitionMenu() {
    var menu = document.createElement("div");
    menu.id = "scene-transition-menu";
    menu.className = "tl-context-menu";
    menu.hidden = true;

    var header = document.createElement("div");
    header.className = "effects-category";
    header.textContent = "Transition Out";
    menu.appendChild(header);

    var transitions = ["Cut", "Crossfade", "WipeLeft", "WipeRight", "WipeUp", "WipeDown", "SlideLeft", "SlideRight"];
    for (var i = 0; i < transitions.length; i++) {
      (function (kind) {
        var item = document.createElement("div");
        item.className = "tl-context-item";
        item.textContent = kind;
        item.addEventListener("click", function () {
          if (!transMenuSceneId) return;
          var trans = kind === "Cut" ? null : { kind: kind, duration_ms: 500 };
          CitCatApp.updateSceneTransition(transMenuSceneId, undefined, trans);
          menu.hidden = true;
        });
        menu.appendChild(item);
      })(transitions[i]);
    }

    document.body.appendChild(menu);
    document.addEventListener("click", function (e) {
      if (!e.target.closest("#scene-transition-menu")) {
        menu.hidden = true;
      }
    });
  }

  function showTransitionMenu(x, y, sceneId) {
    transMenuSceneId = sceneId;
    var menu = document.getElementById("scene-transition-menu");
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.hidden = false;
  }

  return {
    init: init,
    render: render,
  };
})();
