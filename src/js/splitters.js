const Splitters = (() => {
  const app = document.getElementById('app');
  const mainArea = document.getElementById('main-area');
  const hSplitter = document.getElementById('h-splitter');
  const vSplitter = document.getElementById('v-splitter');

  let dragging = null;
  let startPos = 0;
  let startSize = 0;

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

  function onMouseMove(e) {
    if (!dragging) return;
    e.preventDefault();

    if (dragging === 'h') {
      const delta = startPos - e.clientY;
      const newHeight = Math.max(100, Math.min(window.innerHeight - 200, startSize + delta));
      app.style.setProperty('--bottom-height', newHeight + 'px');
    } else if (dragging === 'v') {
      const delta = startPos - e.clientX;
      const newWidth = Math.max(200, Math.min(600, startSize + delta));
      mainArea.style.setProperty('--props-width', newWidth + 'px');
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
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  return { init };
})();
