"""Keyframe interpolation: every animatable property, plus edge cases."""


async def run(page, port, load_project):
    rt = await load_project(page, port, "keyframes")

    # --- midpoint of a linear 0 -> 1000 move ---
    o = await rt.resolve(0, 500)
    rt.near(o["MoveX"]["x"], 500, 1, "transform.x interpolates to midpoint")
    rt.near(o["MoveY"]["y"], 400, 1, "transform.y interpolates to midpoint")
    rt.near(o["Resize"]["w"], 300, 1, "transform.width interpolates")
    rt.near(o["Resize"]["h"], 200, 1, "transform.height interpolates")
    rt.near(o["Rotate"]["rotation"], 90, 1, "transform.rotation interpolates")
    rt.near(o["Fade"]["opacity"], 0.5, 0.02, "transform.opacity interpolates")
    rt.near(o["StrokeGrow"]["strokeWidth"], 10, 0.5, "style.stroke_width interpolates")
    rt.near(o["FontGrow"]["fontSize"], 50, 1, "style.font_size interpolates")

    # colour lerps channel-wise: #000000 -> #ffffff at t=0.5 is mid grey
    fill = (o["ColourShift"]["fill"] or "").lower()
    rt.check(
        fill.startswith("#") and len(fill) == 7,
        "style.fill stays a hex colour while interpolating",
        f"got {fill!r}",
    )
    try:
        r = int(fill[1:3], 16)
        rt.near(r, 128, 12, "style.fill lerps to mid grey at halfway")
    except ValueError:
        rt.check(False, "style.fill lerps to mid grey at halfway", f"unparseable: {fill!r}")

    # --- quarter point, to catch off-by-one in the segment search ---
    o = await rt.resolve(0, 250)
    rt.near(o["MoveX"]["x"], 250, 1, "transform.x correct at quarter point")

    # --- exact keyframe times ---
    o = await rt.resolve(0, 0)
    rt.near(o["MoveX"]["x"], 0, 0.01, "value exact at first keyframe")
    o = await rt.resolve(0, 1000)
    rt.near(o["MoveX"]["x"], 1000, 0.01, "value exact at last keyframe")

    # --- hold before first and after last ---
    o = await rt.resolve(0, 0)
    rt.near(o["LateStart"]["x"], 300, 0.01, "holds first value before first keyframe")
    o = await rt.resolve(0, 1900)
    rt.near(o["LateStart"]["x"], 900, 0.01, "holds last value after last keyframe")
    o = await rt.resolve(0, 1500)
    rt.near(o["MoveX"]["x"], 1000, 0.01, "holds last value past the end")

    # --- bool snaps, never blends ---
    for t, expect in ((100, True), (600, False), (950, True)):
        o = await rt.resolve(0, t)
        rt.equal(o["Blink"]["visible"], expect, f"visible snaps correctly at {t}ms")

    # --- single keyframe is a constant ---
    for t in (0, 700, 1900):
        o = await rt.resolve(0, t)
        rt.near(o["SingleKf"]["opacity"], 0.25, 0.01,
                f"single keyframe holds its value at {t}ms")

    # --- an object with no keyframes never moves ---
    for t in (0, 500, 1999):
        o = await rt.resolve(0, t)
        rt.near(o["Static"]["x"], 700, 0.01, f"static object keeps x at {t}ms")
        rt.near(o["Static"]["w"], 120, 0.01, f"static object keeps width at {t}ms")

    # --- resolving must not mutate the source project ---
    await rt.resolve(0, 900)
    o = await rt.resolve(0, 0)
    rt.near(o["MoveX"]["x"], 0, 0.01, "resolving at a later time does not mutate source")

    errs = await rt.console_errors()
    rt.check(not errs, "no console errors", str(errs))
    return rt
