#!/usr/bin/env python3
"""Generate the citcat-reel demo's image, video and audio assets.

Committed as generated rather than as stock/found media, so the template stays
small and reproducible.

    python3 templates/assets/citcat-reel/_gen_assets.py
"""
import math
import random
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
FRAMES = HERE / "_frames"
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"

PURPLE = (124, 58, 237)
PURPLE_DARK = (76, 29, 149)
BLUE = (59, 130, 246)
ORANGE = (249, 115, 22)
INK = (7, 3, 15)


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_c(c1, c2, t):
    return tuple(int(lerp(a, b, t)) for a, b in zip(c1, c2))


def canvas_mock():
    """A stylised illustration of a stage with shapes on a timeline.

    Not a literal screenshot -- there is no product chrome to photograph here
    -- but it reads instantly as "an editor", which is what the Frame scene
    needs from an Image object.
    """
    w, h = 1000, 700
    img = Image.new("RGB", (w, h), (14, 9, 28))
    d = ImageDraw.Draw(img)

    # stage area
    stage = (60, 60, 940, 520)
    d.rectangle(stage, fill=(19, 12, 36))
    for i in range(0, 880, 40):
        d.line([(60 + i, 60), (60 + i, 520)], fill=(24, 16, 44))
    for i in range(0, 460, 40):
        d.line([(60, 60 + i), (940, 60 + i)], fill=(24, 16, 44))

    # a few "objects" on the stage, mid-animation
    d.ellipse((560, 150, 760, 350), fill=PURPLE)
    d.rounded_rectangle((160, 260, 380, 440), radius=24, fill=BLUE)
    d.ellipse((700, 330, 820, 450), fill=ORANGE)
    d.rectangle((160, 260, 380, 440), outline=(255, 255, 255, 60), width=0)

    # a text-ish bar (title placeholder, drawn as blocks not real text)
    d.rounded_rectangle((160, 130, 420, 168), radius=8, fill=(255, 255, 255))

    # timeline strip
    d.rectangle((60, 580, 940, 640), fill=(19, 12, 36))
    for i, x in enumerate(range(90, 900, 46)):
        c = PURPLE if i % 3 == 0 else (60, 50, 90)
        d.rounded_rectangle((x, 596, x + 34, 624), radius=4, fill=c)
    d.line([(430, 580), (430, 640)], fill=(255, 255, 255), width=2)  # playhead

    img = img.filter(ImageFilter.GaussianBlur(0.4))
    img.save(HERE / "canvas-mock.png", optimize=True)


def flow_video():
    """A slow-drifting field of soft colour blobs -- an abstract video loop.

    Rendered as a PNG sequence and encoded with ffmpeg, the same recipe as the
    music-video example, kept small: low frame rate, modest resolution.
    """
    FRAMES.mkdir(exist_ok=True)
    w, h = 640, 360
    n_frames = 150  # 10s at 15fps
    rng = random.Random(2026)
    blobs = []
    for _ in range(5):
        blobs.append({
            "cx": rng.uniform(0.15, 0.85), "cy": rng.uniform(0.15, 0.85),
            "r": rng.uniform(0.22, 0.38),
            "speed": rng.uniform(0.06, 0.12),
            "phase": rng.uniform(0, math.tau),
            "colour": rng.choice([PURPLE, PURPLE_DARK, BLUE, ORANGE]),
        })

    for f in range(n_frames):
        t = f / n_frames
        img = Image.new("RGB", (w, h), INK)
        d = ImageDraw.Draw(img)
        for b in blobs:
            ang = b["phase"] + t * math.tau * b["speed"] * 10
            cx = (b["cx"] + 0.06 * math.cos(ang)) * w
            cy = (b["cy"] + 0.06 * math.sin(ang * 1.3)) * h
            r = b["r"] * h
            box = (cx - r, cy - r, cx + r, cy + r)
            d.ellipse(box, fill=b["colour"])
        img = img.filter(ImageFilter.GaussianBlur(38))
        img.save(FRAMES / f"f{f:04d}.png")

    out = HERE / "flow.mp4"
    subprocess.run(
        [FFMPEG, "-y", "-loglevel", "error", "-framerate", "15",
         "-i", str(FRAMES / "f%04d.png"),
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "28",
         str(out)],
        check=True)

    for p in FRAMES.iterdir():
        p.unlink()
    FRAMES.rmdir()
    return out


def pad_audio():
    """A short synthesised ambient pad -- three detuned sines, slow envelope.

    No licensed or found music; ffmpeg's own oscillators, mixed and faded.
    """
    out = HERE / "pad.mp3"
    dur = 12
    filt = (
        f"sine=f=196:d={dur},"
        f"volume=0.18[a];"
        f"sine=f=246.94:d={dur},volume=0.14[b];"
        f"sine=f=293.66:d={dur},volume=0.11[c];"
        f"[a][b][c]amix=inputs=3:normalize=0,"
        f"lowpass=f=1800,"
        f"afade=t=in:st=0:d=2.5,afade=t=out:st={dur - 3}:d=3"
    )
    subprocess.run(
        [FFMPEG, "-y", "-loglevel", "error", "-f", "lavfi", "-i",
         f"anullsrc=r=44100:cl=mono:d={dur}",
         "-filter_complex", filt,
         "-q:a", "4", str(out)],
        check=True)
    return out


def chime_audio():
    """A short two-note click/chime for the interactive beat."""
    out = HERE / "chime.mp3"
    dur = 1.4
    filt = (
        f"sine=f=880:d={dur},volume=0.22[a];"
        f"sine=f=1318.5:d={dur},volume=0.16[b];"
        f"[a][b]amix=inputs=2:normalize=0,"
        f"afade=t=in:st=0:d=0.02,afade=t=out:st=0.5:d={dur - 0.5}"
    )
    subprocess.run(
        [FFMPEG, "-y", "-loglevel", "error", "-f", "lavfi", "-i",
         f"anullsrc=r=44100:cl=mono:d={dur}",
         "-filter_complex", filt,
         "-q:a", "4", str(out)],
        check=True)
    return out


def main():
    canvas_mock()
    print("  canvas-mock.png")
    v = flow_video()
    print(f"  {v.name}")
    a = pad_audio()
    print(f"  {a.name}")
    c = chime_audio()
    print(f"  {c.name}")

    total = sum(f.stat().st_size for f in HERE.iterdir() if f.is_file() and f.suffix != ".py")
    print(f"wrote assets to {HERE} ({total / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
