#!/usr/bin/env python3
"""
Generates the interaction test projects:
  events.citcat, waitpoints.citcat, transitions.citcat, transitions_loop.citcat

Every cross-reference (event scene_id / object_id, wait point object_id) is
validated against ids that actually exist before the file is written.

Run:  python3 tests/projects/_gen_interaction.py
"""
import json
import pathlib
import sys
import uuid

OUT = pathlib.Path(__file__).resolve().parent


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


def obj(oid, name, typ, transform, st=None, content="", z=0, visible=True, events=None):
    return {
        "id": oid, "name": name, "object_type": typ, "transform": transform,
        "style": st or style(), "content": content, "z_index": z,
        "visible": visible, "locked": False, "keyframes": [],
        "events": events or [], "data_bindings": [],
    }


def ev(trigger, action):
    return {"id": uid(), "trigger": trigger, "action": action}


# --- triggers ---
CLICK = {"type": "Click"}
HOVER_IN = {"type": "HoverEnter"}
HOVER_OUT = {"type": "HoverLeave"}
SCENE_END = {"type": "SceneEnd"}


def timer(delay_ms):
    return {"type": "Timer", "delay_ms": int(delay_ms)}


# --- actions ---
def goto(scene_id):
    return {"type": "GotoScene", "scene_id": scene_id}


def toggle(object_id):
    return {"type": "ToggleVisible", "object_id": object_id}


def set_fill(object_id, colour):
    return {"type": "SetProperty", "object_id": object_id,
            "property": "style.fill", "value": {"type": "Color", "value": colour}}


def scene(sid, name, duration_ms, objects, order, bg="#101018",
          wait_points=None, t_in=None, t_out=None):
    return {
        "id": sid, "name": name, "duration_ms": int(duration_ms),
        "background": {"fill": bg}, "objects": objects,
        "transition_in": t_in, "transition_out": t_out,
        "sort_order": order, "wait_points": wait_points or [],
    }


def transition(kind, duration_ms):
    return {"kind": kind, "duration_ms": int(duration_ms)}


def project(name, scenes, loop=False):
    return {
        "version": "1.0",
        "meta": {"name": name, "width": 1920, "height": 1080, "fps": 30,
                 "created": "2026-09-25T00:00:00Z", "modified": "2026-09-25T00:00:00Z"},
        "scenes": scenes, "effects_library": [], "data_source": None,
        "export_settings": {"format": "Html", "single_file": True,
                            "autoplay": False, "loop_playback": bool(loop)},
    }


# ===================================================================== events

def build_events():
    sA, sB, sC, sD = uid(), uid(), uid(), uid()

    # --- ids referenced by actions ---
    hidden_target = uid()
    colour_target = uid()
    hover_enter_flag = uid()
    hover_leave_flag = uid()
    hover_toggle_target = uid()
    z_result = uid()
    hotspot_result = uid()
    invisible_result = uid()
    res_tl, res_tr, res_bl, res_br = uid(), uid(), uid(), uid()
    timer_flag = uid()
    timer_toggle_target = uid()

    dim = style(fill="#111111")

    scene_a_objects = [
        # Click -> GotoScene
        obj(uid(), "NavButton", "Rect", tf(160, 140, 200, 100),
            events=[ev(CLICK, goto(sB))]),

        # Click -> ToggleVisible
        obj(hidden_target, "HiddenTarget", "Rect", tf(400, 100, 200, 100),
            st=style(fill="#22c55e"), visible=False),
        obj(uid(), "ToggleBtn", "Rect", tf(700, 100, 200, 100),
            events=[ev(CLICK, toggle(hidden_target))]),

        # Click -> SetProperty
        obj(colour_target, "ColourTarget", "Rect", tf(1000, 100, 200, 100), st=dim),
        obj(uid(), "ColourBtn", "Rect", tf(1300, 100, 200, 100),
            events=[ev(CLICK, set_fill(colour_target, "#ff0000"))]),

        # Hover
        obj(uid(), "HoverZone", "Rect", tf(100, 300, 300, 200), events=[
            ev(HOVER_IN, set_fill(hover_enter_flag, "#00ff00")),
            ev(HOVER_IN, toggle(hover_toggle_target)),
            ev(HOVER_OUT, set_fill(hover_leave_flag, "#0000ff")),
        ]),
        obj(hover_enter_flag, "HoverEnterFlag", "Rect", tf(500, 300, 100, 100), st=dim),
        obj(hover_leave_flag, "HoverLeaveFlag", "Rect", tf(650, 300, 100, 100), st=dim),
        obj(hover_toggle_target, "HoverToggleTarget", "Rect",
            tf(800, 300, 100, 100), st=style(fill="#22c55e"), visible=False),

        # corner objects — CSS-scaling regression coverage
        obj(uid(), "CornerTL", "Rect", tf(0, 0, 120, 120),
            events=[ev(CLICK, set_fill(res_tl, "#00ff00"))]),
        obj(uid(), "CornerTR", "Rect", tf(1800, 0, 120, 120),
            events=[ev(CLICK, set_fill(res_tr, "#00ff00"))]),
        obj(uid(), "CornerBL", "Rect", tf(0, 960, 120, 120),
            events=[ev(CLICK, set_fill(res_bl, "#00ff00"))]),
        obj(uid(), "CornerBR", "Rect", tf(1800, 960, 120, 120),
            events=[ev(CLICK, set_fill(res_br, "#00ff00"))]),
        obj(res_tl, "ResTL", "Rect", tf(1400, 300, 60, 60), st=dim),
        obj(res_tr, "ResTR", "Rect", tf(1480, 300, 60, 60), st=dim),
        obj(res_bl, "ResBL", "Rect", tf(1560, 300, 60, 60), st=dim),
        obj(res_br, "ResBR", "Rect", tf(1640, 300, 60, 60), st=dim),

        # z-order: identical rects, different z. Top must win.
        obj(uid(), "BottomOverlap", "Rect", tf(100, 620, 300, 160), z=1,
            st=style(fill="#7f1d1d"),
            events=[ev(CLICK, set_fill(z_result, "#ff0000"))]),
        obj(uid(), "TopOverlap", "Rect", tf(100, 620, 300, 160), z=5,
            st=style(fill="#166534"),
            events=[ev(CLICK, set_fill(z_result, "#00ff00"))]),
        obj(z_result, "ZResult", "Rect", tf(450, 620, 100, 100), st=dim),

        # visible hotspot: not drawn, still clickable
        obj(uid(), "VisibleHotspot", "Hotspot", tf(600, 620, 200, 160),
            events=[ev(CLICK, set_fill(hotspot_result, "#00ff00"))]),
        obj(hotspot_result, "HotspotResult", "Rect", tf(850, 620, 100, 100), st=dim),

        # invisible object must not receive clicks
        obj(uid(), "InvisibleBtn", "Rect", tf(1000, 620, 200, 160), visible=False,
            events=[ev(CLICK, set_fill(invisible_result, "#ff0000"))]),
        obj(invisible_result, "InvisibleResult", "Rect", tf(1250, 620, 100, 100), st=dim),

        # timers
        obj(uid(), "TimerSource", "Rect", tf(1450, 620, 100, 100),
            events=[ev(timer(600), set_fill(timer_flag, "#00ff00"))]),
        obj(timer_flag, "TimerFlag", "Rect", tf(1600, 620, 100, 100), st=dim),
        obj(uid(), "TimerToggleSrc", "Rect", tf(1450, 800, 100, 100),
            events=[ev(timer(600), toggle(timer_toggle_target))]),
        obj(timer_toggle_target, "TimerToggleTarget", "Rect", tf(1600, 800, 100, 100),
            st=style(fill="#22c55e"), visible=False),
    ]

    scene_b_objects = [
        obj(uid(), "BLabel", "Text", tf(100, 100, 800, 100),
            st=style(fill="#ffffff", font_size=48.0), content="Scene B"),
    ]

    # Scene C: SceneEnd trigger, with an outgoing transition so we can watch
    # whether the trigger re-fires every frame while the transition holds.
    end_toggle_target = uid()
    end_flag = uid()
    scene_c_objects = [
        obj(uid(), "EndToggleSrc", "Rect", tf(100, 100, 100, 100),
            events=[ev(SCENE_END, toggle(end_toggle_target))]),
        obj(end_toggle_target, "EndToggleTarget", "Rect", tf(300, 100, 100, 100),
            st=style(fill="#22c55e"), visible=False),
        obj(uid(), "EndFlagSrc", "Rect", tf(500, 100, 100, 100),
            events=[ev(SCENE_END, set_fill(end_flag, "#00ff00"))]),
        obj(end_flag, "EndFlag", "Rect", tf(700, 100, 100, 100), st=dim),
    ]

    scene_d_objects = [
        obj(uid(), "DLabel", "Text", tf(100, 100, 800, 100),
            st=style(fill="#ffffff", font_size=48.0), content="Scene D"),
    ]

    return project("Event tests", [
        scene(sA, "Events", 4000, scene_a_objects, 0),
        scene(sB, "Target", 3000, scene_b_objects, 1),
        scene(sC, "SceneEnd", 500, scene_c_objects, 2,
              t_out=transition("Crossfade", 600)),
        scene(sD, "After", 2000, scene_d_objects, 3),
    ])


# ================================================================= waitpoints

def build_waitpoints():
    s_timer, s_any, s_click, s_cot = uid(), uid(), uid(), uid()
    s_goto, s_land, s_two, s_zero = uid(), uid(), uid(), uid()

    def label(text):
        return [obj(uid(), "Label", "Text", tf(100, 100, 1000, 100),
                    st=style(fill="#ffffff", font_size=44.0), content=text)]

    target_id = uid()
    decoy_id = uid()
    click_objects = [
        obj(target_id, "Target", "Rect", tf(200, 200, 300, 200),
            st=style(fill="#22c55e")),
        obj(decoy_id, "Decoy", "Rect", tf(900, 200, 300, 200),
            st=style(fill="#7f1d1d")),
    ]

    nav_id = uid()
    goto_objects = [
        obj(nav_id, "NavBtn", "Rect", tf(400, 400, 400, 200),
            st=style(fill="#3b82f6"), events=[ev(CLICK, goto(s_land))]),
    ]

    wp_timer = {"id": uid(), "time_ms": 300,
                "resume_on": {"type": "Timer", "delay_ms": 800}}
    wp_any = {"id": uid(), "time_ms": 300, "resume_on": {"type": "AnyClick"}}
    wp_click = {"id": uid(), "time_ms": 300,
                "resume_on": {"type": "Click", "object_id": target_id}}
    wp_cot = {"id": uid(), "time_ms": 300,
              "resume_on": {"type": "ClickOrTimer", "object_id": None,
                            "delay_ms": 2500}}
    wp_goto = {"id": uid(), "time_ms": 300,
               "resume_on": {"type": "Click", "object_id": nav_id}}
    # deliberately declared out of time order — must still fire in time order
    wp_two_late = {"id": uid(), "time_ms": 1400, "resume_on": {"type": "AnyClick"}}
    wp_two_early = {"id": uid(), "time_ms": 300, "resume_on": {"type": "AnyClick"}}
    wp_zero = {"id": uid(), "time_ms": 0,
               "resume_on": {"type": "Timer", "delay_ms": 600}}

    return project("Wait point tests", [
        scene(s_timer, "Timer", 5000, label("Timer"), 0, wait_points=[wp_timer]),
        scene(s_any, "AnyClick", 5000, label("AnyClick"), 1, wait_points=[wp_any]),
        scene(s_click, "ClickTarget", 5000, click_objects, 2, wait_points=[wp_click]),
        scene(s_cot, "ClickOrTimer", 6000, label("ClickOrTimer"), 3, wait_points=[wp_cot]),
        scene(s_goto, "GotoOnResume", 5000, goto_objects, 4, wait_points=[wp_goto]),
        scene(s_land, "Landing", 9000, label("Landing"), 5),
        scene(s_two, "TwoWaits", 6000, label("TwoWaits"), 6,
              wait_points=[wp_two_late, wp_two_early]),
        scene(s_zero, "WaitAtZero", 4000, label("WaitAtZero"), 7, wait_points=[wp_zero]),
    ])


# ================================================================ transitions

def build_transitions():
    specs = [
        ("Cut",         500, "#202020", transition("Cut", 400)),
        ("Crossfade",   500, "#ff0000", transition("Crossfade", 700)),
        ("WipeLeft",    400, "#0000ff", transition("WipeLeft", 500)),
        ("WipeRight",   400, "#00ff00", transition("WipeRight", 500)),
        ("SlideLeft",   400, "#ffff00", transition("SlideLeft", 500)),
        ("SlideRight",  400, "#ff00ff", transition("SlideRight", 500)),
        ("Last",        600, "#00ffff", None),
    ]
    scenes = []
    for i, (name, dur, bg, t_out) in enumerate(specs):
        objs = [obj(uid(), "Label", "Text", tf(800, 500, 400, 100),
                    st=style(fill="#ffffff", font_size=40.0), content=name)]
        # scene 1 also declares a transition_in, to see whether it is honoured
        t_in = transition("Crossfade", 400) if i == 1 else None
        scenes.append(scene(uid(), name, dur, objs, i, bg=bg, t_in=t_in, t_out=t_out))
    return project("Transition tests", scenes)


def build_transitions_loop():
    scenes = []
    for i, (name, bg) in enumerate([("LoopA", "#111133"), ("LoopB", "#331111")]):
        objs = [obj(uid(), "Label", "Text", tf(800, 500, 400, 100),
                    st=style(fill="#ffffff", font_size=40.0), content=name)]
        scenes.append(scene(uid(), name, 400, objs, i, bg=bg))
    return project("Transition loop test", scenes, loop=True)


# =================================================================== validate

def validate(name, proj):
    """Every referenced scene/object id must exist. Returns list of problems."""
    problems = []
    scene_ids = {s["id"] for s in proj["scenes"]}

    for s in proj["scenes"]:
        obj_ids = {o["id"] for o in s["objects"]}
        names = [o["name"] for o in s["objects"]]
        if len(names) != len(set(names)):
            dupes = {n for n in names if names.count(n) > 1}
            problems.append(f"{name}/{s['name']}: duplicate object names {sorted(dupes)}")

        for o in s["objects"]:
            for e in o["events"]:
                a = e["action"]
                if a["type"] == "GotoScene" and a["scene_id"] not in scene_ids:
                    problems.append(f"{name}/{s['name']}/{o['name']}: GotoScene -> unknown scene")
                if a["type"] in ("ToggleVisible", "SetProperty") and a["object_id"] not in obj_ids:
                    problems.append(
                        f"{name}/{s['name']}/{o['name']}: {a['type']} -> unknown object")

        for wp in s["wait_points"]:
            r = wp["resume_on"]
            oid = r.get("object_id")
            if r["type"] == "Click" and oid not in obj_ids:
                problems.append(f"{name}/{s['name']}: wait point Click -> unknown object")
            if r["type"] == "ClickOrTimer" and oid is not None and oid not in obj_ids:
                problems.append(f"{name}/{s['name']}: wait point ClickOrTimer -> unknown object")
    return problems


def main():
    builds = {
        "events": build_events(),
        "waitpoints": build_waitpoints(),
        "transitions": build_transitions(),
        "transitions_loop": build_transitions_loop(),
    }
    all_problems = []
    for name, proj in builds.items():
        all_problems += validate(name, proj)

    if all_problems:
        print("VALIDATION FAILED:")
        for p in all_problems:
            print("  -", p)
        return 1

    for name, proj in builds.items():
        path = OUT / f"{name}.citcat"
        path.write_text(json.dumps(proj, indent=2))
        n_obj = sum(len(s["objects"]) for s in proj["scenes"])
        n_wp = sum(len(s["wait_points"]) for s in proj["scenes"])
        n_ev = sum(len(o["events"]) for s in proj["scenes"] for o in s["objects"])
        print(f"wrote {path.name:<26} {len(proj['scenes'])} scenes, "
              f"{n_obj} objects, {n_ev} events, {n_wp} wait points")
    return 0


if __name__ == "__main__":
    sys.exit(main())
