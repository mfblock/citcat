"""
<citcat-player> parity.

docs/embed.js is generated from src/js/runtime.js + src/js/embed-wrapper.js. This
suite exists to prove the generation actually works, because the previous
hand-written embed engine silently lacked transition rendering, the motion-path
arc-length fix, the SceneEnd guard and resolved-object hit testing.

The headline check is pixel parity: the same project rendered through the bare
runtime and through the web component must produce the same canvas.
"""
import asyncio
import json
import shutil
import subprocess
import sys

from harness import ROOT, TESTS, PROJECTS, Runtime, Fail

# A grid spread over a 1920x1080 stage, avoiding the outer edge.
GRID = [[x, y] for x in range(120, 1900, 260) for y in range(90, 1060, 240)]

# Fractions within an object's box. A bare centre point misses text, which sits
# on a baseline rather than filling its box, so spread the probes around.
PROBES = ((0.5, 0.5), (0.2, 0.3), (0.5, 0.25), (0.75, 0.4), (0.35, 0.65), (0.6, 0.15))


def load_json(name):
    return json.loads((PROJECTS / f"{name}.citcat").read_text())


def sample_points(project):
    """The grid, plus probes inside every object, so parity is checked on content."""
    w, h = project["meta"]["width"], project["meta"]["height"]
    pts = [p for p in GRID if p[0] < w and p[1] < h]
    for o in project["scenes"][0]["objects"]:
        t = o["transform"]
        for fx, fy in PROBES:
            x, y = round(t["x"] + t["width"] * fx), round(t["y"] + t["height"] * fy)
            if 0 <= x < w and 0 <= y < h:
                pts.append([x, y])
    return pts


async def poll(fn, predicate, timeout=6.0, interval=0.08):
    """Poll fn() until predicate(result) or timeout. Returns the last result."""
    waited = 0.0
    last = await fn()
    while waited < timeout:
        if predicate(last):
            return last
        await asyncio.sleep(interval)
        waited += interval
        last = await fn()
    return last


async def run(page, port, load_project):
    # Regenerate so the suite tests the current sources, not a stale artifact,
    # and copy it where the harness's static server can reach it.
    gen = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "build-embed.py")],
        capture_output=True, text=True,
    )
    if gen.returncode != 0:
        raise Fail(f"build-embed.py failed:\n{gen.stdout}\n{gen.stderr}")
    shutil.copy(ROOT / "docs" / "embed.js", TESTS / "embed.js")

    rt = Runtime(page, None)
    rt.check(True, "embed.js regenerates from source cleanly")

    embed_url = f"http://127.0.0.1:{port}/embed-page.html"

    async def mount(opts):
        await page.evaluate("() => window.__unmountAll()")
        return await page.evaluate("o => window.__mount(o)", opts)

    async def estate(pid="p1"):
        return await page.evaluate("id => window.__embedState(id)", pid)

    # ---------------------------------------------------------------- parity
    # Same project, same seek, same pixels: bare runtime vs web component.
    for proj_name in ("filters", "text"):
        source = load_json(proj_name)
        pts = sample_points(source)

        bare = await load_project(page, port, proj_name)
        await bare.seek(0, 800)
        baseline = await page.evaluate(
            "pts => pts.map(p => window.__sample(p[0], p[1]))", pts
        )

        await page.goto(embed_url, wait_until="load")
        ok = await mount({"id": "p1", "project": source,
                          "attrs": {"width": 960, "height": 540}})
        rt.check(ok, f"embed mounts the {proj_name} project")
        await page.evaluate("() => window.__embedSeek('p1', 0, 800)")
        await asyncio.sleep(0.25)
        mirrored = await page.evaluate(
            "pts => pts.map(p => window.__embedSample('p1', p[0], p[1]))", pts
        )

        size = await page.evaluate("() => window.__embedCanvasSize('p1')")
        rt.equal(size and size["w"], source["meta"]["width"],
                 f"{proj_name}: embed canvas uses the project's native width")

        mismatch = [
            (pts[i], baseline[i], mirrored[i])
            for i in range(len(pts))
            if baseline[i] is None or mirrored[i] is None
            or abs(baseline[i]["r"] - mirrored[i]["r"]) > 2
            or abs(baseline[i]["g"] - mirrored[i]["g"]) > 2
            or abs(baseline[i]["b"] - mirrored[i]["b"]) > 2
        ]
        rt.check(not mismatch,
                 f"{proj_name}: embed renders pixel-identically to the bare runtime",
                 f"{len(mismatch)}/{len(pts)} points differ, e.g. "
                 f"{mismatch[0] if mismatch else ''}")

        # Guard against a vacuous pass: parity across a blank canvas proves nothing.
        inked = [p for p in baseline if p and (p["r"] or p["g"] or p["b"])]
        rt.check(len(inked) > 5,
                 f"{proj_name}: the parity sample hits real content",
                 f"only {len(inked)}/{len(pts)} non-black points; "
                 f"parity would be meaningless")

    # ------------------------------------------------------------ filters
    # Prove the embed carries the filter renderer, not just matching blankness.
    await page.goto(embed_url, wait_until="load")
    await mount({"id": "p1", "project": load_json("filters"),
                 "attrs": {"width": 960, "height": 540}})
    await page.evaluate("() => window.__embedSeek('p1', 0, 500)")
    await asyncio.sleep(0.2)
    has_filter_code = await page.evaluate("""() => {
        const p = document.getElementById('p1');
        return typeof p.engine.renderStandalone === 'function';
    }""")
    rt.check(has_filter_code, "embed exposes the shared standalone renderer")

    grey = await page.evaluate("""() => {
        // The grayscale(1) object in filters.citcat must sample as neutral.
        const st = document.getElementById('p1').engine.state;
        const sc = st.project.scenes[0];
        const o = sc.objects.find(o => o.filters && o.filters.grayscale >= 1);
        if (!o) return null;
        const t = o.transform;
        return window.__embedSample('p1', t.x + t.width / 2, t.y + t.height / 2);
    }""")
    if grey is None:
        rt.check(False, "filters.citcat still has a grayscale object to check")
    else:
        spread = max(grey["r"], grey["g"], grey["b"]) - min(grey["r"], grey["g"], grey["b"])
        rt.check(spread <= 12, "embed applies grayscale: the sample is neutral",
                 f"channel spread {spread} in {grey}")

    # -------------------------------------------------------------- text wrap
    await mount({"id": "p1", "project": load_json("text"),
                 "attrs": {"width": 960, "height": 540}})
    await page.evaluate("() => window.__embedSeek('p1', 0, 100)")
    await asyncio.sleep(0.2)
    wrap = await page.evaluate("""() => {
        const st = document.getElementById('p1').engine.state;
        const sc = st.project.scenes[0];
        const o = sc.objects.find(o => o.text_wrap === true);
        if (!o) return null;
        const c = document.getElementById('p1').shadowRoot.querySelector('canvas');
        const t = o.transform;
        const d = c.getContext('2d').getImageData(
            Math.round(t.x), Math.round(t.y), Math.round(t.width), Math.round(t.height)).data;
        // Row of the first line vs a row well below it: wrapping puts ink on both.
        let top = 0, lower = 0;
        const W = Math.round(t.width);
        for (let y = 0; y < Math.round(t.height); y++) {
            for (let x = 0; x < W; x++) {
                const a = d[(y * W + x) * 4 + 3];
                if (a > 20) { if (y < 40) top++; else lower++; }
            }
        }
        return { top, lower };
    }""")
    if wrap is None:
        rt.check(False, "text.citcat still has a text_wrap object to check")
    else:
        rt.check(wrap["top"] > 0 and wrap["lower"] > 0,
                 "embed wraps text onto a second line",
                 f"ink above/below the first line: {wrap}")

    # -------------------------------------------------------------- crossfade
    await mount({"id": "p1", "project": load_json("embed_crossfade"),
                 "attrs": {"width": 960, "height": 540}})
    await page.evaluate("() => window.__embedPlay('p1')")
    st = await poll(estate, lambda s: s and s["time"] > 430, timeout=5.0, interval=0.03)
    blend = await page.evaluate("() => window.__embedSample('p1', 960, 540)")
    await page.evaluate("() => window.__embedStop('p1')")
    rt.check(
        blend is not None and blend["r"] < 250 and blend["b"] > 5,
        "embed composites a crossfade instead of cutting",
        f"at t={st and st['time']:.0f}ms the background sampled {blend}; "
        f"pure red means the transition never blended",
    )

    # ------------------------------------------------------------ motion path
    # The arc-length fix: even progress must give even distance on a straight path.
    steps = await page.evaluate("""() => {
        const E = document.getElementById('p1').engine;
        const path = { id: 'x', points: [
            { x: 100, y: 100, control_in: null, control_out: null },
            { x: 900, y: 100, control_in: null, control_out: null }
        ]};
        const pts = [];
        for (let i = 0; i <= 20; i++) pts.push(E.evaluateMotionPath(path, i / 20));
        const d = [];
        for (let i = 1; i < pts.length; i++) d.push(Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y));
        return d;
    }""")
    if not steps:
        rt.check(False, "embed exposes evaluateMotionPath")
    else:
        lo, hi = min(steps), max(steps)
        rt.check(hi - lo < 2.0,
                 "embed motion paths move at constant speed (arc-length fix present)",
                 f"step spread {lo:.2f}..{hi:.2f}px over a straight path; "
                 f"the old parameterisation gave 5.8..59.8")

    # ------------------------------------------------- wait point halt/resume
    await mount({"id": "p1", "project": load_json("embed_hittest"),
                 "attrs": {"width": 960, "height": 540}})
    await page.evaluate("() => window.__embedPlay('p1')")
    st = await poll(estate, lambda s: s and s["waiting"], timeout=6.0)
    rt.check(st and st["waiting"], "embed halts at a wait point",
             f"state was {st}")
    frozen_a = (await estate())["time"]
    await asyncio.sleep(0.6)
    frozen_b = (await estate())["time"]
    rt.near(frozen_b, frozen_a, 1.0, "embed freezes the clock while waiting")

    # --------------------------------- hit testing follows the drawn position
    # Mover is authored at x=100 but has travelled to x=1500 by the wait point.
    drawn = await page.evaluate("""() => {
        const E = document.getElementById('p1').engine;
        const sc = E.state.project.scenes[0];
        const o = sc.objects.find(o => o.name === 'Mover');
        const r = E.resolveObjectAtTime(o, E.state.currentTimeMs);
        return { authored: o.transform.x, drawn: r.transform.x,
                 y: r.transform.y, w: r.transform.width, h: r.transform.height };
    }""")
    rt.near(drawn["drawn"], 1500, 30, "the mover has travelled from its authored x")

    async def target_visible():
        return await page.evaluate("""() => {
            const E = document.getElementById('p1').engine;
            const sc = E.state.project.scenes[0];
            const t = sc.objects.find(o => o.name === 'Target');
            const v = E.getRuntimeVisibility(t.id);
            return v === null ? t.visible : v;
        }""")

    rt.equal(await target_visible(), False, "the toggle target starts hidden")

    async def click_stage(sx, sy):
        pt = await page.evaluate(
            "a => window.__embedStageToClient('p1', a[0], a[1])", [sx, sy]
        )
        await page.mouse.click(pt["x"], pt["y"])
        await asyncio.sleep(0.15)

    await click_stage(drawn["authored"] + drawn["w"] / 2, drawn["y"] + drawn["h"] / 2)
    rt.equal(await target_visible(), False,
             "clicking the mover's authored position does nothing")

    await click_stage(drawn["drawn"] + drawn["w"] / 2, drawn["y"] + drawn["h"] / 2)
    rt.equal(await target_visible(), True,
             "clicking the mover where it is drawn fires its event")

    await page.evaluate("() => window.__embedStop('p1')")

    # ------------------------------------------------------------- attributes
    await mount({"id": "p1", "project": load_json("embed_loop"),
                 "attrs": {"width": 480, "height": 270, "controls": True}})
    rt.check(await page.evaluate("() => window.__hasControls('p1')"),
             "controls attribute renders the control bar")
    info = await page.evaluate("() => window.__sceneInfoText('p1')")
    rt.check(info and "Scene 1 of 2" in info,
             "the control bar reports the scene position", f"got {info!r}")

    await mount({"id": "p1", "project": load_json("embed_loop"),
                 "attrs": {"width": 480, "height": 270}})
    rt.check(not await page.evaluate("() => window.__hasControls('p1')"),
             "no controls attribute means no control bar")

    st = await estate()
    rt.equal(st and st["playing"], False, "without autoplay the player stays paused")

    await mount({"id": "p1", "project": load_json("embed_loop"),
                 "attrs": {"width": 480, "height": 270, "autoplay": True}})
    st = await poll(estate, lambda s: s and s["playing"], timeout=3.0)
    rt.equal(st and st["playing"], True, "autoplay starts playback")
    await page.evaluate("() => window.__embedStop('p1')")

    # loop: the project has loop_playback false on disk; the attribute overrides it
    await mount({"id": "p1", "project": load_json("embed_loop"),
                 "attrs": {"width": 480, "height": 270, "autoplay": True, "loop": True}})
    seen = set()
    for _ in range(90):
        s = await estate()
        if s:
            seen.add(s["scene"])
        if s and s["scene"] == 1:
            break
        await asyncio.sleep(0.05)
    wrapped = await poll(estate, lambda s: s and s["scene"] == 0, timeout=4.0, interval=0.05)
    rt.check(wrapped and wrapped["scene"] == 0 and 1 in seen,
             "loop attribute wraps back to the first scene",
             f"scenes seen {sorted(seen)}, ended on {wrapped}")
    await page.evaluate("() => window.__embedStop('p1')")

    # ------------------------------------------------------------- public API
    await mount({"id": "p1", "project": load_json("embed_loop"),
                 "attrs": {"width": 480, "height": 270}})
    await page.evaluate("() => window.__embedPlay('p1')")
    await asyncio.sleep(0.2)
    rt.equal((await estate())["playing"], True, "public play() starts playback")
    await page.evaluate("() => window.__embedPause('p1')")
    paused_at = (await estate())["time"]
    await asyncio.sleep(0.3)
    rt.equal((await estate())["playing"], False, "public pause() stops playback")
    rt.near((await estate())["time"], paused_at, 1.0, "pause() freezes the clock")
    await page.evaluate("() => window.__embedStop('p1')")
    st = await estate()
    rt.equal(st["scene"], 0, "public stop() returns to the first scene")
    rt.near(st["time"], 0, 1.0, "public stop() resets the clock")

    # -------------------------------------------------- two players on a page
    await page.evaluate("() => window.__unmountAll()")
    a = await page.evaluate("o => window.__mount(o)",
                            {"id": "pA", "project": load_json("embed_loop"),
                             "attrs": {"width": 320, "height": 180}})
    b = await page.evaluate("o => window.__mount(o)",
                            {"id": "pB", "project": load_json("embed_crossfade"),
                             "attrs": {"width": 320, "height": 180}})
    rt.check(a and b, "two players mount on one page")
    rt.check(not await page.evaluate("() => window.__engineIsShared('pA','pB')"),
             "each player owns a separate engine instance")

    await page.evaluate("() => window.__embedPlay('pA')")
    await asyncio.sleep(0.35)
    sa, sb = await estate("pA"), await estate("pB")
    rt.equal(sa["playing"], True, "playing one player starts it")
    rt.equal(sb["playing"], False, "the second player is unaffected")
    rt.check(sb["time"] == 0, "the second player's clock did not advance",
             f"pB time {sb['time']}")
    rt.equal(sb["sceneName"], "Red", "the second player kept its own project",
             )
    await page.evaluate("() => window.__embedStop('pA')")

    # ------------------------------------------------------- src attribute
    await mount({"id": "p1", "src": "projects/embed_loop.citcat",
                 "attrs": {"width": 480, "height": 270}})
    st = await estate()
    rt.check(st and st["sceneCount"] == 2,
             "src attribute fetches and loads a project", f"state {st}")

    ok = await mount({"id": "p1", "src": "projects/does-not-exist.citcat",
                      "attrs": {"width": 480, "height": 270, "controls": True}})
    rt.equal(ok, False, "a missing src reports an error rather than hanging")

    errs = await rt.console_errors()
    rt.check(not errs, "no console errors", str(errs))
    return rt
