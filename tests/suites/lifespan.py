"""appear_at_ms / disappear_at_ms: resolution, rendering and hit-testing."""

BG = (0, 0, 0)          # scene background
RED = (255, 0, 0)       # fill of the lifespan probes


async def ink_at(rt, x, y, tol=40):
    """True if the canvas at (x,y) is clearly not the background."""
    px = await rt.sample(x, y)
    return abs(px["r"] - BG[0]) > tol or abs(px["g"] - BG[1]) > tol or abs(px["b"] - BG[2]) > tol


async def run(page, port, load_project):
    rt = await load_project(page, port, "lifespan")

    # ---------------------------------------------------------------- resolve
    # The harness keys objects by name. A lifespan-hidden object must still
    # come back identifiable, otherwise nothing downstream can find it.
    at0 = await rt.resolve(0, 0)
    rt.check("AppearsLate" in at0,
             "lifespan-hidden object keeps its name when resolved",
             f"names at t=0: {sorted(k for k in at0 if k)}")

    async def vis(t, name):
        objs = await rt.resolve(0, t)
        o = objs.get(name)
        return None if o is None else o["visible"]

    # appear_at 1000
    rt.equal(await vis(0, "AppearsLate"), False, "appear_at: hidden well before")
    rt.equal(await vis(999, "AppearsLate"), False, "appear_at: hidden 1ms before")
    rt.equal(await vis(1000, "AppearsLate"), True, "appear_at: visible exactly at appear_at")
    rt.equal(await vis(3000, "AppearsLate"), True, "appear_at: visible after")

    # disappear_at 2000  (runtime hides when timeMs > disappear_at, so the
    # boundary instant itself is still visible — asserted as implemented)
    rt.equal(await vis(0, "DisappearsEarly"), True, "disappear_at: visible before")
    rt.equal(await vis(2000, "DisappearsEarly"), True,
             "disappear_at: still visible exactly at disappear_at")
    rt.equal(await vis(2001, "DisappearsEarly"), False, "disappear_at: hidden 1ms after")
    rt.equal(await vis(3500, "DisappearsEarly"), False, "disappear_at: hidden well after")

    # both ends
    rt.equal(await vis(500, "WindowOnly"), False, "window: hidden before the window")
    rt.equal(await vis(1500, "WindowOnly"), True, "window: visible inside the window")
    rt.equal(await vis(2500, "WindowOnly"), False, "window: hidden after the window")

    # neither
    for t in (0, 1500, 3999):
        rt.equal(await vis(t, "Always"), True, f"no lifespan: visible at {t}ms")

    # lifespan vs a visible keyframe — the lifespan gate runs before keyframes
    # are read, so lifespan must win.
    rt.equal(await vis(500, "LifespanVsKeyframe"), False,
             "lifespan overrides a visible=true keyframe before the window")
    rt.equal(await vis(2000, "LifespanVsKeyframe"), True,
             "inside the window the visible keyframe applies")

    # a visible=false keyframe with no lifespan still hides
    rt.equal(await vis(500, "KeyframeHidden"), False,
             "visible=false keyframe hides an object with no lifespan")

    # ---------------------------------------------------------------- render
    # seek() fires onTimeUpdate, which is what triggers renderFrame.
    async def render_at(t):
        await rt.seek(0, t)
        await rt.wait(0.05)

    await render_at(500)
    rt.check(not await ink_at(rt, 200, 200),
             "appear_at: nothing drawn before the window")
    rt.check(await ink_at(rt, 500, 200),
             "disappear_at: drawn before its cutoff")
    rt.check(await ink_at(rt, 1100, 200),
             "no-lifespan object is drawn")

    await render_at(1500)
    rt.check(await ink_at(rt, 200, 200),
             "appear_at: drawn once inside the window")
    rt.check(await ink_at(rt, 800, 200),
             "window: drawn inside the window")

    await render_at(2500)
    rt.check(not await ink_at(rt, 500, 200),
             "disappear_at: not drawn after its cutoff")
    rt.check(not await ink_at(rt, 800, 200),
             "window: not drawn after the window")
    rt.check(await ink_at(rt, 1100, 200),
             "no-lifespan object still drawn late in the scene")

    # ------------------------------------------------------------ hit testing
    # GatedClicker appears at 2000ms and toggles ToggleTarget (initially hidden).
    target_id = (await rt.resolve(0, 0))["ToggleTarget"]["id"]
    rt.equal((await rt.resolve(0, 0))["ToggleTarget"]["visible"], False,
             "toggle target starts hidden")

    async def click_clicker_at(t):
        """Fresh event state, play, seek to t, click GatedClicker's centre."""
        await rt.stop()                     # resetEventState clears the overrides
        await rt.play()
        await rt.seek(0, t)
        await rt.wait(0.05)
        await rt.click_stage(550, 750)      # centre of GatedClicker
        await rt.wait(0.1)
        v = await page.evaluate(
            "id => window.CitCatRuntime.getRuntimeVisibility(id)", target_id)
        await rt.pause()
        return v

    outside = await click_clicker_at(500)
    rt.check(outside in (None, False),
             "object hidden by lifespan is not clickable",
             f"clicking outside the window toggled the target (override={outside!r})")

    inside = await click_clicker_at(2500)
    rt.equal(inside, True, "object inside its lifespan window is clickable")
    await rt.stop()

    errs = await rt.console_errors()
    rt.check(not errs, "no console errors", str(errs))
    return rt
