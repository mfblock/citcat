"""Scene transitions: hold timing per kind, ordering, looping, and whether the
standalone renderer actually draws a transition."""
import asyncio
import time

from ._util import poll, restart_at, transition_state, wait_for_scene

CUT, CROSSFADE, WIPEL, WIPER, SLIDEL, SLIDER, LAST = range(7)


async def record_scenes(rt, duration_s, interval=0.03):
    """Sample state and return (scene index sequence, whether it ever stopped)."""
    seq, stopped = [], False
    start = time.monotonic()
    while time.monotonic() - start < duration_s:
        st = await rt.state()
        if st:
            if not seq or seq[-1] != st["scene"]:
                seq.append(st["scene"])
            if not st["playing"]:
                stopped = True
        await asyncio.sleep(interval)
    return seq, stopped


async def run(page, port, load_project):
    return [
        await hold_timing(page, port, load_project),
        await transition_reporting(page, port, load_project),
        await ordering(page, port, load_project),
        await looping(page, port, load_project),
    ]


# ------------------------------------------------------------- hold timing

async def hold_timing(page, port, load_project):
    rt = await load_project(page, port, "transitions")

    # Cut: no hold, switches at duration_ms
    await restart_at(rt, CUT)
    elapsed = await wait_for_scene(rt, CROSSFADE, timeout=4.0)
    rt.check(0.30 < elapsed < 0.95,
             "Cut switches scene at duration_ms with no hold",
             f"took {elapsed:.2f}s (scene is 0.5s, Cut must not hold)")

    # Crossfade: holds for the transition duration before switching
    await restart_at(rt, CROSSFADE)
    await asyncio.sleep(0.75)          # 0.5s scene + 0.25s into the 0.7s hold
    st = await rt.state()
    rt.equal(st["scene"], CROSSFADE,
             "a crossfading scene does not switch the instant it ends")
    rt.check(st["time"] > 500, "the timeline runs past duration_ms during the hold",
             f"time {st['time']:.0f} (duration 500)")

    await restart_at(rt, CROSSFADE)
    elapsed = await wait_for_scene(rt, WIPEL, timeout=5.0)
    rt.check(0.95 < elapsed < 2.0,
             "Crossfade holds for its duration, then switches",
             f"took {elapsed:.2f}s (expected ~1.2s = 0.5 scene + 0.7 transition)")

    await rt.pause()
    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (hold timing)", str(errs))
    return rt


# ------------------------------------------------------- getTransitionState

async def transition_reporting(page, port, load_project):
    rt = await load_project(page, port, "transitions")

    # outside a transition there is nothing to report
    await restart_at(rt, CROSSFADE)
    await asyncio.sleep(0.15)
    rt.equal(await transition_state(rt), None,
             "no transition state reported mid-scene")

    # during the hold it reports kind, progress and both scenes
    ts, _ = await poll(lambda: transition_state(rt), lambda t: t is not None, timeout=3.0)
    rt.check(ts is not None, "a transition state is reported during the hold",
             f"got {ts}")
    if ts:
        rt.equal(ts["kind"], "Crossfade", "transition state reports the right kind")
        rt.check(0.0 <= ts["progress"] <= 1.0,
                 "transition progress is within 0..1", f"progress {ts['progress']}")
        rt.check(ts["hasOutgoing"] and ts["hasIncoming"],
                 "transition state carries both scenes")
        rt.equal(ts["outgoingName"], "Crossfade", "outgoing scene is the one ending")
        rt.equal(ts["incomingName"], "WipeLeft", "incoming scene is the next one")

        first = ts["progress"]
        await asyncio.sleep(0.2)
        later = await transition_state(rt)
        if later:
            rt.check(later["progress"] > first,
                     "transition progress advances over time",
                     f"{first:.3f} -> {later['progress']:.3f}")
        else:
            rt.check(True, "transition progress advances over time",
                     "transition completed between samples")

    # Does the standalone renderer actually draw the blend? Scene 1 is pure red,
    # scene 2 pure blue; halfway through a crossfade the top-left pixel should
    # be somewhere between them.
    await restart_at(rt, CROSSFADE)
    ts, _ = await poll(lambda: transition_state(rt),
                       lambda t: t is not None and 0.35 < t["progress"] < 0.75,
                       timeout=4.0)
    if ts:
        px = await rt.sample(10, 10)
        blended = px["b"] > 40
        rt.check(blended,
                 "the standalone renderer paints the crossfade blend",
                 f"at progress {ts['progress']:.2f} the background is {px} "
                 f"(pure outgoing red = not blended)")
    else:
        rt.check(False, "the standalone renderer paints the crossfade blend",
                 "could not catch the transition mid-progress")

    await rt.pause()
    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (transition reporting)", str(errs))
    return rt


# ---------------------------------------------------------------- ordering

async def ordering(page, port, load_project):
    rt = await load_project(page, port, "transitions")

    await restart_at(rt, CUT)
    seq, stopped = await record_scenes(rt, 8.0)

    rt.equal(seq[:7], [0, 1, 2, 3, 4, 5, 6],
             "scenes advance in order through every transition kind")
    rt.check(stopped, "the last scene stops when loop_playback is false")

    st = await rt.state()
    rt.equal(st["playing"], False, "playback is not running after the last scene")

    await rt.pause()
    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (ordering)", str(errs))
    return rt


# ----------------------------------------------------------------- looping

async def looping(page, port, load_project):
    rt = await load_project(page, port, "transitions_loop")

    await restart_at(rt, 0)
    seq, stopped = await record_scenes(rt, 2.2)

    rt.check(len(seq) >= 3, "a looping project wraps past the last scene",
             f"scene sequence {seq}")
    rt.equal(seq[:3], [0, 1, 0], "looping wraps from the last scene back to the first")
    rt.check(not stopped, "a looping project never stops on its own")

    st = await rt.state()
    rt.equal(st["playing"], True, "still playing after wrapping")

    await rt.pause()
    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (looping)", str(errs))
    return rt
