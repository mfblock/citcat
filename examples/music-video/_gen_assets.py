#!/usr/bin/env python3
"""Generate the lyric-video example's image and video assets.

Committed as generated rather than as stock footage, so the example stays small
and reproducible.

    python3 examples/music-video/_gen_assets.py
"""
import random
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
OUT = HERE / "assets"
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"


def skyline():
    """A night skyline, used as the Verse scene's background image."""
    w, h = 960, 540
    img = Image.new("RGB", (w, h), (10, 4, 26))
    d = ImageDraw.Draw(img)

    # sky wash
    for y in range(h // 2):
        t = y / (h / 2)
        d.line([(0, y), (w, y)],
               fill=(int(26 + 14 * t), int(10 + 6 * t), int(62 + 10 * t)))

    rng = random.Random(1955)
    x = -20
    while x < w + 20:
        bw = rng.randint(38, 92)
        bh = rng.randint(120, 300)
        top = h - bh
        d.rectangle([x, top, x + bw, h], fill=(7, 4, 18))
        # lit windows
        for wy in range(top + 12, h - 14, 22):
            for wx in range(x + 8, x + bw - 10, 16):
                if rng.random() < 0.34:
                    d.rectangle([wx, wy, wx + 6, wy + 10],
                                fill=(214, 186, 122))
        x += bw + rng.randint(4, 16)
    return img


def rain():
    """Monochrome rain streaks, layered over the skyline and desaturated."""
    w, h = 960, 540
    img = Image.new("RGB", (w, h), (0, 0, 0))
    d = ImageDraw.Draw(img)
    rng = random.Random(7)
    for _ in range(900):
        x = rng.randint(0, w)
        y = rng.randint(0, h)
        length = rng.randint(14, 38)
        v = rng.randint(90, 190)
        d.line([(x, y), (x - 5, y + length)], fill=(v, v, v), width=1)
    return img


def grain():
    """Film grain, sepia-toned in the Chorus for an archival feel.

    Single-channel and small: noise does not compress, so a full-size RGB plate
    costs more than the rest of the example put together. It is stretched over
    the stage at render time, which is what grain wants anyway.
    """
    w, h = 240, 135
    img = Image.new("L", (w, h))
    px = img.load()
    rng = random.Random(42)
    for y in range(h):
        for x in range(w):
            px[x, y] = rng.randint(58, 138)
    return img


def clip():
    """A 4s colour-cycling clip, so a trim window is visibly a window.

    Second 0 magenta, 1 teal, 2 amber, 3 deep blue -- one sampled pixel says
    which second is on screen, which is what makes trim testable by eye.
    """
    out = OUT / "citylights.mp4"
    colours = ["0x8b1a5a", "0x0f6b6b", "0xb8791f", "0x1a2f7a"]
    parts = []
    for i, c in enumerate(colours):
        p = OUT / f"_seg{i}.mp4"
        subprocess.run(
            [FFMPEG, "-y", "-loglevel", "error", "-f", "lavfi",
             "-i", f"color=c={c}:s=320x180:d=1:r=12",
             "-pix_fmt", "yuv420p", str(p)],
            check=True)
        parts.append(p)

    lst = OUT / "_concat.txt"
    lst.write_text("".join(f"file '{p.name}'\n" for p in parts))
    subprocess.run(
        [FFMPEG, "-y", "-loglevel", "error", "-f", "concat",
         "-safe", "0", "-i", str(lst), "-c", "copy", str(out)],
        check=True, cwd=OUT)

    for p in parts:
        p.unlink()
    lst.unlink()
    return out


def main():
    OUT.mkdir(exist_ok=True)
    skyline().save(OUT / "skyline.png", optimize=True)
    rain().save(OUT / "rain.png", optimize=True)
    grain().save(OUT / "grain.png", optimize=True)
    print("  skyline.png  rain.png  grain.png")

    v = clip()
    print(f"  {v.name}")

    total = sum(f.stat().st_size for f in OUT.iterdir() if f.is_file())
    print(f"wrote assets to {OUT} ({total / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
