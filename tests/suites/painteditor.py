"""The Solid / Linear / Radial paint control (D7 section 5).

Scope note: this drives `src/js/paint-editor.js` in its own page fixture.
`src/js/properties.js` is NOT reachable from the harness -- it depends on
CitCatApp (Tauri invoke), CitCatMath and the whole index.html tree, so stubbing
it would test the stub. What lives in properties.js is wiring: reading a style
into a control and posting the result back. The logic worth proving -- the
alpha split/join, mode switching, stop editing -- lives here.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
TESTS = ROOT / "tests"


async def _page(page, port):
    """Serve paint-editor.js beside runtime.js and open the fixture."""
    (TESTS / "paint-editor.js").write_bytes(
        (ROOT / "src" / "js" / "paint-editor.js").read_bytes()
    )
    await page.goto(f"http://127.0.0.1:{port}/editor-page.html", wait_until="load")


async def run(page, port, load_project):
    # The harness's Runtime wrapper wants a loaded project; this suite drives a
    # different page, so borrow just its assertion helpers.
    rt = await load_project(page, port, "keyframes")
    await _page(page, port)

    ev = page.evaluate

    # ---------- alpha split / join round-trips ----------
    for src, hex_, alpha in [
        ("#ff0000", "#ff0000", 100),
        ("#ff000080", "#ff0000", 50),
        ("#f00", "#ff0000", 100),
        ("#ffffff00", "#ffffff", 0),
    ]:
        got = await ev("s => window.__helpers(s)", src)
        rt.equal(got["hex"], hex_, f"splitColor({src}) keeps the six-digit hex")
        rt.near(got["alpha"], alpha, 1, f"splitColor({src}) reads alpha as a percentage")

    # "transparent" is the Hotspot default fill and is not hex. It must degrade
    # to fully transparent, not to opaque black.
    got = await ev("() => window.__helpers('transparent')")
    rt.equal(got["alpha"], 0, "splitColor('transparent') reads as fully transparent")

    rt.equal(await ev("() => window.__join('#ff0000', 100)"), "#ff0000",
             "joinColor drops the alpha byte when fully opaque")
    rt.equal(await ev("() => window.__join('#ff0000', 50)"), "#ff000080",
             "joinColor appends the alpha byte otherwise")
    rt.equal(await ev("() => window.__join('#ff0000', 0)"), "#ff000000",
             "joinColor encodes zero alpha")

    # ---------- preview strip ----------
    css = await ev("""() => window.__preview({
        gradient_type: 'Linear', angle: 0,
        stops: [{offset: 0, color: '#000000'}, {offset: 1, color: '#ffffff'}]
    })""")
    rt.check("linear-gradient" in css and "#000000" in css and "#ffffff" in css,
             "preview builds a CSS ramp from the stops", f"got {css!r}")

    css = await ev("""() => window.__preview({
        gradient_type: 'Linear', angle: 0, stops: [{offset: 0, color: '#abcdef'}]
    })""")
    rt.equal(css, "#abcdef", "a one-stop preview falls back to that colour")

    # Stops need not be authored in order; the strip must not invert.
    css = await ev("""() => window.__preview({
        gradient_type: 'Linear', angle: 0,
        stops: [{offset: 1, color: '#ffffff'}, {offset: 0, color: '#000000'}]
    })""")
    rt.check(css.index("#000000") < css.index("#ffffff"),
             "preview sorts unordered stops by offset", f"got {css!r}")

    # ---------- solid mode ----------
    await ev("() => window.__mount()")
    await ev("() => window.__set('#3b82f6', null)")
    rt.equal(await ev("() => window.__activeMode()"), "Solid",
             "an object with no gradient opens in Solid mode")
    rt.equal(await ev("() => window.__emitted"), None,
             "set() loads without emitting a change")

    await ev("() => window.__setSolid('#ff0000', 50)")
    emitted = await ev("() => window.__emitted")
    rt.equal(emitted["color"], "#ff000080",
             "the colour picker and alpha slider combine into one value")
    rt.equal(emitted["gradient"], None, "Solid mode emits a null gradient")

    # ---------- mode switching preserves work ----------
    await ev("() => window.__mount()")
    await ev("() => window.__set('#123456', null)")
    await ev("() => window.__clickMode('Linear')")
    rt.equal(await ev("() => window.__stopCount()"), 2,
             "choosing Linear seeds a usable two-stop gradient")

    await ev("() => window.__setStop(0, '#ff0000', 100, 0.25)")
    await ev("() => window.__addStop()")
    rt.equal(await ev("() => window.__stopCount()"), 3, "a stop can be added")

    await ev("() => window.__clickMode('Solid')")
    emitted = await ev("() => window.__emitted")
    rt.equal(emitted["gradient"], None,
             "switching back to Solid stops writing a gradient to the model")

    await ev("() => window.__clickMode('Linear')")
    rt.equal(await ev("() => window.__stopCount()"), 3,
             "the in-progress gradient survives a trip through Solid")
    emitted = await ev("() => window.__emitted")
    rt.check(
        emitted["gradient"] and emitted["gradient"]["stops"][0]["color"] == "#ff0000",
        "the edited stop colour survives the round trip",
        f"got {emitted.get('gradient')}",
    )

    # Linear and Radial are kept apart, so flipping between them is not
    # destructive either.
    await ev("() => window.__clickMode('Radial')")
    rt.equal(await ev("() => window.__stopCount()"), 2,
             "Radial starts from its own fresh gradient")
    await ev("() => window.__clickMode('Linear')")
    rt.equal(await ev("() => window.__stopCount()"), 3,
             "the Linear gradient is untouched by editing Radial")

    # ---------- angle ----------
    await ev("() => window.__mount()")
    await ev("() => window.__clickMode('Linear')")
    rt.check(await ev("() => window.__angleVisible()"),
             "Linear mode offers an angle")
    await ev("() => window.__setAngle(90)")
    emitted = await ev("() => window.__emitted")
    rt.near(emitted["gradient"]["angle"], 90, 0.01, "the angle reaches the model")

    await ev("() => window.__clickMode('Radial')")
    rt.check(not await ev("() => window.__angleVisible()"),
             "Radial hides the angle, which it ignores")

    # ---------- stop editing ----------
    await ev("() => window.__mount()")
    await ev("() => window.__clickMode('Linear')")
    await ev("() => window.__setStop(0, '#ff0000', 100, 0.0)")
    await ev("() => window.__setStop(1, '#00ff00', 50, 1.0)")
    emitted = await ev("() => window.__emitted")
    rt.equal(emitted["gradient"]["stops"][1]["color"], "#00ff0080",
             "a stop carries its own alpha")

    await ev("() => window.__moveStop(0, 1)")
    emitted = await ev("() => window.__emitted")
    rt.equal(emitted["gradient"]["stops"][0]["color"], "#00ff0080",
             "stops can be reordered")

    # An offset outside 0..1 would make addColorStop throw, so it is clamped
    # at the point of entry rather than left for the renderer to survive.
    await ev("() => window.__setStop(0, null, null, 5)")
    emitted = await ev("() => window.__emitted")
    rt.near(emitted["gradient"]["stops"][0]["offset"], 1.0, 0.001,
            "an out-of-range offset is clamped")

    # ---------- one-stop gradients are legal ----------
    await ev("() => window.__mount()")
    await ev("() => window.__clickMode('Linear')")
    await ev("() => window.__removeStop(1)")
    rt.equal(await ev("() => window.__stopCount()"), 1,
             "a gradient can be reduced to one stop")
    rt.check(await ev("() => window.__warnShown()"),
             "the editor explains that one stop falls back to the flat colour")
    emitted = await ev("() => window.__emitted")
    rt.check(emitted["gradient"] is not None and len(emitted["gradient"]["stops"]) == 1,
             "a one-stop gradient is still stored rather than discarded",
             f"got {emitted.get('gradient')}")

    # ---------- loading an existing gradient ----------
    await ev("() => window.__mount()")
    await ev("""() => window.__set('#000000', {
        gradient_type: 'Radial', angle: 45,
        stops: [{offset: 0, color: '#ffffff'}, {offset: 1, color: '#00000000'}]
    })""")
    rt.equal(await ev("() => window.__activeMode()"), "Radial",
             "an object with a radial gradient opens in Radial mode")
    rt.equal(await ev("() => window.__stopCount()"), 2,
             "its stops are loaded into the editor")
    rt.equal(await ev("() => window.__emitCount"), 0,
             "loading an object does not look like an edit")

    # The control must not hold a reference into the caller's object, or one
    # edit would write straight back into the project.
    await ev("() => window.__setStop(0, '#ff0000', 100, 0)")
    emitted = await ev("() => window.__emitted")
    rt.check(emitted["gradient"]["stops"][0]["color"] == "#ff0000",
             "editing a loaded gradient emits the change")

    errs = await ev("() => window.__errors")
    rt.check(not errs, "no console errors", str(errs))
    return rt
