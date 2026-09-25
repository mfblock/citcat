#!/usr/bin/env python3
"""Generate tests/projects/media.citcat.

One scene per object type that no fixture had ever contained: Image, animated
GIF, Video, Audio, Ellipse and Button.

Layout is chosen so every assertion is a single unambiguous pixel probe: each
asset paints a colour no other asset uses, and objects never overlap.

    python3 tests/projects/_gen_media.py
"""
import json
import uuid
from pathlib import Path

OUT = Path(__file__).resolve().parent / "media.citcat"

BG = "#101010"          # dark, distinct from every asset colour
MARKER = "#ffff00"      # yellow: "the rest of the frame is intact"
DISC = "#ffff00"
RING = "#ff00ff"
BUTTON = "#0000ff"


def uid():
    return str(uuid.uuid4())


def style(**kw):
    s = {
        "fill": "#3b82f6", "stroke": "#000000", "stroke_width": 0.0,
        "font_family": "system-ui", "font_size": 24.0, "font_weight": 400,
        "text_align": "Left", "line_height": 1.4, "border_radius": 0.0,
    }
    s.update(kw)
    return s


def tf(x, y, w, h):
    return {"x": float(x), "y": float(y), "width": float(w), "height": float(h),
            "rotation": 0.0, "opacity": 1.0}


def kf(t, prop, val, easing="Linear"):
    return {"id": uid(), "time_ms": int(t), "property": prop,
            "value": {"type": "Number", "value": float(val)}, "easing": easing}


def obj(name, typ, transform, st=None, content="", z=0, **extra):
    o = {
        "id": uid(), "name": name, "object_type": typ, "transform": transform,
        "style": st or style(), "content": content, "z_index": z,
        "visible": True, "locked": False, "keyframes": [],
        "events": [], "data_bindings": [],
    }
    o.update(extra)
    return o


def scene(name, objects, duration=3000):
    return {
        "id": uid(), "name": name, "duration_ms": duration,
        "background": {"fill": BG, "gradient": None, "image": None},
        "objects": objects, "transition_in": None, "transition_out": None,
        "sort_order": 0, "wait_points": [],
    }


scenes = [
    # 0 -- Image: a real PNG, a 404, and a marker proving the frame survives both
    scene("Image", [
        obj("Photo", "Image", tf(200, 200, 400, 200), content="assets/still.png"),
        obj("Missing", "Image", tf(800, 200, 300, 300), content="assets/nope.png"),
        obj("Marker", "Rect", tf(1300, 200, 300, 300), style(fill=MARKER)),
    ]),

    # 1 -- animated GIF. Two frames, 500ms each.
    scene("Gif", [
        obj("Anim", "Image", tf(600, 300, 400, 400), content="assets/anim.gif"),
    ], duration=5000),

    # 2 -- Video, untrimmed. Clip is 1s red, 1s green, 1s blue.
    scene("Video", [
        obj("Clip", "Video", tf(200, 200, 400, 400), content="assets/clip.mp4",
            video_muted=True),
    ], duration=5000),

    # 3 -- Video with a trim, and one deliberately unmuted. Separate sources so
    #      the URL-keyed element cache cannot make them share state.
    scene("VideoTrim", [
        obj("Trimmed", "Video", tf(200, 200, 400, 400), content="assets/clip2.mp4",
            video_muted=True, video_trim_start_ms=2000),
        obj("Unmuted", "Video", tf(900, 200, 300, 300), content="assets/clip3.mp4",
            video_muted=False),
    ], duration=5000),

    # 4 -- two Video objects sharing one source at different trims. Probes what
    #      the URL-keyed cache does when a project legitimately reuses an asset.
    scene("VideoShared", [
        obj("ShareA", "Video", tf(200, 200, 400, 400), content="assets/clip.mp4",
            video_muted=True, video_trim_start_ms=0),
        obj("ShareB", "Video", tf(900, 200, 400, 400), content="assets/clip.mp4",
            video_muted=True, video_trim_start_ms=2000),
    ], duration=4000),

    # 5 -- Audio: static volume + loop, and a keyframed fade on a second source.
    scene("Audio", [
        obj("Music", "Audio", tf(200, 200, 300, 100), content="assets/tone.wav",
            audio_volume=0.5, audio_loop=True),
        dict(obj("Fader", "Audio", tf(200, 400, 300, 100),
                 content="assets/tone2.wav", audio_volume=1.0, audio_loop=False),
             keyframes=[kf(0, "audio_volume", 1.0), kf(2000, "audio_volume", 0.0)]),
        obj("Marker", "Rect", tf(1300, 200, 300, 300), style(fill=MARKER)),
    ], duration=4000),

    # 6 -- Ellipse: a filled disc and a stroked ring, both deliberately
    #      non-square so a rectangle fallback is obvious.
    scene("Ellipse", [
        obj("Disc", "Ellipse", tf(200, 200, 400, 300), style(fill=DISC)),
        obj("Ring", "Ellipse", tf(900, 200, 400, 300),
            style(fill="transparent", stroke=RING, stroke_width=20.0)),
    ]),

    # 7 -- Button: identical but for border_radius, so a corner probe isolates it.
    scene("Button", [
        obj("Flat", "Button", tf(200, 200, 400, 200),
            style(fill=BUTTON, font_size=72.0, border_radius=0.0), content="OK"),
        obj("Round", "Button", tf(800, 200, 400, 200),
            style(fill=BUTTON, font_size=72.0, border_radius=90.0), content="OK"),
    ]),
]

project = {
    "version": "1.0",
    "meta": {"name": "Media tests", "width": 1920, "height": 1080, "fps": 30,
             "created": "2026-09-25T00:00:00Z", "modified": "2026-09-25T00:00:00Z"},
    "scenes": scenes,
    "effects_library": [],
    "data_source": None,
    "export_settings": {"format": "Html", "single_file": True,
                        "autoplay": False, "loop_playback": False},
}

OUT.write_text(json.dumps(project, indent=2))
print(f"wrote {OUT.name}: {len(scenes)} scenes, "
      f"{sum(len(s['objects']) for s in scenes)} objects")
for i, s in enumerate(scenes):
    kinds = ", ".join(sorted({o["object_type"] for o in s["objects"]}))
    print(f"  {i} {s['name']:12} {kinds}")
