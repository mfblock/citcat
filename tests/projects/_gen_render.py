#!/usr/bin/env python3
"""
Generates the projects for the lifespan / filters / text / playback suites.

    python3 tests/projects/_gen_render.py
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


def filters(**kw):
    """ObjectFilters with only the named fields set (rest null/absent)."""
    f = {"blur": None, "drop_shadow": None, "brightness": None, "contrast": None,
         "saturate": None, "hue_rotate": None, "grayscale": None, "sepia": None}
    f.update(kw)
    return f


def obj(name, typ, transform, st=None, content="", keyframes=None, z=0, **extra):
    o = {
        "id": uid(), "name": name, "object_type": typ, "transform": transform,
        "style": st or style(), "content": content, "z_index": z,
        "visible": True, "locked": False, "keyframes": keyframes or [],
        "events": [], "data_bindings": [],
    }
    o.update(extra)
    return o


def scene(name, duration, objects, bg="#000000", **extra):
    s = {
        "id": uid(), "name": name, "duration_ms": int(duration),
        "background": {"fill": bg}, "objects": objects,
        "transition_in": None, "transition_out": None,
        "sort_order": 0, "wait_points": [],
    }
    s.update(extra)
    return s


def project(name, scenes, loop=False):
    return {
        "version": "1.0",
        "meta": {"name": name, "width": 1920, "height": 1080, "fps": 30,
                 "created": "2026-09-25T00:00:00Z", "modified": "2026-09-25T00:00:00Z"},
        "scenes": scenes, "effects_library": [], "data_source": None,
        "export_settings": {"format": "Html", "single_file": True,
                            "autoplay": False, "loop_playback": bool(loop)},
    }


def write(name, data):
    p = HERE / f"{name}.citcat"
    p.write_text(json.dumps(data, indent=2))
    print(f"  {p.name}")
    return p


# --------------------------------------------------------------------------
# lifespan
# --------------------------------------------------------------------------
def gen_lifespan():
    # Background is pure black so any drawn pixel is unambiguous ink.
    RED = "#ff0000"
    objs = [
        # appears at 1000ms, stays to the end
        obj("AppearsLate", "Rect", tf(100, 100, 200, 200), style(fill=RED),
            appear_at_ms=1000, disappear_at_ms=None),
        # visible from the start, gone after 2000ms
        obj("DisappearsEarly", "Rect", tf(400, 100, 200, 200), style(fill=RED),
            appear_at_ms=None, disappear_at_ms=2000),
        # window 1000..2000
        obj("WindowOnly", "Rect", tf(700, 100, 200, 200), style(fill=RED),
            appear_at_ms=1000, disappear_at_ms=2000),
        # no lifespan at all
        obj("Always", "Rect", tf(1000, 100, 200, 200), style(fill=RED)),
        # lifespan says hidden before 1500, but a visible keyframe says true at 0.
        # Which wins? The early return happens before keyframes are read, so
        # lifespan should win. Asserted as such.
        obj("LifespanVsKeyframe", "Rect", tf(1300, 100, 200, 200), style(fill=RED),
            appear_at_ms=1500,
            keyframes=[kf(0, "visible", True), kf(2500, "visible", True)]),
        # inverse: no lifespan, keyframe hides it
        obj("KeyframeHidden", "Rect", tf(1600, 100, 200, 200), style(fill=RED),
            keyframes=[kf(0, "visible", False), kf(9999, "visible", False)]),
    ]

    # Clickable object gated by lifespan: clicking it toggles Target's visibility.
    target = obj("ToggleTarget", "Rect", tf(100, 600, 200, 200), style(fill="#00ff00"))
    target["visible"] = False
    clicker = obj("GatedClicker", "Rect", tf(400, 600, 300, 300), style(fill="#0000ff"),
                  appear_at_ms=2000, disappear_at_ms=None)
    clicker["events"] = [{
        "id": uid(),
        "trigger": {"type": "Click"},
        "action": {"type": "ToggleVisible", "object_id": target["id"]},
    }]
    objs += [target, clicker]

    return write("lifespan", project("Lifespan tests",
                                     [scene("Lifespan", 4000, objs, bg="#000000")]))


# --------------------------------------------------------------------------
# filters
# --------------------------------------------------------------------------
def gen_filters():
    RED = "#ff0000"
    y = 100
    objs = [
        obj("NoFilter", "Rect", tf(100, y, 200, 200), style(fill=RED)),
        obj("Grayscale", "Rect", tf(400, y, 200, 200), style(fill=RED),
            filters=filters(grayscale=1.0)),
        obj("Brightness0", "Rect", tf(700, y, 200, 200), style(fill=RED),
            filters=filters(brightness=0.0)),
        obj("Sepia", "Rect", tf(1000, y, 200, 200), style(fill=RED),
            filters=filters(sepia=1.0)),
        obj("HueRotate", "Rect", tf(1300, y, 200, 200), style(fill=RED),
            filters=filters(hue_rotate=120.0)),
        obj("Saturate0", "Rect", tf(1600, y, 200, 200), style(fill=RED),
            filters=filters(saturate=0.0)),
        obj("Contrast", "Rect", tf(100, 400, 200, 200), style(fill="#808080"),
            filters=filters(contrast=3.0)),
        obj("Blurred", "Rect", tf(500, 400, 200, 200), style(fill=RED),
            filters=filters(blur=20.0)),
        obj("Shadowed", "Rect", tf(900, 400, 200, 200), style(fill=RED),
            filters=filters(drop_shadow={"offset_x": 30.0, "offset_y": 30.0,
                                         "blur": 5.0, "color": "#00ff00"})),
        obj("Stacked", "Rect", tf(1300, 400, 200, 200), style(fill=RED),
            filters=filters(grayscale=1.0, brightness=0.5, blur=2.0)),
        obj("NullFilters", "Rect", tf(1600, 400, 200, 200), style(fill=RED),
            filters=None),

        # ctx.filter leak probe: a heavily filtered object at a LOWER z_index,
        # drawn first, then a clean object. If the renderer forgets to reset
        # ctx.filter, the clean one comes out grey/dark too.
        obj("LeakSource", "Rect", tf(100, 750, 200, 200), style(fill=RED), z=0,
            filters=filters(grayscale=1.0, brightness=0.2)),
        obj("LeakVictim", "Rect", tf(400, 750, 200, 200), style(fill=RED), z=1),

        # keyframed blur 0 -> 10 (manual claims filters.* is animatable)
        obj("BlurAnimated", "Rect", tf(800, 750, 200, 200), style(fill=RED),
            filters=filters(blur=0.0),
            keyframes=[kf(0, "filters.blur", 0), kf(1000, "filters.blur", 10)]),
    ]
    return write("filters", project("Filter tests",
                                    [scene("Filters", 2000, objs, bg="#000000")]))


# --------------------------------------------------------------------------
# text
# --------------------------------------------------------------------------
def gen_text():
    """Layout note: every probe region below is exclusive to one object.
    Overlapping bands make an ink check pass on a neighbour's glyphs."""
    WHITE = "#ffffff"
    LONG = "The quick brown fox jumps over the lazy dog again and again"
    objs = [
        # row 1 -- explicit newline (y 60..200) | font_size keyframe (x 1400+)
        obj("MultiLine", "Text", tf(100, 60, 600, 140),
            style(fill=WHITE, font_size=40.0, line_height=1.5),
            content="LINE ONE\nLINE TWO"),
        obj("FontGrow", "Text", tf(1400, 60, 500, 160),
            style(fill=WHITE, font_size=20.0), content="MMMM",
            keyframes=[kf(0, "style.font_size", 20), kf(1000, "style.font_size", 100)]),

        # row 2 -- typewriter (y 230..300) | empty string (x 1400+)
        obj("Typewriter", "Text", tf(100, 230, 900, 70),
            style(fill=WHITE, font_size=48.0), content="ABCDEFGHIJ",
            keyframes=[kf(0, "_typewriter_progress", 0),
                       kf(1000, "_typewriter_progress", 1)]),
        obj("EmptyText", "Text", tf(1400, 250, 300, 70),
            style(fill=WHITE, font_size=40.0), content=""),

        # row 3 -- wrap on / wrap off (y 340..600), far apart so an unwrapped
        # WrapOn line (~885px at this size) cannot reach WrapOff's column
        obj("WrapOn", "Text", tf(100, 340, 300, 260),
            style(fill=WHITE, font_size=30.0, line_height=1.4),
            content=LONG, text_wrap=True),
        obj("WrapOff", "Text", tf(1100, 340, 300, 260),
            style(fill=WHITE, font_size=30.0, line_height=1.4),
            content=LONG, text_wrap=False),

        # row 4 -- line_height pair (y 650..880)
        obj("TightLines", "Text", tf(100, 650, 400, 150),
            style(fill=WHITE, font_size=30.0, line_height=1.0),
            content="AAA\nBBB"),
        obj("LooseLines", "Text", tf(900, 650, 400, 220),
            style(fill=WHITE, font_size=30.0, line_height=3.0),
            content="AAA\nBBB"),

        # row 5 -- alignment probes (y 900..980), identical text, three aligns
        obj("AlignLeft", "Text", tf(100, 900, 600, 80),
            style(fill=WHITE, font_size=48.0, text_align="Left"), content="ABC"),
        obj("AlignCenter", "Text", tf(800, 900, 600, 80),
            style(fill=WHITE, font_size=48.0, text_align="Center"), content="ABC"),
        obj("AlignRight", "Text", tf(1450, 900, 400, 80),
            style(fill=WHITE, font_size=48.0, text_align="Right"), content="ABC"),
    ]
    return write("text", project("Text tests",
                                 [scene("Text", 2000, objs, bg="#000000")]))


# --------------------------------------------------------------------------
# playback
# --------------------------------------------------------------------------
def gen_playback():
    def marker(label, colour):
        return [obj(label, "Rect", tf(100, 100, 300, 300), style(fill=colour))]

    scenes = [
        # Scene 0 is long, so a 2s timing test never crosses a boundary.
        scene("Long", 60000, marker("S0", "#ff0000"), bg="#000000"),
        scene("Short", 600, marker("S1", "#00ff00"), bg="#001100"),
        scene("Last", 600, marker("S2", "#0000ff"), bg="#000022"),
    ]
    write("playback", project("Playback tests", scenes, loop=False))

    # Same shape, but looping, to test the wrap-around at the end.
    loop_scenes = [
        scene("L0", 400, marker("S0", "#ff0000")),
        scene("L1", 400, marker("S1", "#00ff00")),
    ]
    return write("playback_loop", project("Playback loop", loop_scenes, loop=True))


if __name__ == "__main__":
    print("generating render-suite projects:")
    gen_lifespan()
    gen_filters()
    gen_text()
    gen_playback()
    print("done")
