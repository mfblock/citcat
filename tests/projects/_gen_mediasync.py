#!/usr/bin/env python3
"""Generate tests/projects/mediasync.citcat.

Covers what media.citcat does not: video trim-out, the media lifecycle around
pause/stop/dispose, the GIF decode fallback, and the two wipe kinds the
renderer had no case for.

    python3 tests/projects/_gen_mediasync.py
"""
import json
import uuid
from pathlib import Path

OUT = Path(__file__).resolve().parent / "mediasync.citcat"


def uid():
    return str(uuid.uuid4())


def style(**kw):
    s = {"fill": "#3b82f6", "stroke": "#000000", "stroke_width": 0.0,
         "font_family": "system-ui", "font_size": 24.0, "font_weight": 400,
         "text_align": "Left", "line_height": 1.4, "border_radius": 0.0,
         "fill_gradient": None, "stroke_gradient": None}
    s.update(kw)
    return s


def tf(x, y, w, h):
    return {"x": float(x), "y": float(y), "width": float(w), "height": float(h),
            "rotation": 0.0, "opacity": 1.0}


def obj(name, typ, transform, st=None, content="", z=0, **extra):
    o = {"id": uid(), "name": name, "object_type": typ, "transform": transform,
         "style": st or style(), "content": content, "z_index": z,
         "visible": True, "locked": False, "keyframes": [],
         "events": [], "data_bindings": []}
    o.update(extra)
    return o


def scene(name, objects, duration=3000, bg="#101010", tin=None):
    return {"id": uid(), "name": name, "duration_ms": duration,
            "background": {"fill": bg, "gradient": None, "image": None},
            "objects": objects, "transition_in": tin, "transition_out": None,
            "sort_order": 0, "wait_points": []}


def trans(kind, ms):
    return {"kind": kind, "duration_ms": int(ms)}


scenes = [
    # 0 -- trim-out. The clip is blue in its third second; trimming the window
    #      to 0..1000 means it must never reach blue, and must stop at the edge.
    scene("TrimOut", [
        obj("Capped", "Video", tf(200, 200, 400, 400), content="assets/clip.mp4",
            video_muted=True, video_trim_start_ms=0, video_trim_end_ms=1000),
    ], duration=4000),

    # 1 -- audio lifecycle: one looping track, long enough to outlive the scene
    #      if nothing ever pauses it.
    scene("AudioLife", [
        obj("Loop", "Audio", tf(200, 200, 300, 100), content="assets/tone.wav",
            audio_volume=0.4, audio_loop=True),
    ], duration=2000),

    # 2 -- a GIF on its own, for the decode-fallback probe.
    scene("GifOnly", [
        obj("Anim", "Image", tf(600, 300, 400, 400), content="assets/anim.gif"),
    ], duration=4000),

    # 3/4 -- WipeUp across a red/green seam. Short scenes so the boundary
    #        arrives quickly; a long transition so it is easy to sample.
    scene("UpA", [], duration=700, bg="#ff0000"),
    scene("UpB", [], duration=2500, bg="#00ff00", tin=trans("WipeUp", 1200)),

    # 5/6 -- WipeDown across a blue/yellow seam.
    scene("DownA", [], duration=700, bg="#0000ff"),
    scene("DownB", [], duration=2500, bg="#ffff00", tin=trans("WipeDown", 1200)),
]

project = {
    "version": "1.0",
    "meta": {"name": "Media sync + wipes", "width": 1920, "height": 1080, "fps": 30,
             "created": "2026-09-25T00:00:00Z", "modified": "2026-09-25T00:00:00Z"},
    "scenes": scenes,
    "effects_library": [],
    "data_source": None,
    "export_settings": {"format": "Html", "single_file": True,
                        "autoplay": False, "loop_playback": False},
}

OUT.write_text(json.dumps(project, indent=2))
print(f"wrote {OUT.name}: {len(scenes)} scenes")
for i, s in enumerate(scenes):
    t = s["transition_in"]["kind"] if s["transition_in"] else "-"
    print(f"  {i} {s['name']:10} bg={s['background']['fill']:8} in={t}")
