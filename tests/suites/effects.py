"""Effects.

Built-in effects live in Rust and are applied by *copying keyframes* onto an
object, so the browser runtime never sees an "effect" — only the resulting
keyframes. This suite therefore splits in three:

  1. behaviour  - objects carrying the keyframes each effect is meant to
                  produce, checked against the intended visual result
  2. library    - the Rust effect definitions, checked for definitions whose
                  values the resolver cannot tell apart
  3. plugins    - effects/custom/*.json, checked for shape and for property
                  paths / value ranges the runtime can actually act on
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

# The properties resolveObjectAtTime() actually reads (src/js/runtime.js).
# A keyframe on anything else is silently ignored by the engine.
KNOWN_PROPS = {
    "transform.x", "transform.y", "transform.width", "transform.height",
    "transform.rotation", "transform.opacity",
    "style.fill", "style.stroke", "style.stroke_width",
    "style.font_size", "style.border_radius",
    "visible", "_typewriter_progress", "_path_progress", "audio_volume",
}
EASINGS = {"Linear", "EaseIn", "EaseOut", "EaseInOut"}
CATEGORIES = {"Entrance", "Exit", "Emphasis", "Motion"}
OBJECT_TYPES = {"Text", "Rect", "Ellipse", "Image", "Video", "Audio",
                "Button", "Hotspot", "Svg"}

# Number/Color/Bool survive into a .citcat project. Offset and Scale are
# template-only: they are resolved against the target object when an effect is
# applied and emitted as Number, so the browser runtime never sees them.
RUNTIME_VALUE_KINDS = {"Number", "Color", "Bool"}
TEMPLATE_VALUE_KINDS = {"Offset", "Scale"}
VALUE_KINDS = RUNTIME_VALUE_KINDS | TEMPLATE_VALUE_KINDS


def _is_oscillation(kfs):
    """True if the keyframe values swing either side of zero and return to it.

    That shape means 'wobble around wherever I am', which only reads correctly
    as a relative offset.
    """
    vals = [
        k["value"]["value"] for k in kfs
        if isinstance(k.get("value"), dict)
        and isinstance(k["value"].get("value"), (int, float))
    ]
    if len(vals) < 3:
        return False
    return min(vals) < 0 < max(vals) and abs(vals[0]) < 1e-9 and abs(vals[-1]) < 1e-9


def parse_rust_effects():
    """Pull the built-in effect definitions out of commands/effect.rs.

    Returns {effect_id: [(time_ms, property, number_literal_or_None, easing)]}.
    """
    src = (ROOT / "src-tauri" / "src" / "commands" / "effect.rs").read_text()
    body = src.split("fn build_effects_library()", 1)[-1].split("\nfn load_plugin_effects", 1)[0]

    effects = {}
    blocks = re.split(r'id:\s*"([a-z0-9-]+)"\.to_string\(\)', body)
    # blocks = [preamble, id1, chunk1, id2, chunk2, ...]
    for i in range(1, len(blocks) - 1, 2):
        eid, chunk = blocks[i], blocks[i + 1]
        kfs = []
        for m in re.finditer(
            r'Keyframe::new\(\s*(\d+)\s*,\s*"([^"]+)"\s*,\s*'
            r'KeyframeValue::(\w+)\(([^)]*)\)\s*,\s*Easing::(\w+)',
            chunk,
        ):
            t, prop, kind, raw, easing = m.groups()
            num = None
            if kind == "Number":
                try:
                    num = float(raw.strip())
                except ValueError:
                    num = None
            kfs.append((int(t), prop, num, easing))
        if kfs:
            effects[eid] = kfs
    return effects


async def run(page, port, load_project):
    rt = await load_project(page, port, "effects")

    # ============================ 1. behaviour ============================

    # --- Fade In: 0 -> 1, strictly increasing ---
    rt.near((await rt.resolve(0, 0))["FadeIn"]["opacity"], 0.0, 0.001,
            "Fade In starts fully transparent")
    rt.near((await rt.resolve(0, 500))["FadeIn"]["opacity"], 1.0, 0.001,
            "Fade In ends fully opaque")
    prev, ok = -1.0, True
    for t in range(0, 501, 50):
        v = (await rt.resolve(0, t))["FadeIn"]["opacity"]
        if v <= prev:
            ok = False
        prev = v
    rt.check(ok, "Fade In opacity increases at every step")
    rt.near((await rt.resolve(0, 900))["FadeIn"]["opacity"], 1.0, 0.001,
            "Fade In stays opaque after it finishes")

    # --- Fade Out: 1 -> 0, strictly decreasing ---
    rt.near((await rt.resolve(0, 0))["FadeOut"]["opacity"], 1.0, 0.001,
            "Fade Out starts fully opaque")
    rt.near((await rt.resolve(0, 500))["FadeOut"]["opacity"], 0.0, 0.001,
            "Fade Out ends fully transparent")
    prev, ok = 2.0, True
    for t in range(0, 501, 50):
        v = (await rt.resolve(0, t))["FadeOut"]["opacity"]
        if v >= prev:
            ok = False
        prev = v
    rt.check(ok, "Fade Out opacity decreases at every step")

    # --- Slide In Left: enters from off-stage, lands on its resting x ---
    o = await rt.resolve(0, 0)
    rt.check(o["SlideInLeft"]["x"] < 0,
             "Slide In Left starts off the left edge of the stage",
             f"x was {o['SlideInLeft']['x']}")
    rt.near(o["SlideInLeft"]["opacity"], 0.0, 0.001,
            "Slide In Left starts transparent")
    rt.near((await rt.resolve(0, 100))["SlideInLeft"]["opacity"], 1.0, 0.001,
            "Slide In Left is fully visible after 100ms")
    rt.near((await rt.resolve(0, 600))["SlideInLeft"]["x"], 800, 0.5,
            "Slide In Left settles on its resting x")
    # and it approaches from the left, never overshoots past the target
    overshoot = None
    for t in range(0, 601, 50):
        x = (await rt.resolve(0, t))["SlideInLeft"]["x"]
        if x > 800.5:
            overshoot = (t, x)
    rt.check(overshoot is None, "Slide In Left never overshoots its target x",
             "" if overshoot is None else f"x={overshoot[1]:.1f} at {overshoot[0]}ms")

    # --- Scale Up: 0x0 -> full size, opacity leads the growth ---
    o = await rt.resolve(0, 0)
    rt.near(o["ScaleUp"]["w"], 0.0, 0.001, "Scale Up starts at zero width")
    rt.near(o["ScaleUp"]["h"], 0.0, 0.001, "Scale Up starts at zero height")
    o = await rt.resolve(0, 500)
    rt.near(o["ScaleUp"]["w"], 200.0, 0.001, "Scale Up reaches its target width")
    rt.near(o["ScaleUp"]["h"], 150.0, 0.001, "Scale Up reaches its target height")
    o = await rt.resolve(0, 150)
    rt.near(o["ScaleUp"]["opacity"], 1.0, 0.001,
            "Scale Up is fully opaque by 150ms, before it finishes growing")
    rt.check(0 < o["ScaleUp"]["w"] < 200,
             "Scale Up is still mid-growth when it becomes opaque",
             f"width was {o['ScaleUp']['w']:.1f}")
    # aspect ratio holds throughout the growth
    bad = None
    for t in range(50, 501, 50):
        o = await rt.resolve(0, t)
        if o["ScaleUp"]["h"] > 0:
            ratio = o["ScaleUp"]["w"] / o["ScaleUp"]["h"]
            if abs(ratio - 200 / 150) > 0.01:
                bad = (t, ratio)
    rt.check(bad is None, "Scale Up keeps its aspect ratio while growing",
             "" if bad is None else f"ratio {bad[1]:.3f} at {bad[0]}ms")

    # --- Scale Down: full size -> 0x0 ---
    o = await rt.resolve(0, 0)
    rt.near(o["ScaleDown"]["w"], 200.0, 0.001, "Scale Down starts at full width")
    o = await rt.resolve(0, 500)
    rt.near(o["ScaleDown"]["w"], 0.0, 0.001, "Scale Down shrinks to zero width")
    rt.near(o["ScaleDown"]["h"], 0.0, 0.001, "Scale Down shrinks to zero height")
    rt.near(o["ScaleDown"]["opacity"], 0.0, 0.001, "Scale Down fades out as it shrinks")

    # --- Pulse: dips and returns to where it started ---
    start = (await rt.resolve(0, 0))["Pulse"]["opacity"]
    dip = (await rt.resolve(0, 400))["Pulse"]["opacity"]
    end = (await rt.resolve(0, 800))["Pulse"]["opacity"]
    rt.near(start, 1.0, 0.001, "Pulse starts at full opacity")
    rt.near(dip, 0.5, 0.001, "Pulse dips to half opacity at the midpoint")
    rt.near(end, start, 0.001, "Pulse returns to its starting opacity (round trip)")
    mid = (await rt.resolve(0, 200))["Pulse"]["opacity"]
    rt.check(0.5 < mid < 1.0, "Pulse passes through intermediate values on the way down",
             f"opacity at 200ms was {mid:.3f}")

    # --- Spin: full turn, half way round at the midpoint ---
    rt.near((await rt.resolve(0, 0))["Spin"]["rotation"], 0.0, 0.001,
            "Spin starts at 0 degrees")
    rt.near((await rt.resolve(0, 500))["Spin"]["rotation"], 180.0, 0.5,
            "Spin passes through 180 degrees at the midpoint")
    rt.near((await rt.resolve(0, 1000))["Spin"]["rotation"], 360.0, 0.001,
            "Spin completes a full 360 degree turn")
    # linear easing means constant angular speed
    steps = []
    prev = None
    for t in range(0, 1001, 100):
        r = (await rt.resolve(0, t))["Spin"]["rotation"]
        if prev is not None:
            steps.append(r - prev)
        prev = r
    rt.check(max(steps) - min(steps) < 0.5,
             "Spin turns at a constant rate (Linear easing)",
             f"steps ranged {min(steps):.2f}..{max(steps):.2f} degrees")

    # --- Float: drifts up and settles back ---
    rt.near((await rt.resolve(0, 0))["Float"]["y"], 400.0, 0.001,
            "Float starts at its resting y")
    rt.near((await rt.resolve(0, 1000))["Float"]["y"], 380.0, 0.001,
            "Float rises 20px at the midpoint")
    rt.near((await rt.resolve(0, 2000))["Float"]["y"], 400.0, 0.001,
            "Float returns to its resting y (round trip)")
    ys = [(await rt.resolve(0, t))["Float"]["y"] for t in range(0, 2001, 100)]
    rt.check(min(ys) >= 380 - 0.01 and max(ys) <= 400 + 0.01,
             "Float stays within its intended 20px travel",
             f"y ranged {min(ys):.2f}..{max(ys):.2f}")

    # --- Bounce: two hops, both landing back on the baseline ---
    rt.near((await rt.resolve(0, 0))["Bounce"]["y"], 400.0, 0.001,
            "Bounce starts on the baseline")
    rt.near((await rt.resolve(0, 250))["Bounce"]["y"], 360.0, 0.001,
            "Bounce reaches the top of its first hop")
    rt.near((await rt.resolve(0, 500))["Bounce"]["y"], 400.0, 0.001,
            "Bounce lands back on the baseline between hops")
    rt.near((await rt.resolve(0, 700))["Bounce"]["y"], 385.0, 0.001,
            "Bounce's second hop is lower than the first")
    rt.near((await rt.resolve(0, 1000))["Bounce"]["y"], 400.0, 0.001,
            "Bounce settles on the baseline")

    # --- Typewriter: progress exposed to the renderer ---
    rt.near((await rt.resolve(0, 0))["Typewriter"]["typewriter"], 0.0, 0.001,
            "Typewriter starts with no characters revealed")
    rt.near((await rt.resolve(0, 750))["Typewriter"]["typewriter"], 0.5, 0.005,
            "Typewriter is half revealed at the halfway point")
    rt.near((await rt.resolve(0, 1500))["Typewriter"]["typewriter"], 1.0, 0.001,
            "Typewriter reveals everything by the end")
    o = await rt.resolve(0, 750)
    rt.check(o["Typewriter"]["content"] == "The quick brown fox jumps",
             "Typewriter leaves the source content intact (reveal is a render concern)",
             f"content was {o['Typewriter']['content']!r}")
    prev, ok = -1.0, True
    for t in range(0, 1501, 150):
        v = (await rt.resolve(0, t))["Typewriter"]["typewriter"]
        if v < prev:
            ok = False
        prev = v
    rt.check(ok, "Typewriter progress never goes backwards")

    # --- effects must not leak between objects ---
    o = await rt.resolve(0, 400)
    rt.near(o["Spin"]["opacity"], 1.0, 0.001,
            "an opacity effect on one object does not touch another")
    rt.near(o["FadeIn"]["rotation"], 0.0, 0.001,
            "a rotation effect on one object does not touch another")

    # ============================= 2. library =============================

    lib = parse_rust_effects()
    rt.check(len(lib) >= 15, "the built-in effect library parses",
             f"found {len(lib)} effects: {sorted(lib)}")

    for eid, kfs in sorted(lib.items()):
        props = {p for _, p, _, _ in kfs}
        unknown = props - KNOWN_PROPS
        rt.check(not unknown, f"built-in '{eid}' only animates properties the runtime reads",
                 f"runtime ignores: {sorted(unknown)}")
        bad_easings = {e for _, _, _, e in kfs} - EASINGS
        rt.check(not bad_easings, f"built-in '{eid}' uses valid easings",
                 f"unknown: {sorted(bad_easings)}")

    # An effect that animates a property must give the resolver two values it
    # can tell apart. resolve_effect_value() branches on the literal template
    # value, so two identical literals collapse to one resolved value and the
    # property never changes.
    for eid, kfs in sorted(lib.items()):
        by_prop = {}
        for t, prop, num, _ in kfs:
            if num is not None:
                by_prop.setdefault(prop, []).append((t, num))
        for prop, entries in sorted(by_prop.items()):
            if len(entries) < 2:
                continue
            values = {v for _, v in entries}
            rt.check(
                len(values) > 1,
                f"built-in '{eid}' gives the resolver distinguishable {prop} values",
                f"all {len(entries)} keyframes use {values.pop()}, so "
                f"resolve_effect_value() cannot tell start from end",
            )

    # ============================= 3. plugins =============================

    plugin_dir = ROOT / "effects" / "custom"
    files = sorted(plugin_dir.glob("*.json"))
    rt.check(bool(files), "custom effect plugins are present",
             f"looked in {plugin_dir}")

    for f in files:
        try:
            data = json.loads(f.read_text())
        except json.JSONDecodeError as e:
            rt.check(False, f"plugin {f.name} is valid JSON", str(e))
            continue
        rt.check(True, f"plugin {f.name} is valid JSON")

        missing = {"id", "name", "category", "duration_ms",
                   "keyframes", "applies_to"} - set(data)
        rt.check(not missing, f"plugin {f.name} has every EffectPreset field",
                 f"missing: {sorted(missing)}")

        rt.check(data.get("category") in CATEGORIES,
                 f"plugin {f.name} declares a valid category",
                 f"got {data.get('category')!r}, expected one of {sorted(CATEGORIES)}")

        bad_types = set(data.get("applies_to", [])) - OBJECT_TYPES
        rt.check(not bad_types, f"plugin {f.name} targets real object types",
                 f"unknown: {sorted(bad_types)}")

        kfs = data.get("keyframes", [])
        rt.check(bool(kfs), f"plugin {f.name} defines keyframes")

        for k in kfs:
            shape = {"id", "time_ms", "property", "value", "easing"} - set(k)
            if shape:
                rt.check(False, f"plugin {f.name} keyframe {k.get('id')} has every field",
                         f"missing: {sorted(shape)}")
                continue
            rt.check(k["property"] in KNOWN_PROPS,
                     f"plugin {f.name} keyframe {k['id']} animates a property the runtime reads",
                     f"'{k['property']}' is not in the resolver's property list, "
                     f"so this keyframe does nothing")
            rt.check(k["easing"] in EASINGS,
                     f"plugin {f.name} keyframe {k['id']} uses a valid easing",
                     f"got {k['easing']!r}")
            val = k.get("value", {})
            rt.check(isinstance(val, dict) and val.get("type") in VALUE_KINDS,
                     f"plugin {f.name} keyframe {k['id']} uses a tagged value",
                     f"got {val!r}, expected type in {sorted(VALUE_KINDS)}")

        # Positional keyframes must be relative. An absolute transform.x teleports
        # any object that is not already at that coordinate -- the bug that made
        # shake.json snap an object at x=800 to the stage origin.
        pos_kfs = [k for k in kfs if k.get("property") in ("transform.x", "transform.y")]
        absolute_pos = [
            k for k in pos_kfs
            if isinstance(k.get("value"), dict) and k["value"].get("type") == "Number"
        ]
        if pos_kfs:
            rt.check(
                not absolute_pos,
                f"plugin {f.name} expresses its positional motion relatively",
                f"keyframes {[k['id'] for k in absolute_pos]} set "
                f"{(absolute_pos or pos_kfs)[0]['property']} as an absolute Number; "
                f"an oscillation around the object's own position needs Offset",
            )

        # Rotation has the same absolute-vs-relative trap: an absolute 0 snaps a
        # pre-rotated object upright before the effect starts.
        rot_kfs = [k for k in kfs if k.get("property") == "transform.rotation"]
        absolute_rot = [
            k for k in rot_kfs
            if isinstance(k.get("value"), dict) and k["value"].get("type") == "Number"
        ]
        if rot_kfs and _is_oscillation(rot_kfs):
            rt.check(
                not absolute_rot,
                f"plugin {f.name} expresses its rotation oscillation relatively",
                f"keyframes {[k['id'] for k in absolute_rot]} use an absolute Number, "
                f"which snaps a pre-rotated object to that angle first",
            )

        # Size: a value under 10 as an absolute pixel count renders sub-pixel.
        # It almost certainly meant a scale multiplier.
        size_kfs = [
            k for k in kfs
            if k.get("property") in ("transform.width", "transform.height")
            and isinstance(k.get("value"), dict)
            and isinstance(k["value"].get("value"), (int, float))
        ]
        tiny = [
            k for k in size_kfs
            if k["value"].get("type") == "Number" and 0 < k["value"]["value"] < 10
        ]
        if size_kfs:
            rt.check(
                not tiny,
                f"plugin {f.name} does not mistake scale multipliers for pixel sizes",
                f"keyframes {[k['id'] for k in tiny]} set "
                f"{(tiny or size_kfs)[0]['property']} to an absolute "
                f"{(tiny or size_kfs)[0]['value']['value']}px; a multiplier needs Scale",
            )

    errs = await rt.console_errors()
    rt.check(not errs, "no console errors", str(errs))
    return rt
