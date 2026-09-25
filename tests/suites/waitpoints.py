"""Wait points: all four resume conditions, ordering, re-arming, and the
GotoScene-on-resume freeze regression."""
import asyncio

from ._util import poll, restart_at, wait_until_waiting

# scene indices in waitpoints.citcat
TIMER, ANYCLICK, CLICKTARGET, CLICKORTIMER = 0, 1, 2, 3
GOTO, LANDING, TWOWAITS, ATZERO = 4, 5, 6, 7


async def _resume_elapsed(rt, timeout=6.0):
    """Seconds from now until the runtime stops waiting."""
    _, elapsed = await poll(rt.state, lambda s: s and not s["waiting"], timeout)
    return elapsed


async def run(page, port, load_project):
    return [
        await timer_resume(page, port, load_project),
        await click_resume(page, port, load_project),
        await click_or_timer(page, port, load_project),
        await goto_on_resume(page, port, load_project),
        await ordering_and_rearm(page, port, load_project),
    ]


# --------------------------------------------------------------- Timer / any

async def timer_resume(page, port, load_project):
    rt = await load_project(page, port, "waitpoints")

    await restart_at(rt, TIMER)
    await wait_until_waiting(rt)
    st = await rt.state()
    rt.equal(st["waiting"], True, "Timer wait point halts playback")
    rt.near(st["time"], 300, 60, "playback halts at the wait point time")

    # time must genuinely freeze, not merely slow down
    t1 = (await rt.state())["time"]
    await asyncio.sleep(0.45)
    st2 = await rt.state()
    rt.near(st2["time"], t1, 1, "timeline is frozen while waiting")
    rt.equal(st2["waiting"], True, "still waiting before the delay elapses")

    elapsed = await _resume_elapsed(rt, timeout=4.0)
    rt.check(0.15 < elapsed < 1.6, "Timer wait resumes after its delay",
             f"resumed after {elapsed:.2f}s (delay is 0.8s, already partly elapsed)")

    t3 = (await rt.state())["time"]
    await asyncio.sleep(0.4)
    t4 = (await rt.state())["time"]
    rt.check(t4 > t3 + 150, "timeline advances again after resuming",
             f"time {t3:.0f} -> {t4:.0f}")

    # AnyClick
    await restart_at(rt, ANYCLICK)
    await wait_until_waiting(rt)
    rt.equal((await rt.state())["waiting"], True, "AnyClick wait point halts playback")
    await asyncio.sleep(0.3)
    rt.equal((await rt.state())["waiting"], True,
             "AnyClick keeps waiting with no click")
    await rt.click_stage(1500, 900)
    await asyncio.sleep(0.2)
    rt.equal((await rt.state())["waiting"], False,
             "AnyClick resumes on a click anywhere on the stage")

    await rt.pause()
    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (timer/anyclick group)", str(errs))
    return rt


# -------------------------------------------------------------- Click{object}

async def click_resume(page, port, load_project):
    rt = await load_project(page, port, "waitpoints")

    await restart_at(rt, CLICKTARGET)
    await wait_until_waiting(rt)
    rt.equal((await rt.state())["waiting"], True,
             "Click wait point halts playback")

    # a click on the wrong object must not resume
    await rt.click_object("Decoy")
    await asyncio.sleep(0.25)
    rt.equal((await rt.state())["waiting"], True,
             "clicking a different object does not resume")

    # nor does clicking bare stage
    await rt.click_stage(1500, 900)
    await asyncio.sleep(0.25)
    rt.equal((await rt.state())["waiting"], True,
             "clicking empty stage does not resume a targeted wait")

    # the named object does
    await rt.click_object("Target")
    await asyncio.sleep(0.25)
    rt.equal((await rt.state())["waiting"], False,
             "clicking the named object resumes")

    t1 = (await rt.state())["time"]
    await asyncio.sleep(0.4)
    t2 = (await rt.state())["time"]
    rt.check(t2 > t1 + 150, "timeline advances after a targeted resume",
             f"time {t1:.0f} -> {t2:.0f}")

    await rt.pause()
    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (click group)", str(errs))
    return rt


# ------------------------------------------------------------- ClickOrTimer

async def click_or_timer(page, port, load_project):
    rt = await load_project(page, port, "waitpoints")

    # a click beats the 2.5s timer
    await restart_at(rt, CLICKORTIMER)
    await wait_until_waiting(rt)
    rt.equal((await rt.state())["waiting"], True,
             "ClickOrTimer wait point halts playback")
    await asyncio.sleep(0.2)
    await rt.click_stage(1500, 900)
    await asyncio.sleep(0.2)
    rt.equal((await rt.state())["waiting"], False,
             "ClickOrTimer resumes on click, before the timer")

    # with no click, the timer still resumes it
    await restart_at(rt, CLICKORTIMER)
    await wait_until_waiting(rt)
    elapsed = await _resume_elapsed(rt, timeout=6.0)
    rt.check(1.4 < elapsed < 4.0,
             "ClickOrTimer resumes on its timer when no click comes",
             f"resumed after {elapsed:.2f}s (delay is 2.5s)")

    await rt.pause()
    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (click-or-timer group)", str(errs))
    return rt


# ----------------------------------------------- regression: goto on resume

async def goto_on_resume(page, port, load_project):
    """The resume click also carries a GotoScene event. The new scene must both
    switch and keep advancing — this froze once already."""
    rt = await load_project(page, port, "waitpoints")

    await restart_at(rt, GOTO)
    await wait_until_waiting(rt)
    rt.equal((await rt.state())["waiting"], True, "wait point halts before the nav click")

    await rt.click_object("NavBtn")
    await asyncio.sleep(0.3)
    st = await rt.state()
    rt.equal(st["scene"], LANDING, "resume click navigates to the target scene")
    rt.equal(st["waiting"], False, "wait state is cleared after navigating")
    rt.equal(st["playing"], True, "still playing after navigating")

    t1 = (await rt.state())["time"]
    await asyncio.sleep(0.8)
    t2 = (await rt.state())["time"]
    rt.check(t2 > t1 + 400,
             "the new scene keeps advancing after a wait-point resume (no freeze)",
             f"time {t1:.0f} -> {t2:.0f}")

    await rt.pause()
    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (goto-on-resume group)", str(errs))
    return rt


# --------------------------------------------------- ordering, zero, re-arm

async def ordering_and_rearm(page, port, load_project):
    rt = await load_project(page, port, "waitpoints")

    # two wait points, declared in the file as [1400, 300]: they must fire in
    # time order, not array order, and each exactly once
    await restart_at(rt, TWOWAITS)
    await wait_until_waiting(rt)
    first = (await rt.state())["time"]
    rt.near(first, 300, 80, "the earlier wait point fires first, regardless of array order")

    await rt.click_stage(1500, 900)
    await asyncio.sleep(0.2)
    rt.equal((await rt.state())["waiting"], False, "first wait point resumes")

    await wait_until_waiting(rt, timeout=4.0)
    second = (await rt.state())["time"]
    rt.near(second, 1400, 150, "the later wait point fires second")

    await rt.click_stage(1500, 900)
    await asyncio.sleep(0.6)
    st = await rt.state()
    rt.equal(st["waiting"], False, "second wait point resumes")
    rt.check(st["time"] > 1500, "neither wait point fires a second time",
             f"time {st['time']:.0f}")

    # a wait point at time 0
    await restart_at(rt, ATZERO)
    await wait_until_waiting(rt, timeout=3.0)
    st = await rt.state()
    rt.equal(st["waiting"], True, "a wait point at time 0 halts playback")
    rt.near(st["time"], 0, 40, "a wait point at time 0 halts at time 0")
    await _resume_elapsed(rt, timeout=4.0)
    rt.equal((await rt.state())["waiting"], False, "the time-0 wait point resumes")

    # stop() must re-arm wait points for a second playthrough
    await restart_at(rt, TIMER)
    await wait_until_waiting(rt)
    rt.equal((await rt.state())["waiting"], True, "first playthrough waits")
    await rt.stop()
    await asyncio.sleep(0.1)
    rt.equal((await rt.state())["waiting"], False, "stop() clears the waiting flag")
    await restart_at(rt, TIMER)
    await wait_until_waiting(rt, timeout=3.0)
    rt.equal((await rt.state())["waiting"], True,
             "wait points re-arm after stop(), so a replay waits again")

    await rt.pause()
    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (ordering group)", str(errs))
    return rt
