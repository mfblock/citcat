var CitCatCanvas = (function () {
  var canvas, ctx;
  var pan = { x: 0, y: 0 };
  var zoom = 1;
  var stageWidth = 1920;
  var stageHeight = 1080;
  var loadedImages = {};
  var videoElements = {};
  var audioElements = {};
  var bgImageCache = {};
  var svgImageCache = {};

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
  }

  function resize() {
    var wrapper = canvas.parentElement;
    canvas.width = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;
    centerStage();
  }

  function centerStage() {
    var scale = Math.min(
      (canvas.width - 80) / stageWidth,
      (canvas.height - 80) / stageHeight
    );
    zoom = Math.max(0.1, Math.min(scale, 2));
    pan.x = (canvas.width - stageWidth * zoom) / 2;
    pan.y = (canvas.height - stageHeight * zoom) / 2;
    updateZoomIndicator();
  }

  function setStageSize(w, h) {
    stageWidth = w;
    stageHeight = h;
    centerStage();
  }

  function updateZoomIndicator() {
    var el = document.getElementById("zoom-indicator");
    if (el) el.textContent = Math.round(zoom * 100) + "%";
  }

  function render(scene, selectedId, selectedIds, playheadMs) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    renderBackground(scene.background);
    ctx.shadowColor = "transparent";

    var objects = scene.objects.slice().sort(function (a, b) {
      return a.z_index - b.z_index;
    });

    var playMode = CitCatApp && CitCatApp.isPlayMode && CitCatApp.isPlayMode();
    var currentMs = playheadMs || 0;
    for (var i = 0; i < objects.length; i++) {
      var obj = objects[i];
      if (!obj.visible) continue;
      if (playMode && obj.object_type === "Hotspot") continue;
      if (playMode && obj.object_type === "Audio") continue;

      var outsideLifespan = false;
      if (!playMode && (obj.appear_at_ms !== null && obj.appear_at_ms !== undefined)) {
        if (currentMs < obj.appear_at_ms) outsideLifespan = true;
      }
      if (!playMode && (obj.disappear_at_ms !== null && obj.disappear_at_ms !== undefined)) {
        if (currentMs > obj.disappear_at_ms) outsideLifespan = true;
      }
      if (playMode) {
        if (obj.appear_at_ms !== null && obj.appear_at_ms !== undefined && currentMs < obj.appear_at_ms) continue;
        if (obj.disappear_at_ms !== null && obj.disappear_at_ms !== undefined && currentMs > obj.disappear_at_ms) continue;
      }

      if (outsideLifespan) {
        ctx.save();
        ctx.globalAlpha = 0.25;
      }

      var isSel = false;
      if (selectedIds && selectedIds.has) {
        isSel = selectedIds.has(obj.id);
      } else {
        isSel = obj.id === selectedId;
      }
      renderObject(obj, isSel, playMode);

      if (outsideLifespan) {
        ctx.restore();
      }
    }

    if (playMode && scene.subtitle_track) {
      renderSubtitles(scene.subtitle_track, currentMs);
    }

    ctx.restore();
  }

  function renderBackground(bg) {
    if (bg.image) {
      var img = bgImageCache[bg.image];
      if (!img) {
        img = new Image();
        img.src = bg.image;
        img.onload = function () { CitCatApp.requestRender(); };
        bgImageCache[bg.image] = img;
      }
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, stageWidth, stageHeight);
        return;
      }
    }
    if (bg.gradient && bg.gradient.stops && bg.gradient.stops.length >= 2) {
      var grad;
      if (bg.gradient.gradient_type === "Radial") {
        grad = ctx.createRadialGradient(stageWidth / 2, stageHeight / 2, 0, stageWidth / 2, stageHeight / 2, Math.max(stageWidth, stageHeight) / 2);
      } else {
        grad = ctx.createLinearGradient(0, 0, 0, stageHeight);
      }
      for (var i = 0; i < bg.gradient.stops.length; i++) {
        grad.addColorStop(bg.gradient.stops[i].offset, bg.gradient.stops[i].color);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, stageWidth, stageHeight);
      return;
    }
    ctx.fillStyle = bg.fill || "#ffffff";
    ctx.fillRect(0, 0, stageWidth, stageHeight);
  }

  function renderSubtitles(track, timeMs) {
    if (!track || !track.entries) return;
    var active = null;
    for (var i = 0; i < track.entries.length; i++) {
      var e = track.entries[i];
      if (timeMs >= e.start_ms && timeMs <= e.end_ms) {
        active = e;
        break;
      }
    }
    if (!active) return;

    var fontSize = 28;
    var padding = 8;
    ctx.font = "600 " + fontSize + "px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    var lines = active.text.split("\n");
    var totalHeight = lines.length * (fontSize * 1.3) + padding * 2;
    var y = stageHeight - 40;

    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    var maxWidth = 0;
    for (var i = 0; i < lines.length; i++) {
      var w = ctx.measureText(lines[i]).width;
      if (w > maxWidth) maxWidth = w;
    }
    ctx.fillRect(
      stageWidth / 2 - maxWidth / 2 - padding * 2,
      y - totalHeight,
      maxWidth + padding * 4,
      totalHeight + padding
    );

    ctx.fillStyle = "#ffffff";
    for (var i = lines.length - 1; i >= 0; i--) {
      ctx.fillText(lines[i], stageWidth / 2, y - (lines.length - 1 - i) * (fontSize * 1.3));
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

  function renderObject(obj, isSelected, playMode) {
    var t = obj.transform;
    ctx.save();

    if (t.rotation !== 0) {
      var cx = t.x + t.width / 2;
      var cy = t.y + t.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((t.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    ctx.globalAlpha = t.opacity;

    if (obj.filters) {
      ctx.filter = buildFilterString(obj.filters);
    }

    switch (obj.object_type) {
      case "Text":
        renderText(obj);
        break;
      case "Rect":
        renderRect(obj);
        break;
      case "Ellipse":
        renderEllipse(obj);
        break;
      case "Image":
        renderImage(obj);
        break;
      case "Video":
        renderVideo(obj, playMode);
        break;
      case "Audio":
        renderAudio(obj);
        break;
      case "Button":
        renderButton(obj);
        break;
      case "Svg":
        renderSvg(obj);
        break;
      case "Hotspot":
        renderHotspot(obj);
        break;
    }

    if (obj.filters) {
      ctx.filter = "none";
    }

    ctx.globalAlpha = 1;

    if (isSelected) {
      renderSelection(obj);
      if (obj.motion_path && !playMode) {
        renderMotionPath(obj.motion_path);
      }
    }

    ctx.restore();
  }

  function renderMotionPath(path) {
    if (!path || !path.points || path.points.length < 2) return;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2 / zoom;

    ctx.beginPath();
    var p0 = path.points[0];
    ctx.moveTo(p0.x, p0.y);
    for (var i = 0; i < path.points.length - 1; i++) {
      var a = path.points[i];
      var b = path.points[i + 1];
      var c1x = a.control_out ? a.control_out.x : a.x;
      var c1y = a.control_out ? a.control_out.y : a.y;
      var c2x = b.control_in ? b.control_in.x : b.x;
      var c2y = b.control_in ? b.control_in.y : b.y;
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, b.x, b.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    var ptSize = 6 / zoom;
    var cpSize = 4 / zoom;

    for (var i = 0; i < path.points.length; i++) {
      var pt = path.points[i];
      ctx.fillStyle = "#f59e0b";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, ptSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (pt.control_in) {
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.control_in.x, pt.control_in.y);
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(pt.control_in.x, pt.control_in.y, cpSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      if (pt.control_out) {
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.control_out.x, pt.control_out.y);
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(pt.control_out.x, pt.control_out.y, cpSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function renderText(obj) {
    var t = obj.transform;
    var s = obj.style;
    ctx.font = s.font_weight + " " + s.font_size + "px " + s.font_family;
    ctx.fillStyle = s.fill;
    ctx.textBaseline = "top";

    var align = s.text_align || "Left";
    if (align === "Center") ctx.textAlign = "center";
    else if (align === "Right") ctx.textAlign = "right";
    else ctx.textAlign = "left";

    var content = obj.content || "";
    if (obj._typewriter_progress !== null && obj._typewriter_progress !== undefined) {
      var charCount = Math.floor(content.length * obj._typewriter_progress);
      content = content.substring(0, charCount);
    }

    var lineHeight = s.font_size * s.line_height;
    var textX = t.x;
    if (align === "Center") textX = t.x + t.width / 2;
    else if (align === "Right") textX = t.x + t.width;

    var lines;
    if (obj.text_wrap) {
      lines = wrapText(content, t.width);
    } else {
      lines = content.split("\n");
    }

    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], textX, t.y + i * lineHeight);
    }
  }

  function wrapText(text, maxWidth) {
    var paragraphs = text.split("\n");
    var result = [];
    for (var p = 0; p < paragraphs.length; p++) {
      var words = paragraphs[p].split(" ");
      var line = "";
      for (var w = 0; w < words.length; w++) {
        var test = line ? line + " " + words[w] : words[w];
        var metrics = ctx.measureText(test);
        if (metrics.width > maxWidth && line) {
          result.push(line);
          line = words[w];
        } else {
          line = test;
        }
      }
      result.push(line);
    }
    return result;
  }

  function renderAudio(obj) {
    var t = obj.transform;
    ctx.fillStyle = "rgba(34, 197, 94, 0.15)";
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(t.x, t.y, t.width, t.height);
    ctx.strokeRect(t.x, t.y, t.width, t.height);
    ctx.setLineDash([]);

    ctx.font = "600 14px system-ui";
    ctx.fillStyle = "#22c55e";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var label = "\u{1F50A} " + (obj.name || "Audio");
    ctx.fillText(label, t.x + t.width / 2, t.y + t.height / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

  function getAudioElement(objId) {
    return audioElements[objId] || null;
  }

  function cleanupAudioElements(activeObjIds) {
    for (var id in audioElements) {
      if (!activeObjIds || activeObjIds.indexOf(id) < 0) {
        var audio = audioElements[id];
        audio.pause();
        audio.src = "";
        if (audio.parentNode) audio.parentNode.removeChild(audio);
        delete audioElements[id];
      }
    }
  }

  function renderRect(obj) {
    var t = obj.transform;
    var s = obj.style;
    var r = s.border_radius || 0;

    if (r > 0) {
      roundRect(ctx, t.x, t.y, t.width, t.height, r);
      if (s.fill && s.fill !== "transparent") {
        ctx.fillStyle = s.fill;
        ctx.fill();
      }
      if (s.stroke_width > 0) {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = s.stroke_width;
        ctx.stroke();
      }
    } else {
      if (s.fill && s.fill !== "transparent") {
        ctx.fillStyle = s.fill;
        ctx.fillRect(t.x, t.y, t.width, t.height);
      }
      if (s.stroke_width > 0) {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = s.stroke_width;
        ctx.strokeRect(t.x, t.y, t.width, t.height);
      }
    }
  }

  function renderEllipse(obj) {
    var t = obj.transform;
    var s = obj.style;
    ctx.beginPath();
    ctx.ellipse(
      t.x + t.width / 2,
      t.y + t.height / 2,
      t.width / 2,
      t.height / 2,
      0,
      0,
      Math.PI * 2
    );
    if (s.fill && s.fill !== "transparent") {
      ctx.fillStyle = s.fill;
      ctx.fill();
    }
    if (s.stroke_width > 0) {
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.stroke_width;
      ctx.stroke();
    }
  }

  function renderImage(obj) {
    var t = obj.transform;
    if (!obj.content) {
      ctx.fillStyle = "#555";
      ctx.fillRect(t.x, t.y, t.width, t.height);
      ctx.fillStyle = "#999";
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No image", t.x + t.width / 2, t.y + t.height / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      return;
    }

    var img = loadedImages[obj.content];
    if (!img) {
      img = new Image();
      img.src = obj.content;
      img.onload = function () {
        CitCatApp.requestRender();
      };
      loadedImages[obj.content] = img;
    }
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, t.x, t.y, t.width, t.height);
    }
  }

  function renderVideo(obj, playMode) {
    var t = obj.transform;
    if (!obj.content) {
      ctx.fillStyle = "#222";
      ctx.fillRect(t.x, t.y, t.width, t.height);
      ctx.fillStyle = "#999";
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("▶ No video", t.x + t.width / 2, t.y + t.height / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      return;
    }

    var vid = videoElements[obj.id];
    if (!vid) {
      vid = document.createElement("video");
      vid.muted = true;
      vid.playsInline = true;
      vid.preload = "auto";
      vid.style.display = "none";
      vid.src = obj.content;
      document.body.appendChild(vid);
      vid.addEventListener("loadeddata", function () {
        CitCatApp.requestRender();
      });
      videoElements[obj.id] = vid;
    }

    if (vid.readyState >= 2) {
      ctx.drawImage(vid, t.x, t.y, t.width, t.height);
    } else {
      ctx.fillStyle = "#222";
      ctx.fillRect(t.x, t.y, t.width, t.height);
      ctx.fillStyle = "#666";
      ctx.font = "12px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Loading video...", t.x + t.width / 2, t.y + t.height / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
    }
  }

  function getVideoElement(objId) {
    return videoElements[objId] || null;
  }

  function cleanupVideoElements(activeObjIds) {
    for (var id in videoElements) {
      if (!activeObjIds || activeObjIds.indexOf(id) < 0) {
        var vid = videoElements[id];
        vid.pause();
        vid.src = "";
        if (vid.parentNode) vid.parentNode.removeChild(vid);
        delete videoElements[id];
      }
    }
  }

  function renderButton(obj) {
    var t = obj.transform;
    var s = obj.style;

    roundRect(ctx, t.x, t.y, t.width, t.height, s.border_radius || 8);
    ctx.fillStyle = s.fill;
    ctx.fill();

    if (s.stroke_width > 0) {
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.stroke_width;
      ctx.stroke();
    }

    ctx.font = s.font_weight + " " + s.font_size + "px " + s.font_family;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var btnText = obj.content || "";
    if (obj._typewriter_progress !== null && obj._typewriter_progress !== undefined) {
      var charCount = Math.floor(btnText.length * obj._typewriter_progress);
      btnText = btnText.substring(0, charCount);
    }
    ctx.fillText(btnText, t.x + t.width / 2, t.y + t.height / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

  function renderHotspot(obj) {
    var t = obj.transform;
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "#ff6b6b";
    ctx.lineWidth = 2;
    ctx.strokeRect(t.x, t.y, t.width, t.height);
    ctx.setLineDash([]);
  }

  function renderSelection(obj) {
    var t = obj.transform;
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([]);
    ctx.strokeRect(t.x, t.y, t.width, t.height);

    var handles = CitCatMath.getHandles(obj);
    var hs = 8;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5 / zoom;

    for (var i = 0; i < handles.length; i++) {
      var h = handles[i];
      ctx.fillRect(h.x, h.y, hs, hs);
      ctx.strokeRect(h.x, h.y, hs, hs);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function renderSvg(obj) {
    var t = obj.transform;
    if (!obj.content) {
      ctx.fillStyle = "#555";
      ctx.fillRect(t.x, t.y, t.width, t.height);
      ctx.fillStyle = "#999";
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("SVG", t.x + t.width / 2, t.y + t.height / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      return;
    }

    var cacheKey = obj.id + "_" + obj.content.length;
    var img = svgImageCache[cacheKey];
    if (!img) {
      img = new Image();
      var b64 = btoa(unescape(encodeURIComponent(obj.content)));
      img.src = "data:image/svg+xml;base64," + b64;
      img.onload = function () { CitCatApp.requestRender(); };
      svgImageCache[cacheKey] = img;
    }
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, t.x, t.y, t.width, t.height);
    }
  }

  function buildFilterString(filters) {
    if (!filters) return "none";
    var parts = [];
    if (filters.blur) parts.push("blur(" + filters.blur + "px)");
    if (filters.brightness !== null && filters.brightness !== undefined) parts.push("brightness(" + filters.brightness + ")");
    if (filters.contrast !== null && filters.contrast !== undefined) parts.push("contrast(" + filters.contrast + ")");
    if (filters.saturate !== null && filters.saturate !== undefined) parts.push("saturate(" + filters.saturate + ")");
    if (filters.hue_rotate) parts.push("hue-rotate(" + filters.hue_rotate + "deg)");
    if (filters.grayscale) parts.push("grayscale(" + filters.grayscale + ")");
    if (filters.sepia) parts.push("sepia(" + filters.sepia + ")");
    if (filters.drop_shadow) {
      var ds = filters.drop_shadow;
      parts.push("drop-shadow(" + ds.offset_x + "px " + ds.offset_y + "px " + ds.blur + "px " + ds.color + ")");
    }
    return parts.length > 0 ? parts.join(" ") : "none";
  }

  function renderSceneThumbnail(scene, width, height) {
    var offscreen = document.createElement("canvas");
    offscreen.width = width;
    offscreen.height = height;
    var offCtx = offscreen.getContext("2d");

    var scaleX = width / stageWidth;
    var scaleY = height / stageHeight;
    var scale = Math.min(scaleX, scaleY);

    offCtx.scale(scale, scale);

    offCtx.fillStyle = scene.background.fill || "#ffffff";
    offCtx.fillRect(0, 0, stageWidth, stageHeight);

    var objects = scene.objects.slice().sort(function (a, b) {
      return a.z_index - b.z_index;
    });
    for (var i = 0; i < objects.length; i++) {
      var obj = objects[i];
      if (!obj.visible) continue;
      if (obj.object_type === "Audio" || obj.object_type === "Hotspot") continue;
      var t = obj.transform;
      var s = obj.style;

      switch (obj.object_type) {
        case "Text":
        case "Button":
          offCtx.fillStyle = s.fill || "#000";
          offCtx.fillRect(t.x, t.y, t.width, Math.min(t.height, s.font_size * 1.5));
          break;
        case "Rect":
          offCtx.fillStyle = s.fill || "#3b82f6";
          offCtx.fillRect(t.x, t.y, t.width, t.height);
          break;
        case "Ellipse":
          offCtx.fillStyle = s.fill || "#8b5cf6";
          offCtx.beginPath();
          offCtx.ellipse(t.x + t.width / 2, t.y + t.height / 2, t.width / 2, t.height / 2, 0, 0, Math.PI * 2);
          offCtx.fill();
          break;
        default:
          offCtx.fillStyle = "#888";
          offCtx.fillRect(t.x, t.y, t.width, t.height);
          break;
      }
    }

    return offscreen.toDataURL("image/png");
  }

  function hitTest(stageX, stageY, objects) {
    for (var i = objects.length - 1; i >= 0; i--) {
      var obj = objects[i];
      if (!obj.visible || obj.locked) continue;
      var t = obj.transform;
      var hit = false;

      if (obj.object_type === "Ellipse") {
        hit = CitCatMath.pointInEllipse(
          stageX, stageY, t.x, t.y, t.width, t.height, t.rotation
        );
      } else {
        hit = CitCatMath.pointInRect(
          stageX, stageY, t.x, t.y, t.width, t.height, t.rotation
        );
      }

      if (hit) return obj;
    }
    return null;
  }

  function getPan() { return pan; }
  function getZoom() { return zoom; }
  function getCanvas() { return canvas; }
  function getStageWidth() { return stageWidth; }
  function getStageHeight() { return stageHeight; }

  function applyZoom(delta) {
    var factor = delta > 0 ? 0.9 : 1.1;
    zoom = CitCatMath.clamp(zoom * factor, 0.1, 5);
    updateZoomIndicator();
  }

  function applyPan(dx, dy) {
    pan.x += dx;
    pan.y += dy;
  }

  return {
    init: init,
    resize: resize,
    centerStage: centerStage,
    setStageSize: setStageSize,
    render: render,
    hitTest: hitTest,
    getPan: getPan,
    getZoom: getZoom,
    getCanvas: getCanvas,
    getStageWidth: getStageWidth,
    getStageHeight: getStageHeight,
    applyZoom: applyZoom,
    applyPan: applyPan,
    getVideoElement: getVideoElement,
    cleanupVideoElements: cleanupVideoElements,
    getAudioElement: getAudioElement,
    cleanupAudioElements: cleanupAudioElements,
    renderSceneThumbnail: renderSceneThumbnail,
    buildFilterString: buildFilterString,
  };
})();
