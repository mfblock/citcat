"""Event triggers and actions: click, hover, timer, scene end — plus hit testing."""
import asyncio

from ._util import (effective_visible, move_to_stage, poll, restart_at,
                    runtime_visibility_raw)


async def run(page, port, load_project):
    return [
        await click_actions(page, port, load_project),
        await hover(page, port, load_project),
        await hit_testing(page, port, load_project),
        await timers(page, port, load_project),
        await scene_end(page, port, load_project),
    ]


# ---------------------------------------------------------------- click group

async def click_actions(page, port, load_project):
    rt = await load_project(page, port, "events")
    objs = await rt.resolve(0, 0)
    hidden_id = objs["HiddenTarget"]["id"]

    # events must be inert while not playing
    st = await rt.state()
    rt.equal(st["playing"], False, "starts paused")
    await rt.click_object("NavButton")
    await asyncio.sleep(0.15)
    st = await rt.state()
    rt.equal(st["scene"], 0, "click does not fire while paused")

    await rt.play()
    await asyncio.sleep(0.1)

    # Click -> ToggleVisible, and back again
    rt.equal(await effective_visible(rt, hidden_id), False,
             "toggle target starts hidden")
    await rt.click_object("ToggleBtn")
    await asyncio.sleep(0.15)
    rt.equal(await effective_visible(rt, hidden_id), True,
             "Click -> ToggleVisible reveals the target")
    await rt.click_object("ToggleBtn")
    await asyncio.sleep(0.15)
    rt.equal(await effective_visible(rt, hidden_id), False,
             "a second click toggles the target back")

    # Click -> SetProperty, checked in the model and on the canvas
    await rt.click_object("ColourBtn")
    await asyncio.sleep(0.2)
    objs = await rt.resolve(0, 0)
    rt.equal((objs["ColourTarget"]["fill"] or "").lower(), "#ff0000",
             "Click -> SetProperty updates style.fill in the model")
    px = await rt.sample(1100, 150)
    rt.check(px["r"] > 200 and px["g"] < 60 and px["b"] < 60,
             "Click -> SetProperty is visible on the canvas", f"sampled {px}")

    # clicking bare stage must do nothing
    await rt.click_stage(900, 900)
    await asyncio.sleep(0.15)
    st = await rt.state()
    rt.equal(st["scene"], 0, "clicking empty stage does not navigate")

    # Click -> GotoScene
    await rt.click_object("NavButton")
    await asyncio.sleep(0.25)
    st = await rt.state()
    rt.equal(st["scene"], 1, "Click -> GotoScene navigates")
    rt.equal(st["sceneName"], "Target", "lands on the referenced scene")

    # and the new scene keeps running
    t1 = (await rt.state())["time"]
    await asyncio.sleep(0.5)
    t2 = (await rt.state())["time"]
    rt.check(t2 > t1 + 200, "playback continues after GotoScene",
             f"time {t1:.0f} -> {t2:.0f}")

    await rt.pause()
    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (click group)", str(errs))
    return rt


# ---------------------------------------------------------------- hover group

async def hover(page, port, load_project):
    rt = await load_project(page, port, "events")
    objs = await rt.resolve(0, 0)
    toggle_id = objs["HoverToggleTarget"]["id"]

    await rt.play()
    await asyncio.sleep(0.1)

    await move_to_stage(rt, 1750, 1000)          # park well outside HoverZone
    await asyncio.sleep(0.1)

    # enter, then jitter around *inside* the zone to generate many mousemove
    # events. HoverEnter must fire exactly once for the whole visit.
    await move_to_stage(rt, 250, 400, steps=6)
    for dx, dy in ((-40, -30), (30, 20), (-20, 40), (50, -10), (0, 25), (-35, 0)):
        await move_to_stage(rt, 250 + dx, 400 + dy)
    await asyncio.sleep(0.15)

    objs = await rt.resolve(0, 0)
    rt.equal((objs["HoverEnterFlag"]["fill"] or "").lower(), "#00ff00",
             "HoverEnter fires on entry")
    rt.equal(await effective_visible(rt, toggle_id), True,
             "HoverEnter fires exactly once per visit, not once per mousemove")

    # leaving fires HoverLeave
    await move_to_stage(rt, 1750, 1000, steps=6)
    await asyncio.sleep(0.15)
    objs = await rt.resolve(0, 0)
    rt.equal((objs["HoverLeaveFlag"]["fill"] or "").lower(), "#0000ff",
             "HoverLeave fires on exit")

    # re-entering arms again: second visit toggles back
    await move_to_stage(rt, 250, 400, steps=6)
    await asyncio.sleep(0.15)
    rt.equal(await effective_visible(rt, toggle_id), False,
             "HoverEnter re-arms after leaving")

    await rt.pause()
    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (hover group)", str(errs))
    return rt


# ----------------------------------------------------------- hit-test group

async def hit_testing(page, port, load_project):
    rt = await load_project(page, port, "events")
    await rt.play()
    await asyncio.sleep(0.1)

    # topmost z_index wins when two objects occupy the same rect
    await rt.click_stage(250, 700)
    await asyncio.sleep(0.2)
    objs = await rt.resolve(0, 0)
    zfill = (objs["ZResult"]["fill"] or "").lower()
    rt.equal(zfill, "#00ff00", "click hits the topmost object by z_index")

    # a visible hotspot is not drawn but is still clickable
    px_before = await rt.sample(700, 700)
    await rt.click_stage(700, 700)
    await asyncio.sleep(0.2)
    objs = await rt.resolve(0, 0)
    rt.equal((objs["HotspotResult"]["fill"] or "").lower(), "#00ff00",
             "a visible Hotspot receives clicks")
    rt.check(px_before["r"] < 60 and px_before["g"] < 60 and px_before["b"] < 60,
             "a Hotspot is not painted during playback", f"sampled {px_before}")

    # an invisible object must be click-through
    await rt.click_stage(1100, 700)
    await asyncio.sleep(0.2)
    objs = await rt.resolve(0, 0)
    rt.equal((objs["InvisibleResult"]["fill"] or "").lower(), "#111111",
             "an invisible object does not receive clicks")

    # corners: the canvas is displayed at half size, so a broken CSS->stage
    # mapping shows up at the edges long before it shows up in the middle
    for corner, sx, sy, res in (
        ("top-left", 60, 60, "ResTL"),
        ("top-right", 1860, 60, "ResTR"),
        ("bottom-left", 60, 1020, "ResBL"),
        ("bottom-right", 1860, 1020, "ResBR"),
    ):
        await rt.click_stage(sx, sy)
        await asyncio.sleep(0.15)
        objs = await rt.resolve(0, 0)
        rt.equal((objs[res]["fill"] or "").lower(), "#00ff00",
                 f"click maps correctly at the {corner} corner")

    await rt.pause()
    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (hit-test group)", str(errs))
    return rt


# ---------------------------------------------------------------- timer group

async def timers(page, port, load_project):
    rt = await load_project(page, port, "events")
    objs = await rt.resolve(0, 0)
    toggle_id = objs["TimerToggleTarget"]["id"]

    await rt.play()

    # nothing before the delay
    await asyncio.sleep(0.2)
    objs = await rt.resolve(0, 0)
    rt.equal((objs["TimerFlag"]["fill"] or "").lower(), "#111111",
             "Timer has not fired before its delay")

    # fires after the delay
    fill, _ = await poll(
        lambda: rt.resolve(0, 0),
        lambda o: o and (o["TimerFlag"]["fill"] or "").lower() == "#00ff00",
        timeout=3.0,
    )
    rt.equal((fill["TimerFlag"]["fill"] or "").lower(), "#00ff00",
             "Timer fires at its delay")

    # and fires exactly once, not once per frame: a ToggleVisible driven by the
    # same delay must settle on true and stay there
    samples = []
    for _ in range(12):
        samples.append(await effective_visible(rt, toggle_id))
        await asyncio.sleep(0.05)
    rt.check(all(s is True for s in samples),
             "Timer fires once, not on every frame after the delay",
             f"samples {samples}")

    # stop() must re-arm timers for the next playthrough
    await rt.stop()
    await asyncio.sleep(0.05)
    rt.equal(await runtime_visibility_raw(rt, toggle_id), None,
             "stop() clears runtime visibility overrides")
    await rt.play()
    val, _ = await poll(lambda: effective_visible(rt, toggle_id),
                        lambda v: v is True, timeout=3.0)
    rt.equal(val, True, "Timer re-arms after stop()")

    await rt.pause()
    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (timer group)", str(errs))
    return rt


# ------------------------------------------------------------ scene-end group

async def scene_end(page, port, load_project):
    rt = await load_project(page, port, "events")
    objs = await rt.resolve(2, 0)
    end_toggle_id = objs["EndToggleTarget"]["id"]

    # scene 2 lasts 500ms then holds 600ms for its crossfade before advancing
    await restart_at(rt, 2)

    val, _ = await poll(lambda: runtime_visibility_raw(rt, end_toggle_id),
                        lambda v: v is True, timeout=3.0)
    rt.equal(val, True, "SceneEnd fires when the scene reaches its duration")

    objs = await rt.resolve(2, 0)
    rt.equal((objs["EndFlag"]["fill"] or "").lower(), "#00ff00",
             "SceneEnd runs its action")

    # While the outgoing transition holds, the scene is still past its duration.
    # SceneEnd must not keep re-firing: the toggle must stay true until the
    # scene actually changes (at which point the override is cleared to null).
    seen = []
    for _ in range(14):
        seen.append(await runtime_visibility_raw(rt, end_toggle_id))
        await asyncio.sleep(0.04)
    before_reset = []
    for v in seen:
        if v is None:
            break
        before_reset.append(v)
    rt.check(all(v is True for v in before_reset),
             "SceneEnd fires once, not once per frame while the transition holds",
             f"samples {seen}")

    await rt.pause()
    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (scene-end group)", str(errs))
    return rt
