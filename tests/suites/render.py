"""Scene backgrounds and the Svg object type.

Both were missing from the shared engine: it painted only `background.fill` and
had no `case "Svg"` at all, so gradient backgrounds rendered flat and SVG logos
rendered as nothing in every HTML5 export, embed and the landing-page demo,
while looking correct in the editor.
"""
import asyncio


async def _settle(rt, ms=400):
    """Give async image/SVG decodes a chance to land and repaint."""
    await asyncio.sleep(ms / 1000)


async def run(page, port, load_project):
    rt = await load_project(page, port, "render")

    # ---------- flat fill still works ----------
    await rt.seek(0, 0)
    await _settle(rt)
    px = await rt.sample(1700, 900)          # clear of the marker rect
    rt.near(px["r"], 255, 6, "flat background paints its fill (red channel)")
    rt.near(px["g"], 0, 6, "flat background paints its fill (green channel)")
    rt.near(px["b"], 0, 6, "flat background paints its fill (blue channel)")

    px = await rt.sample(200, 200)
    rt.near(px["b"], 255, 6, "an object still paints over the background")

    # ---------- linear gradient ----------
    await rt.seek(1, 0)
    await _settle(rt)
    top = await rt.sample(960, 20)
    mid = await rt.sample(960, 540)
    bot = await rt.sample(960, 1060)

    rt.check(
        top["r"] < 40,
        "linear gradient starts near black at the top",
        f"got {top}",
    )
    rt.check(
        bot["r"] > 215,
        "linear gradient ends near white at the bottom",
        f"got {bot}",
    )
    rt.check(
        top["r"] < mid["r"] < bot["r"],
        "linear gradient increases monotonically down the stage",
        f"top={top['r']} mid={mid['r']} bottom={bot['r']}",
    )
    # The regression this guards: the engine used to ignore `gradient` entirely
    # and fall through to `fill`, which is pure red in this fixture.
    rt.check(
        not (mid["r"] > 200 and mid["g"] < 40 and mid["b"] < 40),
        "gradient is not silently replaced by the flat fill",
        f"midpoint {mid} looks like the fallback fill #ff0000",
    )
    rt.near(mid["r"], mid["g"], 8, "gradient midpoint is grey, not tinted")

    # ---------- radial gradient ----------
    await rt.seek(2, 0)
    await _settle(rt)
    centre = await rt.sample(960, 540)
    corner = await rt.sample(40, 40)
    rt.check(
        centre["r"] > 215,
        "radial gradient is light at the centre",
        f"got {centre}",
    )
    rt.check(
        corner["r"] < centre["r"] - 60,
        "radial gradient darkens towards the edge",
        f"centre={centre['r']} corner={corner['r']}",
    )

    # ---------- Svg object ----------
    await rt.seek(3, 0)
    await _settle(rt, 700)          # base64 -> Image decode is async

    inside = await rt.sample(600, 500)      # well inside the 400x400 logo
    rt.check(
        inside["g"] > 200 and inside["r"] < 60 and inside["b"] < 60,
        "an Svg object renders its markup",
        f"sampled {inside} inside the logo bounds; the engine had no case for Svg, "
        f"so this used to be the scene background",
    )

    outside = await rt.sample(100, 100)
    rt.check(
        outside["g"] < 60,
        "the Svg does not bleed outside its transform",
        f"got {outside}",
    )

    # An Svg with no content must not throw or paint garbage.
    empty = await rt.sample(1300, 400)
    rt.check(
        empty["r"] < 60 and empty["g"] < 60 and empty["b"] < 60,
        "an Svg with empty content paints nothing",
        f"got {empty}",
    )

    objs = await rt.resolve(3, 0)
    rt.equal(objs["Logo"]["type"], "Svg", "Svg survives resolution as its own type")
    rt.check(
        objs["Logo"]["content"].startswith("<svg"),
        "Svg markup survives resolution intact",
        f"got {objs['Logo']['content'][:40]!r}",
    )

    errs = await rt.console_errors()
    rt.check(not errs, "no console errors", str(errs))
    return rt
