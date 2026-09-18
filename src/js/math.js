var CitCatMath = (function () {
  function screenToStage(screenX, screenY, pan, zoom) {
    return {
      x: (screenX - pan.x) / zoom,
      y: (screenY - pan.y) / zoom,
    };
  }

  function stageToScreen(stageX, stageY, pan, zoom) {
    return {
      x: stageX * zoom + pan.x,
      y: stageY * zoom + pan.y,
    };
  }

  function pointInRect(px, py, x, y, w, h, rotation) {
    if (rotation === 0) {
      return px >= x && px <= x + w && py >= y && py <= y + h;
    }
    var cx = x + w / 2;
    var cy = y + h / 2;
    var rad = (-rotation * Math.PI) / 180;
    var cos = Math.cos(rad);
    var sin = Math.sin(rad);
    var dx = px - cx;
    var dy = py - cy;
    var localX = dx * cos - dy * sin + w / 2;
    var localY = dx * sin + dy * cos + h / 2;
    return localX >= 0 && localX <= w && localY >= 0 && localY <= h;
  }

  function pointInEllipse(px, py, x, y, w, h, rotation) {
    var cx = x + w / 2;
    var cy = y + h / 2;
    var rad = (-rotation * Math.PI) / 180;
    var cos = Math.cos(rad);
    var sin = Math.sin(rad);
    var dx = px - cx;
    var dy = py - cy;
    var localX = dx * cos - dy * sin;
    var localY = dx * sin + dy * cos;
    var rx = w / 2;
    var ry = h / 2;
    return (localX * localX) / (rx * rx) + (localY * localY) / (ry * ry) <= 1;
  }

  function getHandles(obj) {
    var t = obj.transform;
    var x = t.x;
    var y = t.y;
    var w = t.width;
    var h = t.height;
    var hs = 8;
    return [
      { id: "tl", x: x - hs / 2, y: y - hs / 2, cursor: "nw-resize" },
      { id: "tc", x: x + w / 2 - hs / 2, y: y - hs / 2, cursor: "n-resize" },
      { id: "tr", x: x + w - hs / 2, y: y - hs / 2, cursor: "ne-resize" },
      { id: "ml", x: x - hs / 2, y: y + h / 2 - hs / 2, cursor: "w-resize" },
      { id: "mr", x: x + w - hs / 2, y: y + h / 2 - hs / 2, cursor: "e-resize" },
      { id: "bl", x: x - hs / 2, y: y + h - hs / 2, cursor: "sw-resize" },
      { id: "bc", x: x + w / 2 - hs / 2, y: y + h - hs / 2, cursor: "s-resize" },
      { id: "br", x: x + w - hs / 2, y: y + h - hs / 2, cursor: "se-resize" },
    ];
  }

  function hitTestHandle(stageX, stageY, obj) {
    var handles = getHandles(obj);
    var hs = 8;
    for (var i = 0; i < handles.length; i++) {
      var handle = handles[i];
      if (
        stageX >= handle.x &&
        stageX <= handle.x + hs &&
        stageY >= handle.y &&
        stageY <= handle.y + hs
      ) {
        return handle;
      }
    }
    return null;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  return {
    screenToStage: screenToStage,
    stageToScreen: stageToScreen,
    pointInRect: pointInRect,
    pointInEllipse: pointInEllipse,
    getHandles: getHandles,
    hitTestHandle: hitTestHandle,
    clamp: clamp,
  };
})();
