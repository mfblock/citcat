const Splitters = (() => {
  const app = document.getElementById('app');
  const mainArea = document.getElementById('main-area');
  const hSplitter = document.getElementById('h-splitter');
  const vSplitter = document.getElementById('v-splitter');
  const lSplitter = document.getElementById('layers-splitter');
  const filmstripEl = document.getElementById('scenes-strip');

  // Layers+Timeline need at least this much room below the filmstrip to be
  // usable (one panel header + a handful of layer rows), independent of
  // whatever height the filmstrip itself happens to have.
  const MIN_LAYERS_TIMELINE_HEIGHT = 140;

  let dragging = null;
  let startPos = 0;
  let startSize = 0;

  // Read live rather than hard-coding the filmstrip's height, so this floor
  // can't go stale a third time if #scenes-strip's own CSS height changes.
  function minBottomHeight() {
    const filmstripHeight = filmstripEl ? filmstripEl.getBoundingClientRect().height : 0;
    return filmstripHeight + MIN_LAYERS_TIMELINE_HEIGHT;
  }

  function initHorizontalSplitter() {
    if (!hSplitter) return;
    hSplitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = 'h';
      startPos = e.clientY;
      const bottomArea = document.getElementById('bottom-area');
      startSize = bottomArea.getBoundingClientRect().height;
      document.body.style.cursor = 'row-resize';
    });
  }

  function initVerticalSplitter() {
    if (!vSplitter) return;
    vSplitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = 'v';
      startPos = e.clientX;
      const propsPanel = document.getElementById('properties-panel');
      startSize = propsPanel.getBoundingClientRect().width;
      document.body.style.cursor = 'col-resize';
    });
  }

  // The layers column grows to the right, so its delta is the plain one --
  // unlike the properties panel, which is anchored to the right edge.
  function initLayersSplitter() {
    if (!lSplitter) return;
    lSplitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = 'layers';
      startPos = e.clientX;
      startSize = document.getElementById('layers-panel').getBoundingClientRect().width;
      document.body.style.cursor = 'col-resize';
    });
  }

  function onMouseMove(e) {
    if (!dragging) return;
    e.preventDefault();

    if (dragging === 'h') {
      const delta = startPos - e.clientY;
      const newHeight = Math.max(minBottomHeight(), Math.min(window.innerHeight - 200, startSize + delta));
      app.style.setProperty('--bottom-height', newHeight + 'px');
    } else if (dragging === 'v') {
      const delta = startPos - e.clientX;
      const newWidth = Math.max(200, Math.min(600, startSize + delta));
      mainArea.style.setProperty('--props-width', newWidth + 'px');
    } else if (dragging === 'layers') {
      const delta = e.clientX - startPos;
      const newWidth = Math.max(120, Math.min(420, startSize + delta));
      document.getElementById('bottom-main')
        .style.setProperty('--layers-width', newWidth + 'px');
    }

    if (typeof CitCatCanvas !== 'undefined' && CitCatCanvas.resize) {
      CitCatCanvas.resize();
    }
    if (typeof CitCatTimeline !== 'undefined' && CitCatTimeline.render) {
      CitCatTimeline.render();
    }
  }

  function onMouseUp() {
    if (!dragging) return;
    dragging = null;
    document.body.style.cursor = '';
  }

  function init() {
    initHorizontalSplitter();
    initVerticalSplitter();
    initLayersSplitter();
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  return { init };
})();
