"""Fixture for tests/suites/gradients.py (D7)."""
import json, uuid, pathlib

def uid(): return str(uuid.uuid4())

def style(**kw):
    s = {"fill": "#3b82f6", "fill_gradient": None,
         "stroke": "#000000", "stroke_gradient": None,
         "stroke_width": 0.0, "font_family": "system-ui", "font_size": 24.0,
         "font_weight": 400, "text_align": "Left", "line_height": 1.4,
         "border_radius": 0.0}
    s.update(kw); return s

def tf(x, y, w, h, op=1.0):
    return {"x": float(x), "y": float(y), "width": float(w), "height": float(h),
            "rotation": 0.0, "opacity": float(op)}

def grad(kind, stops, angle=0.0):
    return {"gradient_type": kind, "angle": float(angle),
            "stops": [{"offset": float(o), "color": c} for o, c in stops]}

def kf(t, prop, value, easing="Linear"):
    return {"id": uid(), "time_ms": int(t), "property": prop,
            "value": value, "easing": easing}

def gval(g):  return {"type": "Gradient", "value": g}
def cval(c):  return {"type": "Color", "value": c}

def obj(name, typ, transform, st=None, content="", keyframes=None, z=0):
    return {"id": uid(), "name": name, "object_type": typ, "transform": transform,
            "style": st or style(), "content": content, "z_index": z,
            "visible": True, "locked": False, "keyframes": keyframes or [],
            "events": [], "data_bindings": []}

def scene(name, bg_fill, objs, dur=2000):
    return {"id": uid(), "name": name, "duration_ms": dur,
            "background": {"fill": bg_fill, "gradient": None, "image": None},
            "objects": objs, "transition_in": None, "transition_out": None,
            "sort_order": 0, "wait_points": []}

BLACK_WHITE = [(0.0, "#000000"), (1.0, "#ffffff")]

scenes = [
    # 0 - basic linear/radial/stroke/fallback, on black
    scene("Basics", "#000000", [
        obj("LinearFill", "Rect", tf(100, 100, 400, 200),
            style(fill="#ff0000", fill_gradient=grad("Linear", BLACK_WHITE))),
        obj("RadialFill", "Rect", tf(600, 100, 400, 200),
            style(fill="#ff0000", fill_gradient=grad("Radial", [(0.0, "#ffffff"), (1.0, "#000000")]))),
        # gradient with one stop -> not paintable -> falls back to flat fill
        obj("OneStop", "Rect", tf(1100, 100, 300, 200),
            style(fill="#00ff00", fill_gradient=grad("Linear", [(0.0, "#ff00ff")]))),
        # unsorted + out-of-range offsets must not throw
        obj("Unsorted", "Rect", tf(100, 400, 400, 200),
            style(fill="#ff0000",
                  fill_gradient=grad("Linear", [(1.7, "#ffffff"), (-0.5, "#000000")]))),
        # thick gradient stroke, no fill
        obj("GradStroke", "Rect", tf(600, 400, 400, 200),
            style(fill="transparent", stroke="#ff0000", stroke_width=40.0,
                  stroke_gradient=grad("Linear", BLACK_WHITE))),
        obj("EllipseGrad", "Ellipse", tf(1100, 400, 300, 200),
            style(fill="#ff0000", fill_gradient=grad("Linear", BLACK_WHITE))),
    ]),

    # 1 - angle: same gradient at 0 and 90 degrees
    scene("Angle", "#000000", [
        obj("Angle0", "Rect", tf(100, 100, 400, 400),
            style(fill="#ff0000", fill_gradient=grad("Linear", BLACK_WHITE, 0))),
        obj("Angle90", "Rect", tf(700, 100, 400, 400),
            style(fill="#ff0000", fill_gradient=grad("Linear", BLACK_WHITE, 90))),
    ]),

    # 2 - alpha compositing over a known red backdrop
    scene("Alpha", "#000000", [
        obj("Backdrop", "Rect", tf(0, 0, 1920, 1080), style(fill="#ff0000"), z=0),
        # 50% alpha white over red -> ~half-way to white
        obj("HalfWhite", "Rect", tf(100, 100, 300, 300),
            style(fill="#ffffff80"), z=1),
        # opacity 0.5 AND alpha 0.5 -> ~25% coverage
        obj("Both", "Rect", tf(600, 100, 300, 300, op=0.5),
            style(fill="#ffffff80"), z=1),
        # gradient fading to fully transparent
        obj("FadeOut", "Rect", tf(1100, 100, 400, 300),
            style(fill="#00ff00",
                  fill_gradient=grad("Linear", [(0.0, "#ffffffff"), (1.0, "#ffffff00")])), z=1),
    ]),

    # 3 - animation: colour alpha over time, gradient over time, and a snap
    scene("Animated", "#000000", [
        # #ff0000ff -> #ff000000 : alpha must pass through the middle
        obj("AlphaAnim", "Rect", tf(100, 100, 300, 300),
            style(fill="#ff0000"),
            keyframes=[kf(0, "style.fill", cval("#ff0000ff")),
                       kf(1000, "style.fill", cval("#ff000000"))]),
        # gradient ramp shifts: black->white becomes white->black
        obj("GradAnim", "Rect", tf(600, 100, 400, 300),
            style(fill="#ff0000", fill_gradient=grad("Linear", BLACK_WHITE)),
            keyframes=[kf(0, "style.fill_gradient", gval(grad("Linear", BLACK_WHITE))),
                       kf(1000, "style.fill_gradient",
                          gval(grad("Linear", [(0.0, "#ffffff"), (1.0, "#000000")])))]),
        # mismatched stop counts must snap, not blend into garbage
        obj("GradSnap", "Rect", tf(1100, 100, 400, 300),
            style(fill="#ff0000", fill_gradient=grad("Linear", BLACK_WHITE)),
            keyframes=[kf(0, "style.fill_gradient", gval(grad("Linear", BLACK_WHITE))),
                       kf(1000, "style.fill_gradient",
                          gval(grad("Linear", [(0.0, "#ff0000"), (0.5, "#00ff00"), (1.0, "#0000ff")])))]),
    ]),
]

project = {
    "version": "1.0",
    "meta": {"name": "Gradient tests", "width": 1920, "height": 1080, "fps": 30,
             "created": "2026-09-25T00:00:00Z", "modified": "2026-09-25T00:00:00Z"},
    "scenes": scenes, "effects_library": [], "data_source": None,
    "export_settings": {"format": "Html", "single_file": True,
                        "autoplay": False, "loop_playback": False},
}

p = pathlib.Path(__file__).parent / "gradients.citcat"
p.write_text(json.dumps(project, indent=2))
print("wrote", p, len(scenes), "scenes")
