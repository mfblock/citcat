#!/usr/bin/env python3
"""Generate the media fixtures for tests/suites/media.py.

Deterministic and tiny. Every asset uses a colour no other fixture uses, so a
single pixel probe is unambiguous about which asset it hit.

    python3 tests/assets/_gen.py
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent

# Colours picked so no two assets -- and nothing in render.citcat, which uses
# red/green/blue/white/black/grey -- can be confused with each other.
MAGENTA = (255, 0, 255)      # still.png
ORANGE = (255, 136, 0)       # anim.gif frame 0
CYAN = (0, 255, 255)         # anim.gif frame 1


def png_still():
    """A flat magenta PNG, deliberately non-square so scaling is observable."""
    Image.new("RGB", (64, 32), MAGENTA).save(HERE / "still.png")


def gif_animated():
    """Two frames, 500ms each, looping.

    Browsers clamp GIF delays below 20ms to 100ms, so 500ms is well clear of any
    clamping and gives a test a comfortable window to catch each frame.
    """
    frames = [Image.new("RGB", (64, 64), ORANGE), Image.new("RGB", (64, 64), CYAN)]
    frames[0].save(
        HERE / "anim.gif",
        save_all=True,
        append_images=frames[1:],
        duration=500,
        loop=0,
    )


def mp4_colour_steps():
    """3s of video: 1s red, 1s green, 1s blue.

    A test can therefore tell "which second of the clip is on screen" from one
    pixel, which is what makes trim and playhead-sync assertions possible.
    """
    seg = []
    for i, colour in enumerate(("red", "green", "blue")):
        p = HERE / f"_seg{i}.mp4"
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error",
             "-f", "lavfi", "-i", f"color=c={colour}:s=64x64:d=1:r=10",
             "-pix_fmt", "yuv420p", str(p)],
            check=True,
        )
        seg.append(p)

    listing = HERE / "_concat.txt"
    listing.write_text("".join(f"file '{p.name}'\n" for p in seg))
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error",
         "-f", "concat", "-safe", "0", "-i", str(listing),
         "-c", "copy", str(HERE / "clip.mp4")],
        check=True,
    )
    for p in seg:
        p.unlink()
    listing.unlink()


def wav_tone():
    """1s 440Hz sine, mono 8kHz to keep the fixture small.

    Audio has no pixels, so the tests assert on the <audio> element's own state
    rather than on the canvas.
    """
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error",
         "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
         "-ac", "1", "-ar", "8000",
         str(HERE / "tone.wav")],
        check=True,
    )


def duplicates():
    """Byte-identical copies under distinct names.

    `loadVideo` and `loadAudio` cache on the source URL, so two objects sharing a
    source share one element. Tests that need genuinely independent elements use
    a copy; the test that probes the shared-element behaviour deliberately does
    not.
    """
    for src, copies in (("clip.mp4", ("clip2.mp4", "clip3.mp4")),
                        ("tone.wav", ("tone2.wav",))):
        data = (HERE / src).read_bytes()
        for c in copies:
            (HERE / c).write_bytes(data)


def main():
    png_still()
    gif_animated()
    mp4_colour_steps()
    wav_tone()
    duplicates()
    for f in sorted(HERE.glob("*")):
        if f.name.startswith("_"):
            continue
        print(f"  {f.name:12} {f.stat().st_size:>7,} bytes")


if __name__ == "__main__":
    sys.exit(main())
