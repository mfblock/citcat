#!/usr/bin/env python3
"""Fixtures for the embed parity suite. Run: python3 tests/projects/_gen_embed.py"""
import json
import uuid
from pathlib import Path

OUT = Path(__file__).resolve().parent


def uid():
    return str(uuid.uuid4())


def style(**kw):
    s = {"fill": "#3b82f6", "stroke": "#000000", "stroke_width": 0.0,
         "font_family": "system-ui", "font_size": 24.0, "font_weight": 400,
         "text_align": "Left", "line_height": 1.4, "border_radius": 0.0}
    s.update(kw)
    return s


def tf(x, y, w, h, rot=0.0, op=1.0):
    return {"x": float(x), "y": float(y), "width": float(w), "height": float(h),
            "rotation": float(rot), "opacity": float(op)}


def kf(t, prop, val, easing="Linear"):
    if isinstance(val, bool):
        v = {"type": "Bool", "value": val}
    elif isinstance(val, str):
        v = {"type": "Color", "value": val}
    else:
        v = {"type": "Number", "value": float(val)}
    return {"id": uid(), "time_ms": int(t), "property": prop, "value": v, "easing": easing}


def obj(name, typ, transform, st=None, content="", keyframes=None, z=0,
        visible=True, events=None):
    return {"id": uid(), "name": name, "object_type": typ, "transform": transform,
            "style": st or style(), "content": content, "z_index": z,
            "visible": visible, "locked": False, "keyframes": keyframes or [],
            "events": events or [], "data_bindings": []}


def scene(name, duration, objects, bg="#101018", wait_points=None,
          t_in=None, t_out=None, order=0):
    return {"id": uid(), "name": name, "duration_ms": duration,
            "background": {"fill": bg}, "objects": objects,
            "transition_in": t_in, "transition_out": t_out,
            "sort_order": order, "wait_points": wait_points or []}


def project(name, scenes, loop=False):
    return {"version": "1.0",
            "meta": {"name": name, "width": 1920, "height": 1080, "fps": 30,
                     "created": "2026-09-25T00:00:00Z",
                     "modified": "2026-09-25T00:00:00Z"},
            "scenes": scenes, "effects_library": [], "data_source": None,
            "export_settings": {"format": "Html", "single_file": True,
                                "autoplay": False, "loop_playback": loop}}


# --- embed_hittest -----------------------------------------------------------
# A rect authored at x=100 that has travelled to x=1500 by 2000ms. A wait point
# with a very long timer freezes playback there (isPlaying stays true, so events
# still fire) which makes the click position deterministic.
target = obj("Target", "Rect", tf(200, 700, 300, 200),
             st=style(fill="#22c55e"), visible=False, z=1)
mover = obj("Mover", "Rect", tf(100, 200, 200, 200),
            st=style(fill="#ef4444"), z=2,
            keyframes=[kf(0, "transform.x", 100), kf(2000, "transform.x", 1500)])
mover["events"] = [{"id": uid(), "trigger": {"type": "Click"},
                    "action": {"type": "ToggleVisible", "object_id": target["id"]}}]

hittest = project("Embed hit testing", [
    scene("Frozen", 6000, [target, mover],
          wait_points=[{"id": uid(), "time_ms": 2000,
                        "resume_on": {"type": "Timer", "delay_ms": 600000}}])
])

# --- embed_loop --------------------------------------------------------------
# Two short scenes, loop_playback false on disk. The `loop` attribute on the
# element must override it, so the player wraps to scene 0 instead of stopping.
loop_proj = project("Embed loop", [
    scene("One", 500, [obj("A", "Rect", tf(100, 100, 400, 400),
                           st=style(fill="#ff0000"))], bg="#000010", order=0),
    scene("Two", 500, [obj("B", "Rect", tf(100, 100, 400, 400),
                           st=style(fill="#0000ff"))], bg="#001000", order=1),
], loop=False)

# --- embed_crossfade ---------------------------------------------------------
# seekTo() clamps to the scene duration, so a transition can only be observed by
# playing through it. A short scene with a long crossfade gives a wide window to
# catch mid-blend: pure red background fading into pure blue.
crossfade = project("Embed crossfade", [
    scene("Red", 400, [], bg="#ff0000", order=0,
          t_out={"kind": "Crossfade", "duration_ms": 1200}),
    scene("Blue", 3000, [], bg="#0000ff", order=1),
])

for fname, data in (("embed_hittest", hittest), ("embed_loop", loop_proj),
                    ("embed_crossfade", crossfade)):
    p = OUT / f"{fname}.citcat"
    p.write_text(json.dumps(data, indent=2))
    print(f"wrote {p.name}")
