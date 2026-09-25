"""Image, animated GIF, Video, Audio, Ellipse and Button.

These five object types had never appeared in a single test fixture. A survey of
every tests/projects/*.citcat counted:

    Rect 99   Text 37   Svg 2   Hotspot 1
    Ellipse 0   Image 0   Video 0   Audio 0   Button 0

The Svg gap was found the same way: the shared engine simply had no `case "Svg"`,
so SVG rendered in the editor and vanished from every export. The media paths
turn out to carry the same class of defect.

Assets come from tests/assets/_gen.py -- a magenta PNG, a two-frame GIF at 500ms
per frame, and a 3s MP4 that is one second each of red, green and blue, so a
single pixel answers "which second of the clip is on screen".
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from harness import Runtime, PROJECTS  # noqa: E402

# Asset colours, as they land on the canvas after decode.
MAGENTA = (255, 0, 255)
GIF_F0 = (255, 136, 0)      # orange
GIF_F1 = (0, 255, 255)      # cyan
VID_RED = (254, 0, 0)       # clip.mp4 second 0
VID_GREEN = (0, 128, 1)     # second 1
VID_BLUE = (0, 0, 255)      # second 2
BG = (16, 16, 16)
PLACEHOLDER = (34, 34, 34)  # the #222 "video not ready" box

# Captures every <audio>/<video> the engine creates. They are otherwise
# unreachable: loadAudio never attaches its element to the document, and both
# caches are private to the renderStandalone closure.
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


async def _load_spied(page, port, name):
    """load_project, with the element spy installed before anything renders."""
    project = json.loads((PROJECTS / f"{name}.citcat").read_text())
    await page.goto(f"http://127.0.0.1:{port}/page.html", wait_until="load")
    await page.evaluate(_SPY)
    await page.evaluate("p => window.__load(p)", project)
    return Runtime(page, project)


def _rgb(px):
    return (px["r"], px["g"], px["b"])


def _close(a, b, tol=12):
    return all(abs(x - y) <= tol for x, y in zip(a, b))


async def _media_els(rt, tag):
    return await rt.page.evaluate(
        """t => window.__media
              .filter(e => e.tagName === t)
              .map(e => ({
                src: e.src.split('/').pop(),
                volume: e.volume, loop: e.loop, muted: e.muted,
                paused: e.paused, currentTime: e.currentTime,
                readyState: e.readyState,
              }))""",
        tag.upper(),
    )


async def _scan_line(rt, y, x0, x1, step=8):
    """Sample a horizontal line; return the x positions that look like ink."""
    hits = []
    for x in range(x0, x1, step):
        px = await rt.sample(x, y)
        if px["r"] > 150 and px["g"] > 150 and px["b"] > 150:
            hits.append(x)
    return hits


async def run(page, port, load_project):
    rt = await _load_spied(page, port, "media")

    # ==================== Image ====================
    # Never call play(): this also proves loadAssetImage's onload -> renderFrame,
    # without which a paused first frame stays blank until something else moves.
    await rt.seek(0, 0)
    await asyncio.sleep(1.2)

    rt.check(
        _close(_rgb(await rt.sample(400, 300)), MAGENTA),
        "a PNG renders on a paused first frame",
        f"got {_rgb(await rt.sample(400, 300))}, expected {MAGENTA}; "
        f"an async decode with no repaint would leave this at the background",
    )
    rt.check(
        _close(_rgb(await rt.sample(250, 250)), MAGENTA),
        "the image fills its transform rather than drawing at natural size",
        f"the PNG is 64x32 but the object is 400x200; sampling near the "
        f"top-left of the object got {_rgb(await rt.sample(250, 250))}",
    )
    rt.check(
        _close(_rgb(await rt.sample(700, 500)), BG),
        "the image does not paint outside its transform",
        f"got {_rgb(await rt.sample(700, 500))}",
    )
    rt.check(
        _close(_rgb(await rt.sample(950, 350)), BG),
        "a missing image paints nothing rather than throwing",
        f"got {_rgb(await rt.sample(950, 350))}",
    )
    rt.check(
        _close(_rgb(await rt.sample(1450, 350)), (255, 255, 0)),
        "a missing image does not corrupt the rest of the frame",
        f"the marker rect after it sampled {_rgb(await rt.sample(1450, 350))}",
    )

    # ==================== animated GIF ====================
    await rt.seek(1, 0)
    await asyncio.sleep(0.8)
    paused_px = _rgb(await rt.sample(800, 500))
    rt.check(
        _close(paused_px, GIF_F0) or _close(paused_px, GIF_F1),
        "a GIF paints one of its frames",
        f"got {paused_px}, expected {GIF_F0} or {GIF_F1}",
    )

    # Frames are 500ms apart; eight samples over ~2s must span more than one.
    await rt.play()
    seen = []
    for _ in range(8):
        await asyncio.sleep(0.25)
        seen.append(_rgb(await rt.sample(800, 500)))
    await rt.pause()

    rt.check(
        len(set(seen)) > 1,
        "an animated GIF advances its frames during playback",
        f"sampled {len(seen)} times across ~2s of playback (frames are 500ms "
        f"apart) and saw only {sorted(set(seen))}. GIFs are permanently frame 0 "
        f"in every HTML5 export, embed and the landing-page demo.\n"
        f"       Cause, measured directly in Chromium outside CitCat: an "
        f"<img> that is not actually being composited on screen does not "
        f"advance its animation, and drawImage copies whatever frame it is "
        f"showing. Attaching the element offscreen does NOT fix this -- "
        f"verified. So the fix is not 'append it to the document': it needs "
        f"real frame decoding (ImageDecoder / createImageBitmap per frame), or "
        f"a genuinely visible element.",
    )

    # ==================== Video ====================
    await rt.stop()
    await rt.seek(2, 0)
    await asyncio.sleep(2.5)

    first = _rgb(await rt.sample(400, 400))
    rt.check(
        not _close(first, PLACEHOLDER),
        "a video paints a frame once it is decodable, not the placeholder",
        f"got {first}, which is the #222 'not ready' box. The element reaches "
        f"readyState 4, but nothing repaints when it does: loadAssetImage and "
        f"loadSvgImage both got an `onload -> renderFrame()`, loadVideo did "
        f"not. A paused seek therefore shows grey forever.",
    )

    # Playback: frame 0 is red, second 1 is green, second 2 is blue.
    await rt.seek(2, 0)
    await asyncio.sleep(0.5)
    await rt.play()
    frames = []
    for _ in range(8):
        await asyncio.sleep(0.35)
        frames.append(_rgb(await rt.sample(400, 400)))
    await rt.pause()

    rt.check(
        len(set(frames)) > 1,
        "the video frame advances as the timeline runs",
        f"sampled {len(frames)} times across ~2.8s of a 3s clip whose colour "
        f"changes every second, and saw only {sorted(set(frames))}. "
        f"renderStandalone's loadVideo never calls vid.play() and never "
        f"assigns vid.currentTime, so the element sits at currentTime 0, "
        f"paused, for the whole project. Video is a still frame in every export.",
    )

    els = await _media_els(rt, "video")
    rt.check(
        any(e["currentTime"] > 0 for e in els),
        "the video element's currentTime tracks the playhead",
        f"video elements after playback: {els}",
    )
    rt.check(
        all(e["muted"] for e in els if e["src"] == "clip.mp4"),
        "video_muted=true reaches the element",
        f"got {[e for e in els if e['src'] == 'clip.mp4']}",
    )

    # Scrubbing must move the picture, not just the playhead.
    await rt.seek(2, 200)
    await asyncio.sleep(0.6)
    early = _rgb(await rt.sample(400, 400))
    await rt.seek(2, 2500)
    await asyncio.sleep(0.6)
    late = _rgb(await rt.sample(400, 400))
    rt.check(
        early != late,
        "seeking the timeline scrubs the video too",
        f"t=200ms sampled {early}, t=2500ms sampled {late}; the clip is red "
        f"in its first second and blue in its third, so these must differ.\n"
        f"       Implementation note for whoever fixes this: calling "
        f"vid.play() does make drawImage advance -- verified directly in "
        f"Chromium. Assigning vid.currentTime and drawing after 'seeked' did "
        f"NOT produce a new frame in the same probe, so naive per-frame "
        f"scrubbing is likely insufficient; expect to need "
        f"requestVideoFrameCallback, or to drive playback rather than seek it.",
    )

    # ---- trim ----
    await rt.stop()
    await rt.seek(3, 0)
    await asyncio.sleep(2.5)
    trimmed = _rgb(await rt.sample(400, 400))
    rt.check(
        _close(trimmed, VID_BLUE),
        "video_trim_start_ms offsets which frame is shown",
        f"got {trimmed}; with trim_start_ms=2000 on a clip that is blue in its "
        f"third second, t=0 should show {VID_BLUE}. Neither "
        f"video_trim_start_ms nor video_trim_end_ms is read anywhere in "
        f"renderStandalone -- resolveObjectAtTime carries them through and the "
        f"renderer ignores both.",
    )

    els = await _media_els(rt, "video")
    unmuted = [e for e in els if e["src"] == "clip3.mp4"]
    rt.check(
        unmuted and not unmuted[0]["muted"],
        "video_muted=false reaches the element",
        f"got {unmuted}",
    )

    # ---- two objects, one source ----
    await rt.seek(4, 0)
    await asyncio.sleep(2.0)
    share_a = _rgb(await rt.sample(400, 400))
    share_b = _rgb(await rt.sample(1100, 400))
    rt.check(
        share_a != share_b,
        "two Video objects sharing a source can show different frames",
        f"both sampled {share_a}. loadVideo caches on the source URL, so both "
        f"objects receive the same element -- one playhead, one trim. Reusing "
        f"an asset twice in a project is ordinary; the cache should be keyed "
        f"on the object, the way loadSvgImage already is.",
    )

    # ==================== Audio ====================
    await rt.stop()
    await rt.seek(5, 0)
    await asyncio.sleep(0.6)

    rt.check(
        _close(_rgb(await rt.sample(350, 250)), BG),
        "an Audio object paints nothing on the canvas",
        f"got {_rgb(await rt.sample(350, 250))}",
    )

    objs = await rt.resolve(5, 0)
    rt.equal(objs["Music"]["type"], "Audio", "Audio survives resolution as its own type")

    await rt.play()
    await asyncio.sleep(1.0)
    playing = await _media_els(rt, "audio")
    music = next((e for e in playing if e["src"] == "tone.wav"), None)

    rt.check(music is not None, "an <audio> element is created for an Audio object",
             f"captured: {playing}")
    if music:
        rt.near(music["volume"], 0.5, 0.01, "audio_volume reaches the element")
        rt.equal(music["loop"], True, "audio_loop reaches the element")
        rt.check(not music["paused"], "audio plays while the runtime is playing",
                 f"got {music}")

    # audio_volume is in the animatable property list; prove it end to end.
    fader = next((e for e in playing if e["src"] == "tone2.wav"), None)
    rt.check(
        fader is not None and 0.2 < fader["volume"] < 0.8,
        "an audio_volume keyframe drives the element's volume",
        f"the fade runs 1.0 -> 0.0 over 2000ms, so ~1s in the volume should be "
        f"near 0.5; got {fader}",
    )

    await rt.pause()
    await asyncio.sleep(0.5)
    after_pause = await _media_els(rt, "audio")
    music = next((e for e in after_pause if e["src"] == "tone.wav"), None)
    rt.check(
        music is not None and music["paused"],
        "pausing the runtime pauses audio",
        f"got {music}. paintScene only touches audio when state.isPlaying is "
        f"true, so the branch that would pause it is skipped exactly when it "
        f"is needed. Nothing in runtime.js ever calls aud.pause(); a looping "
        f"track keeps playing after pause, after stop, and after the project "
        f"ends.",
    )

    await rt.stop()
    await asyncio.sleep(0.5)
    after_stop = await _media_els(rt, "audio")
    music = next((e for e in after_stop if e["src"] == "tone.wav"), None)
    rt.check(
        music is not None and music["paused"],
        "stopping the runtime pauses audio",
        f"got {music}",
    )
    rt.check(
        music is not None and music["currentTime"] == 0,
        "stopping the runtime rewinds audio to the start",
        f"got {music}; stop() resets the playhead to 0, so a replay should "
        f"restart the track rather than resume it mid-way",
    )

    in_dom = await rt.page.evaluate(
        "() => ({audio: document.querySelectorAll('audio').length,"
        "        video: document.querySelectorAll('video').length})"
    )
    rt.check(
        in_dom["audio"] > 0,
        "audio elements are attached to the document",
        f"got {in_dom}. loadVideo appends its element, loadAudio does not, so "
        f"audio elements cannot be found, inspected or cleaned up by anything "
        f"outside the renderer closure. They are also never released.",
    )

    # ==================== Ellipse ====================
    await rt.seek(6, 0)
    await asyncio.sleep(0.5)

    rt.check(
        _close(_rgb(await rt.sample(400, 350)), (255, 255, 0)),
        "an Ellipse paints its fill",
        f"got {_rgb(await rt.sample(400, 350))}",
    )
    rt.check(
        _close(_rgb(await rt.sample(215, 215)), BG),
        "an Ellipse is elliptical, not its bounding box",
        f"the corner of the bounding box sampled "
        f"{_rgb(await rt.sample(215, 215))}; inside the box but outside the "
        f"ellipse must stay background",
    )
    rt.check(
        _close(_rgb(await rt.sample(1100, 350)), BG),
        "a transparent-filled Ellipse stays hollow",
        f"got {_rgb(await rt.sample(1100, 350))}",
    )
    rt.check(
        _close(_rgb(await rt.sample(905, 350)), (255, 0, 255)),
        "an Ellipse paints its stroke",
        f"got {_rgb(await rt.sample(905, 350))}",
    )

    # ==================== Button ====================
    await rt.seek(7, 0)
    await asyncio.sleep(0.5)

    # Off-centre: the label is drawn centred, so (400,300) is the glyphs.
    rt.check(
        _close(_rgb(await rt.sample(250, 240)), (0, 0, 255)),
        "a Button paints its fill",
        f"got {_rgb(await rt.sample(250, 240))}",
    )
    rt.check(
        _close(_rgb(await rt.sample(205, 205)), (0, 0, 255)),
        "a Button with border_radius 0 paints square corners",
        f"got {_rgb(await rt.sample(205, 205))}",
    )
    rt.check(
        _close(_rgb(await rt.sample(805, 205)), BG),
        "border_radius rounds the corners away",
        f"the same button at radius 90 sampled {_rgb(await rt.sample(805, 205))} "
        f"in its corner; it should be background",
    )

    ink = await _scan_line(rt, 300, 320, 480)
    rt.check(
        len(ink) >= 2,
        "a Button paints its label",
        f"scanned the centre line of a 400x200 button with 72px 'OK' and found "
        f"light pixels at {ink}",
    )

    errs = await rt.console_errors()
    rt.check(not errs, "no console errors", str(errs))
    return rt
