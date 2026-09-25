"""Base fixture for the coverage suite.

Deliberately exercises a wide slice of the model in one small project, so the
liveness layer can mutate a single field at a time and watch what changes.
Two scenes, because a transition needs a boundary.
"""
import json
import pathlib
import uuid


def uid():
    return str(uuid.uuid4())


def style(**kw):
    s = {
        "fill": "#3b82f6", "stroke": "#000000", "stroke_width": 0.0,
        "font_family": "system-ui", "font_size": 40.0, "font_weight": 400,
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
    return {"id": uid(), "time_ms": int(t), "property": prop,
            "value": v, "easing": easing}


def obj(name, typ, transform, st=None, content="", z=0, **extra):
    o = {
        "id": uid(), "name": name, "object_type": typ, "transform": transform,
        "style": st or style(), "content": content, "z_index": z,
        "visible": True, "locked": False, "keyframes": [], "events": [],
        "data_bindings": [], "condition": None, "motion_path": None,
    }
    o.update(extra)
    return o


def build():
    # Scene 0 -- a broad spread of object types and features.
    moving = obj("Moving", "Rect", tf(100, 100, 200, 200),
                 style(fill="#ff0000"), z=1)
    moving["keyframes"] = [kf(0, "transform.x", 100), kf(2000, "transform.x", 1400)]

    under = obj("Under", "Rect", tf(600, 600, 300, 300), style(fill="#00ff00"), z=1)
    over = obj("Over", "Rect", tf(700, 700, 300, 300), style(fill="#0000ff"), z=2)

    label = obj("Label", "Text", tf(100, 500, 700, 200),
                style(fill="#ffffff", font_size=48.0), content="coverage probe")

    blurred = obj("Blurred", "Ellipse", tf(1400, 700, 240, 240),
                  style(fill="#ffff00"), z=1,
                  filters={"blur": 6.0})

    pathed = obj("Pathed", "Rect", tf(0, 0, 120, 120), style(fill="#ff00ff"), z=3)
    pathed["motion_path"] = {
        "id": uid(),
        "points": [
            {"x": 200.0, "y": 900.0, "control_in": None, "control_out": None},
            {"x": 1700.0, "y": 900.0, "control_in": None, "control_out": None},
        ],
    }
    pathed["keyframes"] = [kf(0, "_path_progress", 0.0), kf(2000, "_path_progress", 1.0)]

    button = obj("Goto", "Button", tf(1500, 100, 300, 120),
                 style(fill="#7c3aed", font_size=32.0), content="go", z=4)

    scene0 = {
        "id": uid(), "name": "Probe", "duration_ms": 3000,
        "background": {"fill": "#101018", "gradient": None, "image": None},
        "objects": [moving, under, over, label, blurred, pathed, button],
        "transition_in": None, "transition_out": None, "sort_order": 0,
        "wait_points": [], "subtitle_track": None,
    }

    scene1 = {
        "id": uid(), "name": "Second", "duration_ms": 3000,
        "background": {"fill": "#802020", "gradient": None, "image": None},
        "objects": [obj("Marker", "Rect", tf(800, 400, 400, 400),
                        style(fill="#00ffff"))],
        "transition_in": None, "transition_out": None, "sort_order": 1,
        "wait_points": [], "subtitle_track": None,
    }

    # The button navigates to scene 1, so event liveness is drivable.
    button["events"] = [{
        "id": uid(),
        "trigger": {"type": "Click"},
        "action": {"type": "GotoScene", "scene_id": scene1["id"]},
    }]

    return {
        "version": "1.0",
        "meta": {"name": "Coverage probe", "width": 1920, "height": 1080,
                 "fps": 30, "created": "2026-09-25T00:00:00Z",
                 "modified": "2026-09-25T00:00:00Z"},
        "scenes": [scene0, scene1],
        "effects_library": [],
        "data_source": None,
        "export_settings": {"format": "Html", "single_file": True,
                            "autoplay": False, "loop_playback": False},
    }


if __name__ == "__main__":
    out = pathlib.Path(__file__).resolve().parent / "coverage.citcat"
    out.write_text(json.dumps(build(), indent=2))
    print(f"wrote {out}")
