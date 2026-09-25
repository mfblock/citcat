"""Pixel helpers shared by the rendering suites (filters, text, lifespan)."""

# Scan a canvas region and report how many pixels carry ink, the mean colour of
# those pixels, and the ink bounding box. The harness only wraps single-pixel
# sampling, and text/filter checks need to know whether anything landed in an
# area and where.
SCAN = """([x, y, w, h]) => {
  const c = document.getElementById('stage');
  const d = c.getContext('2d').getImageData(x, y, w, h).data;
  let lit = 0, sr = 0, sg = 0, sb = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 12 || d[i+1] > 12 || d[i+2] > 12) {
      const p = i / 4, px = p % w, py = (p / w) | 0;
      lit++; sr += d[i]; sg += d[i+1]; sb += d[i+2];
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }
  const n = Math.max(lit, 1);
  return { lit, total: d.length / 4,
           r: Math.round(sr / n), g: Math.round(sg / n), b: Math.round(sb / n),
           minX: lit ? minX : null, maxX: lit ? maxX : null,
           minY: lit ? minY : null, maxY: lit ? maxY : null };
}"""


async def scan(rt, x, y, w, h):
    """Ink statistics for a region, in stage/canvas coordinates."""
    return await rt.page.evaluate(SCAN, [int(x), int(y), int(w), int(h)])


async def render_at(rt, scene_index, time_ms, settle=0.06):
    """Force a repaint at a given time. renderFrame only runs on a callback."""
    await rt.seek(scene_index, time_ms)
    await rt.wait(settle)
