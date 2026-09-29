var CitCatScenes = (function () {
  var THUMB_W = 140;
  var THUMB_H = 79;

  // Thumbnails are regenerated on every renderAll() -- which runs on every
  // object change, every selection and every playback frame. At one offscreen
  // canvas plus a toDataURL per scene that got expensive as soon as the strip
  // could hold a dozen of them, so each scene's image is cached against a
  // signature of exactly what the thumbnail renderer reads.
  var thumbCache = {};

  function thumbSignature(scene) {
    var bg = scene.background || {};
    var parts = [
      bg.fill || "",
      bg.image || "",
      bg.gradient ? JSON.stringify(bg.gradient) : "",
    ];
    var objs = scene.objects || [];
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      var t = o.transform, s = o.style;
      parts.push([
        o.id, o.object_type, o.visible ? 1 : 0, o.z_index,
        t.x, t.y, t.width, t.height,
        s.fill, s.font_size,
      ].join(","));
    }
    return parts.join("|");
  }

  function thumbnailFor(scene) {
    if (typeof CitCatCanvas === "undefined" || !CitCatCanvas.renderSceneThumbnail) {
      return null;
    }
    var sig = thumbSignature(scene);
    var hit = thumbCache[scene.id];
    if (hit && hit.sig === sig) return hit.url;
    var url = CitCatCanvas.renderSceneThumbnail(scene, THUMB_W, THUMB_H);
    thumbCache[scene.id] = { sig: sig, url: url };
    return url;
  }

  var lastScenes = [];

  function init() {
    createTransitionMenu();

    // Delegated, because the first click of a double-click can trigger a
    // re-render that replaces the very node a per-tile listener lives on. The
    // list element itself is never replaced, only its children.
    var list = document.getElementById("scene-list");
    list.addEventListener("dblclick", function (e) {
      var nameEl = e.target.closest(".scene-thumb-name");
      if (!nameEl) return;
      var tile = nameEl.closest(".scene-item-thumb");
      if (!tile) return;
      var scene = lastScenes.find(function (s) { return s.id === tile.dataset.sceneId; });
      if (scene) {
        e.stopPropagation();
        beginRename(scene);
      }
    });
  }

  function clearDropMarks(list) {
    list.querySelectorAll(".scene-item-thumb").forEach(function (el) {
      el.classList.remove("drop-before", "drop-after");
    });
  }

  function render(scenes, activeSceneId) {
    lastScenes = scenes;
    var list = document.getElementById("scene-list");

    // A rebuild would destroy an open rename box, and destroying it blurs it,
    // which commits it -- so a stray re-render would end the rename the instant
    // it began. Nothing in the strip can meaningfully change mid-rename.
    if (list.querySelector(".scene-rename-input")) return;

    // The strip is rebuilt wholesale, so remember where the keyboard was and
    // put it back -- otherwise selecting a scene by keyboard drops focus to the
    // document and the next arrow key goes nowhere.
    var focusedSceneId = null;
    var act = document.activeElement;
    if (act && act.classList && act.classList.contains("scene-item-thumb")) {
      focusedSceneId = act.dataset.sceneId;
    }

    list.innerHTML = "";

    // Drop stale cache entries so deleting scenes cannot leak images.
    var live = {};
    scenes.forEach(function (s) { live[s.id] = true; });
    Object.keys(thumbCache).forEach(function (id) {
      if (!live[id]) delete thumbCache[id];
    });

    scenes.forEach(function (scene, index) {
      var item = document.createElement("div");
      item.className = "scene-item-thumb" + (scene.id === activeSceneId ? " active" : "");
      item.dataset.sceneId = scene.id;
      item.tabIndex = 0;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", scene.id === activeSceneId ? "true" : "false");

      var thumbSrc = thumbnailFor(scene);
      if (thumbSrc) {
        var thumbImg = document.createElement("img");
        thumbImg.src = thumbSrc;
        thumbImg.alt = "";
        thumbImg.draggable = false;
        item.appendChild(thumbImg);
      }

      // How this scene is entered. transition_in governs the boundary into it;
      // transition_out only describes how it leaves, and is the fallback the
      // next scene uses when it declares no transition_in of its own.
      var kind = null, dir = null;
      if (scene.transition_in && scene.transition_in.kind !== "Cut") {
        kind = scene.transition_in.kind;
        dir = "in";
      } else if (scene.transition_out && scene.transition_out.kind !== "Cut") {
        kind = scene.transition_out.kind;
        dir = "out";
      }
      if (kind) {
        var badge = document.createElement("span");
        badge.className = "scene-trans-badge";
        badge.textContent = dir === "in" ? "→ " + kind : kind + " →";
        badge.title = dir === "in"
          ? "Enters with " + kind
          : "Leaves with " + kind + " (used only if the next scene sets no transition in)";
        item.appendChild(badge);
      }

      var row = document.createElement("div");
      row.className = "scene-thumb-row";

      var idx = document.createElement("span");
      idx.className = "scene-index";
      idx.textContent = String(index + 1);
      row.appendChild(idx);

      var nameSpan = document.createElement("span");
      nameSpan.className = "scene-thumb-name";
      nameSpan.textContent = scene.name;
      nameSpan.title = scene.name;
      row.appendChild(nameSpan);

      item.appendChild(row);
      item.setAttribute("aria-label", "Scene " + (index + 1) + ": " + scene.name);

      var deleteBtn = document.createElement("button");
      deleteBtn.className = "scene-delete";
      deleteBtn.textContent = "×";
      deleteBtn.title = "Delete scene";
      deleteBtn.tabIndex = -1;
      item.appendChild(deleteBtn);

      item.draggable = true;
      item.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/plain", scene.id);
        e.dataTransfer.effectAllowed = "move";
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", function () {
        item.classList.remove("dragging");
        clearDropMarks(list);
      });
      item.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        // Which half of the tile the pointer is over decides whether the drop
        // lands before or after it -- on a horizontal strip that is the only
        // reading that matches the axis.
        var box = item.getBoundingClientRect();
        var after = (e.clientX - box.left) > box.width / 2;
        clearDropMarks(list);
        item.classList.add(after ? "drop-after" : "drop-before");
      });
      item.addEventListener("dragleave", function () {
        item.classList.remove("drop-before", "drop-after");
      });
      item.addEventListener("drop", function (e) {
        e.preventDefault();
        var box = item.getBoundingClientRect();
        var after = (e.clientX - box.left) > box.width / 2;
        clearDropMarks(list);

        var draggedId = e.dataTransfer.getData("text/plain");
        if (draggedId === scene.id) return;
        var sceneIds = scenes.map(function (s) { return s.id; });
        var fromIdx = sceneIds.indexOf(draggedId);
        if (fromIdx < 0) return;
        sceneIds.splice(fromIdx, 1);
        var toIdx = sceneIds.indexOf(scene.id);
        if (toIdx < 0) return;
        sceneIds.splice(after ? toIdx + 1 : toIdx, 0, draggedId);
        CitCatApp.reorderScenes(sceneIds);
      });

      item.addEventListener("click", function (e) {
        if (e.target === deleteBtn) return;
        item.focus();
        CitCatApp.switchScene(scene.id);
      });

      item.addEventListener("keydown", function (e) {
        var tiles = Array.prototype.slice.call(
          list.querySelectorAll(".scene-item-thumb")
        );
        var at = tiles.indexOf(item);
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          CitCatApp.switchScene(scene.id);
        } else if (e.key === "ArrowRight" && at < tiles.length - 1) {
          e.preventDefault();
          tiles[at + 1].focus();
        } else if (e.key === "ArrowLeft" && at > 0) {
          e.preventDefault();
          tiles[at - 1].focus();
        } else if (e.key === "Home") {
          e.preventDefault();
          tiles[0].focus();
        } else if (e.key === "End") {
          e.preventDefault();
          tiles[tiles.length - 1].focus();
        } else if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          CitCatApp.deleteScene(scene.id);
        } else if (e.key === "F2") {
          e.preventDefault();
          beginRename(scene);
        }
      });

      item.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        showTransitionMenu(e.clientX, e.clientY, scene.id);
      });

      deleteBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        CitCatApp.deleteScene(scene.id);
      });

      list.appendChild(item);
    });

    var addTile = document.createElement("button");
    addTile.className = "scene-add-tile";
    addTile.id = "btn-add-scene";
    addTile.type = "button";
    addTile.textContent = "+";
    addTile.title = "Add scene";
    addTile.setAttribute("aria-label", "Add scene");
    addTile.addEventListener("click", function () {
      CitCatApp.addScene();
    });
    list.appendChild(addTile);

    // Never steal focus back while a rename is open -- that blurs the input,
    // which commits it, so the rename would end the instant it began.
    if (focusedSceneId && !list.querySelector(".scene-rename-input")) {
      var refocus = list.querySelector(
        '.scene-item-thumb[data-scene-id="' + focusedSceneId + '"]'
      );
      if (refocus) refocus.focus();
    }

    // Keep the active scene in view when the strip scrolls.
    var active = list.querySelector(".scene-item-thumb.active");
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  // Resolve the name element from the DOM rather than trusting a captured one:
  // a click immediately before the double-click can have rebuilt the strip,
  // leaving the closed-over node detached.
  function beginRename(scene) {
    var nameSpan = document.querySelector(
      '#scene-list .scene-item-thumb[data-scene-id="' + scene.id + '"] .scene-thumb-name'
    );
    if (!nameSpan) return;

    var input = document.createElement("input");
    input.type = "text";
    input.value = scene.name;
    input.className = "scene-rename-input";
    input.style.cssText =
      "flex:1;min-width:0;background:var(--bg-input);border:1px solid var(--accent);" +
      "border-radius:3px;color:var(--text-primary);font-size:11px;padding:1px 3px;";
    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    var done = false;
    function commit() {
      if (done) return;
      done = true;
      var newName = input.value.trim() || scene.name;
      // Explicit swap-back, same as the Escape path below: render()'s guard
      // bails out for as long as a .scene-rename-input is in the DOM, so if
      // this input isn't removed here, the next render() never runs and the
      // whole strip's re-render stays frozen even after the rename "closes".
      nameSpan.textContent = newName;
      input.replaceWith(nameSpan);
      CitCatApp.renameScene(scene.id, newName);
    }

    input.addEventListener("blur", commit);
    input.addEventListener("click", function (e) { e.stopPropagation(); });
    input.addEventListener("keydown", function (ev) {
      ev.stopPropagation();
      if (ev.key === "Enter") {
        ev.preventDefault();
        input.blur();
      }
      if (ev.key === "Escape") {
        done = true;
        input.replaceWith(nameSpan);
      }
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
