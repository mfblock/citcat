var CitCatMenu = (function () {
  function handle(id) {
    switch (id) {
      // File
      case "new-project": CitCatApp.newProject(); break;
      case "open-project": CitCatApp.openProject(); break;
      case "save-project": CitCatApp.saveProject(); break;
      case "save-project-as": CitCatApp.saveProjectAs && CitCatApp.saveProjectAs(); break;
      case "export-project": document.getElementById("btn-export").click(); break;
      case "templates": document.getElementById("btn-templates").click(); break;

      // Edit
      case "undo": CitCatApp.undo && CitCatApp.undo(); break;
      case "redo": CitCatApp.redo && CitCatApp.redo(); break;
      case "duplicate": CitCatApp.duplicateSelected && CitCatApp.duplicateSelected(); break;
      case "delete": CitCatApp.deleteSelected && CitCatApp.deleteSelected(); break;

      // View
      case "fullscreen-preview": CitCatApp.startPreview && CitCatApp.startPreview(); break;
      case "zoom-in": CitCatCanvas.zoomIn && CitCatCanvas.zoomIn(); break;
      case "zoom-out": CitCatCanvas.zoomOut && CitCatCanvas.zoomOut(); break;
      case "zoom-reset": CitCatCanvas.resetZoom && CitCatCanvas.resetZoom(); break;
      case "grid-snap": CitCatApp.toggleGridSnap && CitCatApp.toggleGridSnap(); break;

      // Insert
      case "insert-text": CitCatApp.addObjectOfType && CitCatApp.addObjectOfType("Text"); break;
      case "insert-rect": CitCatApp.addObjectOfType && CitCatApp.addObjectOfType("Rect"); break;
      case "insert-ellipse": CitCatApp.addObjectOfType && CitCatApp.addObjectOfType("Ellipse"); break;
      case "insert-image": CitCatApp.addObjectOfType && CitCatApp.addObjectOfType("Image"); break;
      case "insert-video": CitCatApp.addVideoObject && CitCatApp.addVideoObject(); break;
      case "insert-audio": CitCatApp.addAudioObject && CitCatApp.addAudioObject(); break;
      case "insert-svg": CitCatApp.addSvgObject && CitCatApp.addSvgObject(); break;
      case "insert-button": CitCatApp.addObjectOfType && CitCatApp.addObjectOfType("Button"); break;
      case "insert-hotspot": CitCatApp.addObjectOfType && CitCatApp.addObjectOfType("Hotspot"); break;

      // Scene
      case "add-scene": CitCatApp.addScene && CitCatApp.addScene(); break;
      case "next-scene": CitCatApp.nextScene && CitCatApp.nextScene(); break;
      case "prev-scene": CitCatApp.prevScene && CitCatApp.prevScene(); break;
      case "subtitles": document.getElementById("btn-subtitles").click(); break;

      // Playback
      case "play-pause": CitCatApp.playToggle(); break;
      case "stop": CitCatApp.playStop(); break;
      case "data-source": document.getElementById("btn-data").click(); break;
    }
  }

  return { handle: handle };
})();
