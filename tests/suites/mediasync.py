"""Media lifecycle, the GIF decode fallback, and the two wipe kinds.

What media.py proves is that each object type renders. This suite covers what
happens around that: whether a trimmed video stops at its out-point, whether
audio is ever paused or released, what a browser without ImageDecoder gets, and
whether WipeUp/WipeDown paint at all -- both were in the model and in the
editor's own menu list while paintTransition had no case for either, so
choosing one produced a hard cut after an unexplained pause.

The video checks here are deliberately written to observe *element state*
rather than pixels wherever possible. tests/harness.py serves over
http.server.SimpleHTTPRequestHandler, which does not honour HTTP Range, and
Chromium refuses to seek a media resource whose server does not advertise it --
it reports seekable [[0,0]] and silently ignores every currentTime assignment.
Anything that needs a real scrub cannot pass under this harness regardless of
the engine, so it is not asserted here.
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from harness import Runtime, PROJECTS  # noqa: E402
from ._util import poll  # noqa: E402

RED = (255, 0, 0)
GREEN = (0, 255, 0)
BLUE = (0, 0, 255)
YELLOW = (255, 255, 0)
VID_BLUE = (0, 0, 255)

_SPY = """() => {
  window.__media = [];
  const orig = document.createElement.bind(document);
  document.createElement = function (tag) {
    const el = orig(tag);
    const t = String(tag).toLowerCase();
    if (t === 'audio' || t === 'video') window.__media.push(el);
    return el;
  };
}"""


def _rgb(px):
    return (px["r"], px["g"], px["b"])


def _close(a, b, tol=14):
    return all(abs(x - y) <= tol for x, y in zip(a, b))


async def _els(rt, tag):
    return await rt.page.evaluate(
        """t => window.__media.filter(e => e.tagName === t).map(e => ({
             src: e.src.split('/').pop(), paused: e.paused,
             currentTime: e.currentTime, volume: e.volume, loop: e.loop,
             inDom: document.body.contains(e),
           }))""",
        tag.upper(),
    )


async def _load(page, port, name, kill_decoder=False):
    project = json.loads((PROJECTS / f"{name}.citcat").read_text())
    await page.goto(f"http://127.0.0.1:{port}/page.html", wait_until="load")
    await page.evaluate(_SPY)
    if kill_decoder:
        # Simulate Firefox/older Safari, where ImageDecoder does not exist.
        await page.evaluate("() => { delete window.ImageDecoder; }")
    await page.evaluate("p => window.__load(p)", project)
    return Runtime(page, project)


async def _transition(rt):
    """The live transition state, or None."""
    return await rt.page.evaluate("() => window.CitCatRuntime.getTransitionState()")


async def _sample_wipe(rt, scene_index, kind):
    """Play across a boundary and sample top and bottom mid-transition."""
    await rt.stop()
    await rt.seek(scene_index, 400)
    await rt.play()
    trans, _ = await poll(
        lambda: _transition(rt),
        lambda t: t and t["kind"] == kind and 0.15 < t["progress"] < 0.85,
        timeout=6.0,
        interval=0.02,
    )
    if not trans:
        await rt.pause()
        return None
    top = _rgb(await rt.sample(960, 60))
    bottom = _rgb(await rt.sample(960, 1020))
    await rt.pause()
    return {"progress": trans["progress"], "top": top, "bottom": bottom}


async def run(page, port, load_project):
    rt = await _load(page, port, "mediasync")

    # ==================== video trim-out ====================
    # trim window is 0..1000ms of a 3s clip, in a 4s scene. Past the out-point
    # the element must stop rather than run on into the rest of the clip.
    await rt.seek(0, 0)
    await asyncio.sleep(0.8)
    await rt.play()
    await asyncio.sleep(2.2)          # well past the 1000ms out-point
    els = await _els(rt, "video")
    await rt.pause()

    clip = next((e for e in els if e["src"] == "clip.mp4"), None)
    rt.check(clip is not None, "a trimmed video still creates its element",
             f"captured {els}")
    if clip:
        rt.check(
            clip["paused"],
            "video_trim_end_ms stops playback at the out-point",
            f"the trim window is 0..1000ms but after 2.2s of playback the "
            f"element is {'paused' if clip['paused'] else 'still running'} at "
            f"currentTime={clip['currentTime']:.2f}",
        )
        rt.check(
            clip["currentTime"] <= 1.35,
            "a trimmed video does not run past its out-point",
            f"currentTime reached {clip['currentTime']:.2f}s, out-point is 1.00s",
        )

    px = _rgb(await rt.sample(400, 400))
    rt.check(
        not _close(px, VID_BLUE),
        "a trimmed video never shows a frame beyond its window",
        f"sampled {px}; the clip is blue only in its third second, which the "
        f"0..1000ms trim excludes",
    )

    # ==================== audio lifecycle ====================
    await rt.stop()
    await rt.seek(1, 0)
    await rt.play()
    await asyncio.sleep(0.7)
    playing = await _els(rt, "audio")
    tone = next((e for e in playing if e["src"] == "tone.wav"), None)
    rt.check(tone is not None and not tone["paused"],
             "a looping track plays while the runtime plays", f"got {tone}")

    await rt.pause()
    await asyncio.sleep(0.3)
    tone = next((e for e in await _els(rt, "audio") if e["src"] == "tone.wav"), None)
    rt.check(
        tone is not None and tone["paused"],
        "pausing the runtime pauses a looping track",
        f"got {tone}; a loop=true track with nothing pausing it outlives the "
        f"project that started it",
    )

    await rt.play()
    await asyncio.sleep(0.5)
    await rt.stop()
    await asyncio.sleep(0.3)
    tone = next((e for e in await _els(rt, "audio") if e["src"] == "tone.wav"), None)
    rt.check(tone is not None and tone["paused"],
             "stopping the runtime pauses audio", f"got {tone}")
    rt.check(
        tone is not None and tone["currentTime"] == 0,
        "stopping the runtime rewinds audio",
        f"got {tone}; stop() returns the timeline to 0, so a replay must "
        f"restart the track rather than resume it",
    )

    # Volume is clamped on the way to the element: Canvas-style silent
    # tolerance of an out-of-range value would be a wrong-sounding mix.
    rt.check(
        tone is not None and 0.0 <= tone["volume"] <= 1.0,
        "audio volume reaching the element is inside 0..1",
        f"got {tone}",
    )

    # ==================== dispose releases elements ====================
    before = await rt.page.evaluate(
        "() => document.querySelectorAll('audio,video').length")
    rt.check(before > 0, "media elements are attached to the document",
             f"found {before}; an element only the renderer closure can reach "
             f"cannot be paused from outside or released")

    # setProject is what an editor calls when opening another file.
    await rt.page.evaluate("""() => {
        window.CitCatRuntime.setProject({
          version: '1.0',
          meta: {name:'empty', width:640, height:360, fps:30,
                 created:'', modified:''},
          scenes: [{id:'s', name:'Empty', duration_ms:1000,
                    background:{fill:'#000', gradient:null, image:null},
                    objects:[], transition_in:null, transition_out:null,
                    sort_order:0, wait_points:[]}],
          effects_library: [], data_source: null,
          export_settings:{format:'Html', single_file:true,
                           autoplay:false, loop_playback:false},
        });
    }""")
    await asyncio.sleep(0.2)
    after = await rt.page.evaluate(
        "() => document.querySelectorAll('audio,video').length")
    rt.check(
        after == 0,
        "loading another project releases the previous one's media elements",
        f"{before} elements before, {after} after; without this a track keeps "
        f"playing over whatever is loaded next, and the elements leak",
    )

    still_playing = [e for e in await _els(rt, "audio") if not e["paused"]]
    rt.check(not still_playing,
             "no audio survives a project change still playing",
             f"still running: {still_playing}")

    # ==================== WipeUp / WipeDown ====================
    rt2 = await _load(page, port, "mediasync")

    up = await _sample_wipe(rt2, 3, "WipeUp")
    rt2.check(up is not None, "a WipeUp transition reports a transition state",
              "getTransitionState() never produced a WipeUp")
    if up:
        rt2.check(
            _close(up["top"], GREEN) and _close(up["bottom"], RED),
            "WipeUp reveals the incoming scene from the top edge",
            f"at progress {up['progress']:.2f} the top sampled {up['top']} "
            f"(expected the incoming {GREEN}) and the bottom {up['bottom']} "
            f"(expected the outgoing {RED}). paintTransition had no case for "
            f"WipeUp, so it fell through to default: and painted the outgoing "
            f"scene alone -- a hard cut after an unexplained pause.",
        )

    down = await _sample_wipe(rt2, 5, "WipeDown")
    rt2.check(down is not None, "a WipeDown transition reports a transition state",
              "getTransitionState() never produced a WipeDown")
    if down:
        rt2.check(
            _close(down["bottom"], YELLOW) and _close(down["top"], BLUE),
            "WipeDown reveals the incoming scene from the bottom edge",
            f"at progress {down['progress']:.2f} the bottom sampled "
            f"{down['bottom']} (expected the incoming {YELLOW}) and the top "
            f"{down['top']} (expected the outgoing {BLUE})",
        )

    errs = await rt2.console_errors()
    rt2.check(not errs, "no console errors", str(errs))

    # ==================== GIF without ImageDecoder ====================
    # Firefox and older Safari have no ImageDecoder. The GIF must still paint
    # its first frame rather than vanishing.
    rt3 = await _load(page, port, "mediasync", kill_decoder=True)
    await rt3.seek(2, 0)
    await asyncio.sleep(1.0)
    fallback = _rgb(await rt3.sample(800, 500))
    rt3.check(
        not _close(fallback, (16, 16, 16)),
        "a GIF still paints a static frame where ImageDecoder is unavailable",
        f"sampled {fallback}, which is the scene background -- the GIF "
        f"disappeared entirely rather than degrading to a still",
    )

    await rt3.play()
    frames = []
    for _ in range(6):
        await asyncio.sleep(0.3)
        frames.append(_rgb(await rt3.sample(800, 500)))
    await rt3.pause()
    rt3.check(
        len(set(frames)) == 1,
        "without ImageDecoder a GIF is a still, and does not flicker",
        f"saw {sorted(set(frames))}; the fallback should be stable, not "
        f"partially animated",
    )

    errs = await rt3.console_errors()
    rt3.check(not errs, "no console errors in the fallback path", str(errs))

    return [rt, rt2, rt3]
