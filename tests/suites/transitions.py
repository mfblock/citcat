"""Scene transitions: hold timing per kind, ordering, looping, which of
transition_in / transition_out governs a boundary, and whether the standalone
renderer actually draws the blend."""
import asyncio
import json
import time
from pathlib import Path

from ._util import (boundary_transition, next_scene_index, poll, restart_at,
                    transition_state, wait_for_scene)

CUT, CROSSFADE, WIPEL, WIPER, SLIDEL, SLIDER, LAST = range(7)

# transitions_precedence.citcat
P_NONE, P_OUTONLY, P_INTARGET, P_BOTH, P_INWINS, P_CUTIN, P_END = range(7)

REPO = Path(__file__).resolve().parent.parent.parent


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
        await precedence(page, port, load_project),
        await precedence_playback(page, port, load_project),
        await shipped_projects(page, port, load_project),
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

    # The wrap boundary is LoopB -> LoopA, so scene 0's transition_in governs it.
    # Before transition_in was honoured this resolved to nothing at all, because
    # getTransitionState() bailed out whenever the next index ran off the end.
    rt.equal(await next_scene_index(rt, 1), 0,
             "the last scene of a looping project leads back to scene 0")
    b = await boundary_transition(rt, 1)
    rt.check(b is not None, "the loop boundary has a transition", f"got {b}")
    if b:
        rt.equal(b["kind"], "Crossfade", "the loop boundary uses scene 0's transition_in")
        rt.equal(b["source"], "transition_in", "the loop boundary resolves via transition_in")
        rt.equal(b["duration_ms"], 400, "the loop boundary uses transition_in's duration")

    await rt.pause()
    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (looping)", str(errs))
    return rt


# -------------------------------------------------------------- precedence

async def precedence(page, port, load_project):
    """Which of transition_in / transition_out governs each boundary.

    Asserted against the resolver rather than a live hold, so the rule is pinned
    exactly rather than inferred from timing.
    """
    rt = await load_project(page, port, "transitions_precedence")

    # neither field set -> no transition
    rt.equal(await boundary_transition(rt, P_NONE), None,
             "a boundary with neither field set has no transition")

    # only the outgoing scene's transition_out -> fallback arm
    b = await boundary_transition(rt, P_OUTONLY)
    rt.check(b is not None, "transition_out alone still governs a boundary", f"got {b}")
    if b:
        rt.equal(b["kind"], "Crossfade", "transition_out supplies the kind")
        rt.equal(b["source"], "transition_out", "the fallback arm is reported as such")
        rt.equal(b["duration_ms"], 600, "transition_out supplies the duration")

    # only the incoming scene's transition_in
    b = await boundary_transition(rt, P_INTARGET)
    rt.check(b is not None, "transition_in alone governs a boundary", f"got {b}")
    if b:
        rt.equal(b["kind"], "WipeLeft", "transition_in supplies the kind")
        rt.equal(b["source"], "transition_in", "transition_in is reported as the source")
        rt.equal(b["duration_ms"], 500, "transition_in supplies the duration")

    # both set: the incoming scene wins, including its duration
    b = await boundary_transition(rt, P_BOTH)
    rt.check(b is not None, "a boundary with both fields set has a transition", f"got {b}")
    if b:
        rt.equal(b["kind"], "SlideLeft",
                 "transition_in wins over transition_out on the same boundary")
        rt.equal(b["source"], "transition_in", "the winning field is reported")
        rt.equal(b["duration_ms"], 400,
                 "the hold uses transition_in's duration, not transition_out's 1500")

    # transition_in set to Cut means 'enter hard', and must not inherit the
    # outgoing scene's transition_out
    rt.equal(await boundary_transition(rt, P_INWINS), None,
             "an explicit Cut transition_in does not inherit transition_out")

    # last scene of a non-looping project: nothing to transition into
    rt.equal(await next_scene_index(rt, P_END), -1,
             "the last scene of a non-looping project has no next scene")
    rt.equal(await boundary_transition(rt, P_END), None,
             "the last scene of a non-looping project has no transition")

    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (precedence)", str(errs))
    return rt


async def precedence_playback(page, port, load_project):
    """The resolved rule must also drive the live hold and the painted blend."""
    rt = await load_project(page, port, "transitions_precedence")

    # A boundary governed only by transition_in must actually hold. Scene 2 is
    # 400ms with a 500ms WipeLeft coming from scene 3's transition_in.
    await restart_at(rt, P_INTARGET)
    elapsed = await wait_for_scene(rt, P_BOTH, timeout=4.0)
    rt.check(0.75 < elapsed < 1.6,
             "a transition_in boundary holds for its duration before switching",
             f"took {elapsed:.2f}s (expected ~0.9s = 0.4 scene + 0.5 transition); "
             f"under 0.6s means transition_in was ignored")

    # And it must report itself as a transition_in while holding.
    await restart_at(rt, P_INTARGET)
    ts, _ = await poll(lambda: transition_state(rt), lambda t: t is not None, timeout=3.0)
    rt.check(ts is not None, "a transition_in boundary reports a transition state",
             f"got {ts}")
    if ts:
        rt.equal(ts["kind"], "WipeLeft", "the live transition uses transition_in's kind")
        rt.equal(ts["source"], "transition_in", "the live transition reports its source")
        rt.equal(ts["incomingName"], "BothSet", "the incoming scene is the next one")

    # With both fields set, the hold must be the short transition_in (400ms),
    # not the long transition_out (1500ms). Scene 3 is 400ms, so transition_in
    # gives ~0.8s total and transition_out would give ~1.9s.
    await restart_at(rt, P_BOTH)
    elapsed = await wait_for_scene(rt, P_INWINS, timeout=5.0)
    rt.check(elapsed < 1.5,
             "with both fields set the hold uses transition_in's shorter duration",
             f"took {elapsed:.2f}s; ~1.9s would mean transition_out's 1500ms won")

    # An explicit Cut transition_in switches immediately, despite the outgoing
    # scene declaring a 1500ms Crossfade.
    await restart_at(rt, P_INWINS)
    elapsed = await wait_for_scene(rt, P_CUTIN, timeout=4.0)
    rt.check(elapsed < 1.0,
             "an explicit Cut transition_in switches without a hold",
             f"took {elapsed:.2f}s; ~1.9s would mean transition_out leaked through")

    # The blend is actually painted for a transition_in boundary. Scene 2 is pure
    # blue, scene 3 pure green; a WipeLeft should expose green on the left edge
    # while the right edge is still blue.
    # Pin the sample to *this* boundary. Polling for any transition state would
    # otherwise drift onto the next one -- when transition_in was ignored, scene
    # 2 cut straight through and the poll caught scene 3's crossfade instead,
    # sampling colours that happened to pass.
    await restart_at(rt, P_INTARGET)
    ts, _ = await poll(
        lambda: transition_state(rt),
        lambda t: (t is not None and t["kind"] == "WipeLeft"
                   and t["incomingName"] == "BothSet"
                   and 0.35 < t["progress"] < 0.75),
        timeout=4.0,
    )
    if ts:
        left = await rt.sample(20, 540)
        right = await rt.sample(1900, 540)
        rt.check(left["g"] > 150 and left["b"] < 100,
                 "a transition_in wipe paints the incoming scene on the left",
                 f"at progress {ts['progress']:.2f} left pixel is {left} "
                 f"(expected the incoming green)")
        rt.check(right["b"] > 150 and right["g"] < 100,
                 "a transition_in wipe still shows the outgoing scene on the right",
                 f"at progress {ts['progress']:.2f} right pixel is {right} "
                 f"(expected the outgoing blue)")
    else:
        rt.check(False, "a transition_in wipe paints the incoming scene on the left",
                 "never saw a WipeLeft into BothSet mid-progress")
        rt.check(False, "a transition_in wipe still shows the outgoing scene on the right",
                 "never saw a WipeLeft into BothSet mid-progress")

    await rt.pause()
    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (precedence playback)", str(errs))
    return rt


# ------------------------------------------------------- shipped projects

async def shipped_projects(page, port, load_project):
    """Every transition authored in a shipped project must actually resolve.

    This is the regression that would have caught the original defect: 14 of the
    15 transitions across templates/ and examples/ are authored as transition_in,
    so while only transition_out was consulted they all played as hard cuts.
    """
    rt = await load_project(page, port, "transitions_precedence")

    paths = sorted(REPO.glob("templates/*.citcat")) + \
        sorted(REPO.glob("examples/**/*.citcat"))
    rt.check(bool(paths), "found shipped projects to check", f"searched {REPO}")

    total_authored = 0
    total_resolved = 0

    for path in paths:
        try:
            proj = json.loads(path.read_text())
        except (OSError, ValueError) as e:
            rt.check(False, f"{path.name} parses", str(e))
            continue

        # Count boundaries, not fields: scene i's transition_out and scene i+1's
        # transition_in describe the same boundary, so two authored fields can
        # legitimately collapse into one transition.
        scenes = proj["scenes"]
        looping = proj.get("export_settings", {}).get("loop_playback", False)

        def live(t):
            return bool(t) and t.get("kind") != "Cut"

        authored = 0
        for i in range(len(scenes)):
            nxt = i + 1 if i + 1 < len(scenes) else (0 if looping else None)
            if nxt is None:
                continue
            # transition_in wins outright, including an explicit Cut
            t_in = scenes[nxt].get("transition_in")
            if t_in:
                if live(t_in):
                    authored += 1
                continue
            if live(scenes[i].get("transition_out")):
                authored += 1

        if not authored:
            continue
        total_authored += authored

        # Resolve every boundary through the real engine, not a reimplementation.
        await rt.page.evaluate("p => window.__load(p)", proj)
        resolved = await rt.page.evaluate(
            """(n) => {
                const R = window.CitCatRuntime;
                const out = [];
                for (let i = 0; i < n; i++) {
                    const b = R.getBoundaryTransition(i);
                    if (b) out.push({i, kind: b.kind, source: b.source});
                }
                return out;
            }""",
            len(proj["scenes"]),
        )
        total_resolved += len(resolved)

        rt.check(
            len(resolved) == authored,
            f"{path.name}: every authored transition boundary resolves",
            f"{authored} boundary transition(s) authored, {len(resolved)} resolved; "
            f"the shortfall renders as a hard cut",
        )

    rt.check(total_authored > 0,
             "the shipped projects author some transitions at all",
             f"found {total_authored}")
    rt.equal(total_resolved, total_authored,
             "every authored transition across all shipped projects resolves")

    errs = await rt.console_errors()
    rt.check(not errs, "no console errors (shipped projects)", str(errs))
    return rt
