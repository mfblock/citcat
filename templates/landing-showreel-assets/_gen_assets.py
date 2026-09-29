#!/usr/bin/env python3
"""Generate the landing-showreel template's media assets.

Committed as generated rather than as stock photography/footage, so the
showreel stays small and reproducible -- same convention as
examples/product-catalogue/_gen_assets.py and examples/music-video/_gen_assets.py.

    python3 templates/landing-showreel-assets/_gen_assets.py

Produces:
  canvas-plate.png  -- a miniature "exported scene" thumbnail (Image object,
                        scene 3): proves a still image renders and can be
                        panned/zoomed live.
  spark.gif         -- an 8-frame looping glow pulse (Image object, scene 1):
                        proves an *animated* GIF actually advances frames
                        instead of freezing on frame 0.
  motion-clip.mp4   -- a 4s colour-cycling clip (Video object, scene 2):
                        proves video actually plays instead of sitting on a
                        black rectangle.
"""
import random
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"

# CitCat's own brand palette (matches templates/demo-showcase.citcat), so the
# generated assets look like they belong to the same product rather than
# stock filler.
INK = (5, 5, 16)          # #050510
DEEP = (26, 10, 46)       # #1a0a2e
PURPLE = (124, 58, 237)   # #7c3aed
BLUE = (59, 130, 246)     # #3b82f6
EMERALD = (16, 185, 129)  # #10b981
AMBER = (245, 158, 11)    # #f59e0b


def canvas_plate():
    """A miniature stand-in for "a scene someone built in CitCat" -- a dark
    radial-ish backdrop with a few of the shapes/cards the real editor
    produces. It is a thumbnail of the product's own output, not a photo,
    which is the honest thing to show since CitCat has no product photography.
    """
    w, h = 960, 540
    img = Image.new("RGB", (w, h), INK)
    d = ImageDraw.Draw(img)

    # soft vertical wash from DEEP (centre) to INK (edges), cheap radial fake
    cx, cy = w // 2, h * 0.42
    maxr = (w ** 2 + h ** 2) ** 0.5 / 2
    for y in range(h):
        for x in range(0, w, 4):
            r = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / maxr
            t = max(0.0, 1 - r * 1.6)
            col = tuple(int(INK[i] + (DEEP[i] - INK[i]) * t) for i in range(3))
            d.rectangle([x, y, x + 4, y + 1], fill=col)

    # three "card" rectangles, the way a product/feature scene is composed
    cards = [
        (90, 140, 330, 400, PURPLE),
        (360, 190, 600, 400, BLUE),
        (630, 160, 870, 400, EMERALD),
    ]
    for x0, y0, x1, y1, rgb in cards:
        d.rounded_rectangle([x0, y0, x1, y1], radius=18, fill=(18, 16, 30))
        d.rounded_rectangle([x0, y0, x1, y0 + 70], radius=18, fill=rgb)
        d.rectangle([x0, y0 + 40, x1, y0 + 70], fill=rgb)  # square off the join
        for i in range(3):
            ly = y0 + 100 + i * 34
            d.rounded_rectangle([x0 + 20, ly, x1 - 20 - i * 40, ly + 14],
                                 radius=7, fill=(70, 66, 90))

    # a thin accent line across the top, like a scrub bar
    d.rectangle([0, 0, w, 6], fill=AMBER)
    return img


def spark():
    """8-frame radial glow pulse, expanding and fading. Small (96x96) and a
    short palette so the GIF stays tiny -- this is a decorative loop, not
    footage, so it does not need to be large to prove the point.
    """
    size = 96
    frames = []
    n = 8
    for i in range(n):
        t = i / n
        img = Image.new("RGB", (size, size), (5, 5, 16))
        d = ImageDraw.Draw(img)
        radius = 10 + t * 34
        alpha_like = 1 - t  # fake "fade" by blending toward background colour
        rgb = tuple(int(5 + (PURPLE[c] - 5) * alpha_like) for c in range(3))
        cx = cy = size / 2
        d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius],
                  fill=rgb)
        inner = radius * 0.4
        d.ellipse([cx - inner, cy - inner, cx + inner, cy + inner],
                  fill=(255, 255, 255))
        frames.append(img.convert("P", palette=Image.ADAPTIVE, colors=48))
    out = HERE / "spark.gif"
    frames[0].save(out, save_all=True, append_images=frames[1:],
                    duration=90, loop=0, optimize=True, disposal=2)
    return out


def motion_clip():
    """4s of colour-cycling footage standing in for "content in motion" --
    the same procedural-clip technique as examples/music-video/_gen_assets.py,
    recoloured to CitCat's own palette. Muted in the project (video_muted),
    so no audio track is needed.
    """
    out = HERE / "motion-clip.mp4"
    colours = ["0x7c3aed", "0x3b82f6", "0x10b981", "0xf59e0b"]
    parts = []
    for i, c in enumerate(colours):
        p = HERE / f"_seg{i}.mp4"
        subprocess.run(
            [FFMPEG, "-y", "-loglevel", "error", "-f", "lavfi",
             "-i", f"color=c={c}:s=480x270:d=1:r=15",
             "-pix_fmt", "yuv420p", str(p)],
            check=True)
        parts.append(p)

    lst = HERE / "_concat.txt"
    lst.write_text("".join(f"file '{p.name}'\n" for p in parts))
    subprocess.run(
        [FFMPEG, "-y", "-loglevel", "error", "-f", "concat",
         "-safe", "0", "-i", str(lst), "-c", "copy", str(out)],
        check=True, cwd=HERE)

    for p in parts:
        p.unlink()
    lst.unlink()
    return out


def main():
    HERE.mkdir(exist_ok=True)
    canvas_plate().save(HERE / "canvas-plate.png", optimize=True)
    print("  canvas-plate.png")
    spark()
    print("  spark.gif")
    motion_clip()
    print("  motion-clip.mp4")

    total = sum(f.stat().st_size for f in HERE.iterdir() if f.is_file()
                and f.suffix in (".png", ".gif", ".mp4"))
    print(f"wrote assets to {HERE} ({total / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
