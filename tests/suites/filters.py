"""Object filters: struct round-trip, keyframing, and actual rendering."""

from suites._render_util import scan


async def run(page, port, load_project):
    rt = await load_project(page, port, "filters")

    # --------------------------------------------------------- struct round-trip
    src = {o["name"]: o for s in rt.project["scenes"] for o in s["objects"]}
    res = await rt.resolve(0, 0)

    for name, key, expect in [
        ("Grayscale", "grayscale", 1.0),
        ("Brightness0", "brightness", 0.0),
        ("Sepia", "sepia", 1.0),
        ("HueRotate", "hue_rotate", 120.0),
        ("Saturate0", "saturate", 0.0),
        ("Contrast", "contrast", 3.0),
        ("Blurred", "blur", 20.0),
    ]:
        # the project file really does carry the value
        rt.near(src[name]["filters"][key], expect, 0.001,
                f"project carries filters.{key} on {name}")
        f = res[name]["filters"]
        got = f.get(key) if isinstance(f, dict) else None
        rt.near(got, expect, 0.001,
                f"resolve() preserves filters.{key} on {name}")

    ds = res["Shadowed"]["filters"]
    rt.check(isinstance(ds, dict) and isinstance(ds.get("drop_shadow"), dict),
             "resolve() preserves drop_shadow as an object",
             f"got {ds!r}")

    st = res["Stacked"]["filters"]
    rt.check(isinstance(st, dict)
             and st.get("grayscale") == 1.0
             and st.get("brightness") == 0.5
             and st.get("blur") == 2.0,
             "resolve() preserves several stacked filters at once",
             f"got {st!r}")

    # ------------------------------------------------------------- keyframing
    # The manual states filters are animatable. filters.blur goes 0 -> 10.
    mid = (await rt.resolve(0, 500))["BlurAnimated"]["filters"]
    mid_blur = mid.get("blur") if isinstance(mid, dict) else None
    rt.near(mid_blur, 5.0, 1.0, "keyframed filters.blur interpolates to ~5 at halfway")
    end = (await rt.resolve(0, 1000))["BlurAnimated"]["filters"]
    end_blur = end.get("blur") if isinstance(end, dict) else None
    rt.near(end_blur, 10.0, 0.5, "keyframed filters.blur reaches 10 at the end")

    # -------------------------------------------------------------- rendering
    await rt.seek(0, 0)
    await rt.wait(0.1)

    # Control: an unfiltered red rect must read as red.
    px = await rt.sample(200, 200)
    rt.check(px["r"] > 200 and px["g"] < 60 and px["b"] < 60,
             "control: unfiltered red rect renders red",
             f"got {px}")

    # grayscale(1) on red -> r == g == b
    px = await rt.sample(500, 200)
    spread = max(px["r"], px["g"], px["b"]) - min(px["r"], px["g"], px["b"])
    rt.check(spread < 30,
             "grayscale(1) renders a red rect as grey",
             f"channel spread {spread} in {px}")

    # brightness(0) -> near black
    px = await rt.sample(800, 200)
    rt.check(max(px["r"], px["g"], px["b"]) < 40,
             "brightness(0) renders the rect dark",
             f"got {px}")

    # sepia(1) on red -> warm, and green must lift off zero
    px = await rt.sample(1100, 200)
    rt.check(px["g"] > 30,
             "sepia(1) shifts a pure red rect towards a warm tone",
             f"got {px}")

    # hue-rotate(120deg) on red -> no longer red-dominant
    px = await rt.sample(1400, 200)
    rt.check(not (px["r"] > 200 and px["g"] < 60 and px["b"] < 60),
             "hue_rotate(120) moves a red rect off red",
             f"got {px}")

    # saturate(0) on red -> grey
    px = await rt.sample(1700, 200)
    spread = max(px["r"], px["g"], px["b"]) - min(px["r"], px["g"], px["b"])
    rt.check(spread < 30,
             "saturate(0) renders a red rect as grey",
             f"channel spread {spread} in {px}")

    # blur bleeds outside the declared bounds (rect is x 500..700, y 400..600)
    outside = await scan(rt, 470, 480, 25, 40)
    rt.check(outside["lit"] > 0,
             "blur(20) bleeds colour outside the rect bounds",
             f"no lit pixels just left of the edge: {outside}")

    # drop shadow lands offset from the rect (rect x 900..1100 y 400..600,
    # shadow offset +30/+30 in green)
    shadow = await scan(rt, 1105, 605, 25, 25)
    rt.check(shadow["lit"] > 0 and shadow["g"] > shadow["r"],
             "drop_shadow paints an offset green shadow",
             f"got {shadow}")

    # ctx.filter must be reset between objects: LeakVictim (z=1, no filters)
    # is drawn straight after LeakSource (z=0, grayscale+brightness 0.2).
    px = await rt.sample(500, 850)
    rt.check(px["r"] > 200 and px["g"] < 60 and px["b"] < 60,
             "ctx.filter does not leak onto the next object",
             f"unfiltered neighbour rendered as {px}")

    # filters:null renders the same as no filter at all
    a = await rt.sample(200, 200)      # NoFilter
    b = await rt.sample(1700, 500)     # NullFilters
    rt.check(abs(a["r"] - b["r"]) < 12 and abs(a["g"] - b["g"]) < 12
             and abs(a["b"] - b["b"]) < 12,
             "filters:null renders identically to an object with no filters",
             f"{a} vs {b}")

    errs = await rt.console_errors()
    rt.check(not errs, "no console errors", str(errs))
    return rt
