"""Playback state machine, timing accuracy and frame pacing."""

import statistics
import time


def dist(deltas):
    """min / median / p95 / max / count for a list of inter-frame deltas."""
    if not deltas:
        return {"count": 0}
    s = sorted(deltas)
    p95 = s[min(len(s) - 1, int(len(s) * 0.95))]
    return {"count": len(s), "min": s[0], "median": statistics.median(s),
            "p95": p95, "max": s[-1]}


async def run(page, port, load_project):
    rt = await load_project(page, port, "playback")
    results = [rt]

    # ------------------------------------------------- play / pause / stop
    await rt.stop()
    st = await rt.state()
    rt.equal(st["playing"], False, "stopped: playing is false")
    rt.equal(st["scene"], 0, "stopped: back on scene 0")
    rt.near(st["time"], 0, 1, "stopped: time reset to 0")

    await rt.play()
    await rt.wait(0.3)
    st = await rt.state()
    rt.equal(st["playing"], True, "play: playing flag set")
    rt.check(st["time"] > 100, "play: time advances", f"time={st['time']}")

    await rt.pause()
    paused_at = (await rt.state())["time"]
    await rt.wait(0.4)
    st = await rt.state()
    rt.equal(st["playing"], False, "pause: playing flag cleared")
    rt.near(st["time"], paused_at, 5, "pause: time frozen while paused")

    await rt.play()
    await rt.wait(0.2)
    rt.check((await rt.state())["time"] > paused_at + 50,
             "play after pause: resumes from where it stopped")

    await rt.stop()
    st = await rt.state()
    rt.equal(st["playing"], False, "stop after play: playing cleared")
    rt.near(st["time"], 0, 1, "stop after play: time reset")
    rt.equal(st["scene"], 0, "stop after play: scene reset")

    # --------------------------------------------- double play() is a no-op
    # A second play() must not start a second rAF loop, which would make the
    # clock run at double speed.
    await rt.stop()
    await rt.play()
    await rt.wait(0.1)
    t0 = (await rt.state())["time"]
    w0 = time.monotonic()
    await rt.wait(0.8)
    t1 = (await rt.state())["time"]
    w1 = time.monotonic()
    rate_before = (t1 - t0) / ((w1 - w0) * 1000)

    await rt.play()                       # second call, mid-flight
    await rt.wait(0.1)
    t2 = (await rt.state())["time"]
    w2 = time.monotonic()
    await rt.wait(0.8)
    t3 = (await rt.state())["time"]
    w3 = time.monotonic()
    rate_after = (t3 - t2) / ((w3 - w2) * 1000)

    rt.near(rate_before, 1.0, 0.15, "playback clock tracks wall clock 1:1")
    rt.near(rate_after, 1.0, 0.15,
            "a second play() does not double the clock rate")
    rt.check(abs(rate_after - rate_before) < 0.2,
             "clock rate unchanged by a redundant play()",
             f"before={rate_before:.3f} after={rate_after:.3f}")
    await rt.stop()

    # ---------------------------------------------------------- timing
    await rt.stop()
    await rt.play()
    w0 = time.monotonic()
    await rt.wait(2.0)
    elapsed_ms = (time.monotonic() - w0) * 1000
    st = await rt.state()
    await rt.pause()
    rt.equal(st["scene"], 0, "2s of playback stays inside the long first scene")
    rt.check(abs(st["time"] - elapsed_ms) < elapsed_ms * 0.1,
             "playback time is within 10% of wall clock over 2s",
             f"runtime={st['time']:.0f}ms wall={elapsed_ms:.0f}ms")

    # ----------------------------------------------------------- seekTo
    await rt.stop()
    await rt.seek(1, 200)
    st = await rt.state()
    rt.equal(st["scene"], 1, "seekTo moves to the requested scene")
    rt.near(st["time"], 200, 1, "seekTo moves to the requested time")
    rt.equal(st["playing"], False, "seekTo does not start playback")
    await rt.wait(0.3)
    rt.near((await rt.state())["time"], 200, 5,
            "time does not drift after a seek while paused")

    # seek is clamped to the scene duration (scene 1 is 600ms)
    await rt.seek(1, 99999)
    rt.near((await rt.state())["time"], 600, 1, "seekTo clamps to scene duration")
    await rt.seek(1, -500)
    rt.near((await rt.state())["time"], 0, 1, "seekTo clamps negative time to 0")

    # ------------------------------------------------- scene auto-advance
    await rt.stop()
    await rt.seek(1, 400)          # 200ms left in scene 1
    await rt.play()
    advanced = False
    for _ in range(40):
        await rt.wait(0.05)
        if (await rt.state())["scene"] == 2:
            advanced = True
            break
    rt.check(advanced, "playback advances to the next scene at the end of one")
    await rt.pause()

    # ------------------------------------- final scene stops when not looping
    await rt.stop()
    await rt.seek(2, 400)          # 200ms left in the last scene
    await rt.play()
    stopped = False
    for _ in range(60):
        await rt.wait(0.05)
        if not (await rt.state())["playing"]:
            stopped = True
            break
    rt.check(stopped, "playback stops after the final scene when loop is off")
    st = await rt.state()
    rt.equal(st["playing"], False, "not playing after the final scene")
    rt.equal(st["scene"], 0, "stop() after the final scene rewinds to scene 0")

    # -------------------------------------------------------- smoothness
    await rt.stop()
    deltas = await rt.measure_frames(2.0)
    d = dist(deltas)
    print(f"      frame pacing over 2s: {d}")

    rt.check(d.get("count", 0) >= 100,
             "at least 100 frames rendered in 2s",
             f"only {d.get('count', 0)} frames: {d}")
    rt.check(d.get("median", 999) < 20,
             "median inter-frame gap under 20ms",
             f"median {d.get('median')}ms: {d}")
    rt.check(d.get("max", 999) < 100,
             "no single frame gap over 100ms (visible stutter)",
             f"worst gap {d.get('max')}ms: {d}")
    await rt.stop()

    errs = await rt.console_errors()
    rt.check(not errs, "no console errors", str(errs))

    # ------------------------------------------------------------ looping
    rt2 = await load_project(page, port, "playback_loop")
    results.append(rt2)
    await rt2.stop()
    await rt2.seek(1, 200)         # 200ms left in the final scene
    await rt2.play()
    wrapped = False
    for _ in range(60):
        await rt2.wait(0.05)
        s = await rt2.state()
        if s["scene"] == 0 and s["playing"]:
            wrapped = True
            break
    rt2.check(wrapped,
              "loop_playback=true wraps from the last scene back to the first")
    rt2.equal((await rt2.state())["playing"], True,
              "playback keeps running after wrapping round")
    await rt2.stop()

    errs = await rt2.console_errors()
    rt2.check(not errs, "no console errors while looping", str(errs))
    return results
