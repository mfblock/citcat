#!/usr/bin/env python3
"""
Generate the .citcat fixtures for the easing / motionpath / effects suites.

    python3 tests/projects/_gen.py

Struct shape follows tests/projects/keyframes.citcat exactly.
"""
import json
import pathlib
import uuid

HERE = pathlib.Path(__file__).resolve().parent


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


def tf(x, y, w, h, rot=0.0, op=1.0):
    return {
        "x": float(x), "y": float(y), "width": float(w), "height": float(h),
        "rotation": float(rot), "opacity": float(op),
    }


def kf(t, prop, val, easing="Linear"):
    if isinstance(val, bool):
        v = {"type": "Bool", "value": val}
    elif isinstance(val, str):
        v = {"type": "Color", "value": val}
    else:
        v = {"type": "Number", "value": float(val)}
    return {"id": uid(), "time_ms": int(t), "property": prop, "value": v, "easing": easing}


def obj(name, typ, transform, st=None, content="", keyframes=None, z=0, motion_path=None):
    o = {
        "id": uid(), "name": name, "object_type": typ, "transform": transform,
        "style": st or style(), "content": content, "z_index": z,
        "visible": True, "locked": False, "keyframes": keyframes or [],
        "events": [], "data_bindings": [],
    }
    if motion_path is not None:
        o["motion_path"] = motion_path
    return o


def point(x, y, cin=None, cout=None):
    return {
        "x": float(x), "y": float(y),
        "control_in": {"x": float(cin[0]), "y": float(cin[1])} if cin else None,
        "control_out": {"x": float(cout[0]), "y": float(cout[1])} if cout else None,
    }


def path(points):
    return {"id": uid(), "points": points}


def scene(name, duration, objects, bg="#101018"):
    return {
        "id": uid(), "name": name, "duration_ms": int(duration),
        "background": {"fill": bg}, "objects": objects,
        "transition_in": None, "transition_out": None, "sort_order": 0,
        "wait_points": [],
    }


def project(name, scenes, w=1920, h=1080):
    return {
        "version": "1.0",
        "meta": {
            "name": name, "width": w, "height": h, "fps": 30,
            "created": "2026-09-25T00:00:00Z", "modified": "2026-09-25T00:00:00Z",
        },
        "scenes": scenes, "effects_library": [], "data_source": None,
        "export_settings": {
            "format": "Html", "single_file": True,
            "autoplay": False, "loop_playback": False,
        },
    }


def write(name, proj):
    p = HERE / f"{name}.citcat"
    p.write_text(json.dumps(proj, indent=2))
    n = sum(len(s["objects"]) for s in proj["scenes"])
    print(f"wrote {p.name}  ({len(proj['scenes'])} scene(s), {n} objects)")


# ---------------------------------------------------------------- easing

def build_easing():
    """One object per easing, transform.x 0 -> 1000 over 1000ms.

    runtime.js takes the easing from the *later* keyframe of the pair
    (`applyEasing(rawT, after.easing)`), so both keyframes carry it.
    """
    objs = []
    for i, ease in enumerate(["Linear", "EaseIn", "EaseOut", "EaseInOut"]):
        objs.append(obj(
            ease, "Rect", tf(0, 100 + i * 150, 80, 80),
            keyframes=[
                kf(0, "transform.x", 0, ease),
                kf(1000, "transform.x", 1000, ease),
            ],
        ))
    return project("Easing tests", [scene("Easing", 1500, objs)])


# ------------------------------------------------------------ motionpath

def build_motionpath():
    objs = [
        # straight horizontal, two points, no control handles
        obj("StraightPath", "Rect", tf(0, 0, 100, 100),
            motion_path=path([point(100, 100), point(900, 100)]),
            keyframes=[
                kf(0, "_path_progress", 0.0),
                kf(1000, "_path_progress", 1.0),
            ]),
        # straight diagonal, exercises both axes at once
        obj("DiagonalPath", "Rect", tf(0, 0, 60, 60),
            motion_path=path([point(0, 0), point(1000, 500)]),
            keyframes=[
                kf(0, "_path_progress", 0.0),
                kf(1000, "_path_progress", 1.0),
            ]),
        # three-point arch with bezier control handles
        obj("CurvedPath", "Rect", tf(0, 0, 80, 80),
            motion_path=path([
                point(200, 800, cout=(200, 200)),
                point(960, 200, cin=(600, 200), cout=(1320, 200)),
                point(1720, 800, cin=(1720, 200)),
            ]),
            keyframes=[
                kf(0, "_path_progress", 0.0),
                kf(1000, "_path_progress", 1.0),
            ]),
        # has a path but never drives it -> must keep its static transform
        obj("PathNoProgress", "Rect", tf(700, 900, 50, 50),
            motion_path=path([point(100, 100), point(900, 900)])),
        # drives a path that does not exist -> must not crash, stays static
        obj("ProgressNoPath", "Rect", tf(300, 900, 50, 50),
            keyframes=[
                kf(0, "_path_progress", 0.0),
                kf(1000, "_path_progress", 1.0),
            ]),
        # single-point path: degenerate, should pin to that point
        obj("SinglePointPath", "Rect", tf(0, 0, 40, 40),
            motion_path=path([point(500, 500)]),
            keyframes=[
                kf(0, "_path_progress", 0.0),
                kf(1000, "_path_progress", 1.0),
            ]),
    ]
    return project("Motion path tests", [scene("MotionPath", 1500, objs)])


# --------------------------------------------------------------- effects

STAGE_W, STAGE_H = 1920, 1080


def build_effects():
    """Objects carrying the keyframes each catalogue effect is meant to produce
    *after* the app has resolved its relative values. This tests the runtime's
    handling of the resulting animation, not the Rust resolver."""
    objs = []

    # Fade In: opacity 0 -> 1 over 500ms, EaseOut
    objs.append(obj("FadeIn", "Rect", tf(100, 100, 100, 100, op=1.0), keyframes=[
        kf(0, "transform.opacity", 0.0, "EaseOut"),
        kf(500, "transform.opacity", 1.0, "EaseOut"),
    ]))

    # Fade Out: opacity 1 -> 0 over 500ms, EaseIn
    objs.append(obj("FadeOut", "Rect", tf(250, 100, 100, 100), keyframes=[
        kf(0, "transform.opacity", 1.0, "EaseIn"),
        kf(500, "transform.opacity", 0.0, "EaseIn"),
    ]))

    # Slide In Left: object rests at x=800, enters from x - stage_width
    slide_x = 800
    objs.append(obj("SlideInLeft", "Rect", tf(slide_x, 250, 100, 100), keyframes=[
        kf(0, "transform.x", slide_x - STAGE_W, "EaseOut"),
        kf(600, "transform.x", slide_x, "EaseOut"),
        kf(0, "transform.opacity", 0.0, "Linear"),
        kf(100, "transform.opacity", 1.0, "Linear"),
    ]))

    # Scale Up: 0x0 -> 200x150 over 500ms; opacity catches up by 150ms
    objs.append(obj("ScaleUp", "Rect", tf(400, 400, 200, 150), keyframes=[
        kf(0, "transform.width", 0.0, "EaseOut"),
        kf(500, "transform.width", 200.0, "EaseOut"),
        kf(0, "transform.height", 0.0, "EaseOut"),
        kf(500, "transform.height", 150.0, "EaseOut"),
        kf(0, "transform.opacity", 0.0, "Linear"),
        kf(150, "transform.opacity", 1.0, "Linear"),
    ]))

    # Scale Down: 200x150 -> 0x0 over 500ms
    objs.append(obj("ScaleDown", "Rect", tf(700, 400, 200, 150), keyframes=[
        kf(0, "transform.width", 200.0, "EaseIn"),
        kf(500, "transform.width", 0.0, "EaseIn"),
        kf(0, "transform.height", 150.0, "EaseIn"),
        kf(500, "transform.height", 0.0, "EaseIn"),
        kf(350, "transform.opacity", 1.0, "Linear"),
        kf(500, "transform.opacity", 0.0, "Linear"),
    ]))

    # Pulse: 1 -> 0.5 -> 1 over 800ms
    objs.append(obj("Pulse", "Rect", tf(1000, 400, 100, 100), keyframes=[
        kf(0, "transform.opacity", 1.0, "EaseInOut"),
        kf(400, "transform.opacity", 0.5, "EaseInOut"),
        kf(800, "transform.opacity", 1.0, "EaseInOut"),
    ]))

    # Spin: rotation 0 -> 360 over 1000ms, Linear
    objs.append(obj("Spin", "Rect", tf(1200, 400, 100, 100), keyframes=[
        kf(0, "transform.rotation", 0.0, "Linear"),
        kf(1000, "transform.rotation", 360.0, "Linear"),
    ]))

    # Float: y 400 -> 380 -> 400 over 2000ms
    float_y = 400
    objs.append(obj("Float", "Rect", tf(1400, float_y, 100, 100), keyframes=[
        kf(0, "transform.y", float_y, "EaseInOut"),
        kf(1000, "transform.y", float_y - 20, "EaseInOut"),
        kf(2000, "transform.y", float_y, "EaseInOut"),
    ]))

    # Bounce: y 400 -> 360 -> 400 -> 385 -> 400 over 1000ms
    bounce_y = 400
    objs.append(obj("Bounce", "Rect", tf(1600, bounce_y, 100, 100), keyframes=[
        kf(0, "transform.y", bounce_y, "EaseOut"),
        kf(250, "transform.y", bounce_y - 40, "EaseOut"),
        kf(500, "transform.y", bounce_y, "EaseIn"),
        kf(700, "transform.y", bounce_y - 15, "EaseOut"),
        kf(1000, "transform.y", bounce_y, "EaseIn"),
    ]))

    # Typewriter: _typewriter_progress 0 -> 1 over 1500ms
    objs.append(obj("Typewriter", "Text", tf(100, 700, 900, 100),
                    st=style(font_size=48.0),
                    content="The quick brown fox jumps",
                    keyframes=[
                        kf(0, "_typewriter_progress", 0.0, "Linear"),
                        kf(1500, "_typewriter_progress", 1.0, "Linear"),
                    ]))

    return project("Effect behaviour tests", [scene("Effects", 2500, objs)])


if __name__ == "__main__":
    write("easing", build_easing())
    write("motionpath", build_motionpath())
    write("effects", build_effects())
