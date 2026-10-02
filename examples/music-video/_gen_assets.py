#!/usr/bin/env python3
"""Generate the lyric-video example's image, video and audio assets.

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


def midnight_rain_audio():
    """A moody ambient drone plus band-passed noise standing in for rain,
    matching the Verse/Chorus mood and the project's own 20s runtime (12s +
    8s). Same ffmpeg-oscillator technique as
    templates/assets/citcat-reel/_gen_assets.py's pad_audio -- three detuned
    sines (A2/C3/E3, a plain A-minor drone) plus filtered pink noise for the
    rain texture. No licensed or found music.
    """
    out = OUT / "midnight-rain.mp3"
    dur = 20
    filt = (
        f"sine=f=110:d={dur},volume=0.14[a];"
        f"sine=f=130.81:d={dur},volume=0.10[b];"
        f"sine=f=164.81:d={dur},volume=0.08[c];"
        f"anoisesrc=color=pink:amplitude=0.5:duration={dur}[n];"
        f"[n]highpass=f=2500,lowpass=f=9000,volume=0.10[rain];"
        f"[a][b][c][rain]amix=inputs=4:normalize=0,"
        f"afade=t=in:st=0:d=3,afade=t=out:st={dur - 4}:d=4"
    )
    subprocess.run(
        [FFMPEG, "-y", "-loglevel", "error", "-f", "lavfi", "-i",
         f"anullsrc=r=44100:cl=mono:d={dur}",
         "-filter_complex", filt,
         "-q:a", "4", str(out)],
        check=True)
    return out


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

    a = midnight_rain_audio()
    print(f"  {a.name}")

    total = sum(f.stat().st_size for f in OUT.iterdir() if f.is_file())
    print(f"wrote assets to {OUT} ({total / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
