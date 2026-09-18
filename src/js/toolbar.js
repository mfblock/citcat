var CitCatToolbar = (function () {
  var invoke = window.__TAURI__.core.invoke;
  var activeTool = "select";
  var effectsLibrary = [];

  function init() {
    document.querySelectorAll("#object-tools .toolbar-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setTool(this.dataset.tool);
      });
    });

    document.getElementById("btn-new").addEventListener("click", function () {
      CitCatApp.newProject();
    });

    document.getElementById("btn-save").addEventListener("click", function () {
      CitCatApp.saveProject();
    });

    document.getElementById("btn-open").addEventListener("click", function () {
      CitCatApp.openProject();
    });

    document.getElementById("btn-play").addEventListener("click", function () {
      CitCatApp.playToggle();
    });

    document.getElementById("btn-pause").addEventListener("click", function () {
      CitCatApp.playToggle();
    });

    document.getElementById("btn-stop").addEventListener("click", function () {
      CitCatApp.playStop();
    });

    invoke("effects_list").then(function (effects) {
      effectsLibrary = effects;
      buildEffectsDropdown();
    });

    window.addEventListener("keydown", function (e) {
      if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || document.activeElement.tagName === "SELECT") return;
      switch (e.key.toLowerCase()) {
        case "v":
          if (!e.ctrlKey && !e.metaKey) setTool("select");
          break;
        case "t": setTool("text"); break;
        case "r": setTool("rect"); break;
        case "e":
          if (!e.ctrlKey && !e.metaKey) setTool("ellipse");
          break;
        case "i": setTool("image"); break;
        case "b": setTool("button"); break;
        case "h": setTool("hotspot"); break;
        case "p": setTool("path"); break;
        case "m": setTool("video"); break;
        case "a":
          if (!e.ctrlKey && !e.metaKey) setTool("audio");
          break;
        case "f5":
          e.preventDefault();
          if (typeof CitCatApp.startPreview === "function") CitCatApp.startPreview();
          break;
        case "g":
          if (!e.ctrlKey && !e.metaKey) {
            CitCatApp.toggleGridSnap && CitCatApp.toggleGridSnap();
          }
          break;
        case " ":
          e.preventDefault();
          CitCatApp.playToggle();
          break;
        case "s":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            CitCatApp.saveProject();
          } else {
            setTool("svg");
          }
          break;
        case "n":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            CitCatApp.newProject();
          }
          break;
        case "o":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            CitCatApp.openProject();
          }
          break;
        case "e":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            document.getElementById("btn-export").click();
          }
          break;
        case "z":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              CitCatApp.redo && CitCatApp.redo();
            } else {
              CitCatApp.undo && CitCatApp.undo();
            }
          }
          break;
        case "d":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            CitCatApp.duplicateSelected && CitCatApp.duplicateSelected();
          }
          break;
        case "c":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            CitCatApp.copySelected && CitCatApp.copySelected();
          }
          break;
        case "v":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            CitCatApp.pasteObject && CitCatApp.pasteObject();
          }
          break;
        case "0":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            CitCatCanvas.centerStage();
            CitCatApp.requestRender();
          }
          break;
      }
    });
  }

  function buildEffectsDropdown() {
    var container = document.getElementById("action-tools");
    if (!container) return;

    var wrapper = document.createElement("div");
    wrapper.className = "effects-dropdown-wrapper";
    wrapper.style.position = "relative";

    var btn = document.createElement("button");
    btn.className = "toolbar-btn";
    btn.title = "Apply Effect";
    btn.textContent = "FX";
    btn.id = "btn-effects";
    wrapper.appendChild(btn);

    var dropdown = document.createElement("div");
    dropdown.className = "effects-dropdown";
    dropdown.hidden = true;

    var categories = {};
    for (var i = 0; i < effectsLibrary.length; i++) {
      var fx = effectsLibrary[i];
      if (!categories[fx.category]) categories[fx.category] = [];
      categories[fx.category].push(fx);
    }

    var order = ["Entrance", "Exit", "Emphasis", "Motion"];
    for (var ci = 0; ci < order.length; ci++) {
      var cat = order[ci];
      var items = categories[cat];
      if (!items) continue;

      var header = document.createElement("div");
      header.className = "effects-category";
      header.textContent = cat;
      dropdown.appendChild(header);

      for (var j = 0; j < items.length; j++) {
        (function (fx) {
          var item = document.createElement("div");
          item.className = "effects-item";
          item.textContent = fx.name;
          item.addEventListener("click", function () {
            CitCatApp.applyEffect(fx.id);
            dropdown.hidden = true;
          });
          dropdown.appendChild(item);
        })(items[j]);
      }
    }

    wrapper.appendChild(dropdown);
    container.appendChild(wrapper);

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (dropdown.hidden) {
        invoke("effects_reload").then(function (effects) {
          effectsLibrary = effects;
          rebuildDropdownContent(dropdown);
        }).catch(function () {});
      }
      dropdown.hidden = !dropdown.hidden;
    });

    document.addEventListener("click", function () {
      dropdown.hidden = true;
    });
  }

  function rebuildDropdownContent(dropdown) {
    dropdown.innerHTML = "";
    var categories = {};
    for (var i = 0; i < effectsLibrary.length; i++) {
      var fx = effectsLibrary[i];
      if (!categories[fx.category]) categories[fx.category] = [];
      categories[fx.category].push(fx);
    }
    var order = ["Entrance", "Exit", "Emphasis", "Motion"];
    for (var ci = 0; ci < order.length; ci++) {
      var cat = order[ci];
      var items = categories[cat];
      if (!items) continue;
      var header = document.createElement("div");
      header.className = "effects-category";
      header.textContent = cat;
      dropdown.appendChild(header);
      for (var j = 0; j < items.length; j++) {
        (function (fx) {
          var item = document.createElement("div");
          item.className = "effects-item";
          item.textContent = fx.name;
          item.addEventListener("click", function () {
            CitCatApp.applyEffect(fx.id);
            dropdown.hidden = true;
          });
          dropdown.appendChild(item);
        })(items[j]);
      }
    }
  }

  function refreshEffects(effects) {
    effectsLibrary = effects;
  }

  function setTool(tool) {
    activeTool = tool;
    document.querySelectorAll("#object-tools .toolbar-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.tool === tool);
    });
    var canvas = CitCatCanvas.getCanvas();
    canvas.style.cursor = tool === "select" ? "default" : "crosshair";
  }

  function getTool() {
    return activeTool;
  }

  function resetToSelect() {
    setTool("select");
  }

  return {
    init: init,
    getTool: getTool,
    resetToSelect: resetToSelect,
    refreshEffects: refreshEffects,
  };
})();
