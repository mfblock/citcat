"""The scene filmstrip and the layers panel.

Scope note: unlike `painteditor`, this one drives the *real* `src/index.html`
with Tauri's `invoke` stubbed, because `scenes.js` and `layers.js` only exist in
terms of CitCatApp, CitCatCanvas and the index.html tree -- there is no smaller
unit to test. The stub is deliberately thin: resolve `project_get`, record every
call, return null for the rest. What it buys is coverage of the behaviours a
layout change silently breaks, which is exactly how these panels were last
touched.

Driven from the file:// URL rather than the harness's HTTP server, because
index.html references its scripts by relative path from `src/`.
"""
import asyncio
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
INDEX = (ROOT / "src" / "index.html").as_uri()
DEMO = json.loads((ROOT / "templates" / "demo-showcase.citcat").read_text())


def _stub(project):
    return (
        "window.__PROJ__ = " + json.dumps(project) + ";\n"
        "window.__calls = [];\n"
        "window.__TAURI__ = { core: { invoke: function (cmd, args) {\n"
        "  window.__calls.push([cmd, args]);\n"
        "  if (cmd === 'project_get') return Promise.resolve(window.__PROJ__);\n"
        "  if (cmd === 'effects_list' || cmd === 'effects_reload'\n"
        "      || cmd === 'template_list') return Promise.resolve([]);\n"
        "  if (cmd === 'scene_add') return Promise.resolve(window.__PROJ__.scenes[0]);\n"
        # scene_update returns the updated Scene in the real backend; returning
        # null here would make renameScene throw on `updated.name`.
        "  if (cmd === 'scene_update') {\n"
        "    var s = window.__PROJ__.scenes.find(function (x) { return x.id === args.sceneId; });\n"
        "    if (s && args.name !== undefined) s.name = args.name;\n"
        "    return Promise.resolve(s || null);\n"
        "  }\n"
        "  return Promise.resolve(null);\n"
        "} } };\n"
    )


def _with_scenes(n):
    """The demo, padded out to n scenes with distinct ids."""
    p = json.loads(json.dumps(DEMO))
    base = p["scenes"]
    out = []
    for i in range(n):
        s = json.loads(json.dumps(base[i % len(base)]))
        s["id"] = "scene-%d" % i
        if i >= len(base):
            s["name"] = "%s %d" % (s["name"], i // len(base) + 1)
        out.append(s)
    p["scenes"] = out
    return p


async def _open(page, project):
    await page.add_init_script(_stub(project))
    await page.goto(INDEX, wait_until="load")
    await asyncio.sleep(1.2)


async def _calls(page):
    return await page.evaluate("() => window.__calls.map(c => c[0])")


async def run(page, port, load_project):
    # Borrow the harness's assertion helpers; this suite drives its own page.
    rt = await load_project(page, port, "keyframes")

    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    await _open(page, _with_scenes(5))

    # ---------- the strip renders ----------
    rt.equal(await page.locator("#scene-list .scene-item-thumb").count(), 5,
             "one tile per scene")
    rt.equal(await page.locator(".scene-add-tile").count(), 1,
             "the add tile sits at the end of the strip")
    rt.equal(await page.locator(".scene-item-thumb .scene-index").all_inner_texts(),
             ["1", "2", "3", "4", "5"], "index chips number the scenes in order")

    imgs = await page.locator(".scene-item-thumb img").count()
    rt.equal(imgs, 5, "every tile carries a thumbnail")

    badge = await page.locator(".scene-item-thumb").nth(1).locator(".scene-trans-badge").inner_text()
    rt.check("Crossfade" in badge,
             "the transition badge names the kind entering this scene", badge)

    # ---------- the layout is the filmstrip, not a column ----------
    strip = await page.locator("#scenes-strip").bounding_box()
    layers = await page.locator("#layers-panel").bounding_box()
    timeline = await page.locator("#timeline-panel").bounding_box()
    app = await page.locator("#app").bounding_box()

    rt.check(strip["width"] > app["width"] * 0.95,
             "the strip spans the full width",
             "strip %.0f of %.0f" % (strip["width"], app["width"]))
    rt.near(layers["height"], timeline["height"], 3,
            "layers runs the full height beside the timeline")

    tiles = await page.locator(".scene-item-thumb").all_bounding_boxes() \
        if hasattr(page.locator(".scene-item-thumb"), "all_bounding_boxes") else None
    first = await page.locator(".scene-item-thumb").nth(0).bounding_box()
    second = await page.locator(".scene-item-thumb").nth(1).bounding_box()
    rt.check(second["x"] > first["x"] + first["width"] - 2 and abs(second["y"] - first["y"]) < 3,
             "tiles are laid out horizontally, not stacked",
             "first=%s second=%s" % (first, second))
    rt.check(first["width"] > 120,
             "a thumbnail is wide enough to recognise a scene by",
             "%.0f px" % first["width"])

    # Nothing may spill past the window -- this is what put the splitter
    # off-screen when the strip was first added.
    bottom = await page.locator("#bottom-area").bounding_box()
    rt.check(bottom["y"] + bottom["height"] <= app["height"] + 1,
             "the bottom area stays inside the window",
             "ends at %.0f, window %.0f" % (bottom["y"] + bottom["height"], app["height"]))

    # ---------- selection ----------
    await page.locator(".scene-item-thumb").nth(2).click()
    await asyncio.sleep(0.4)
    rt.equal(await page.locator(".scene-item-thumb.active .scene-thumb-name").inner_text(),
             "The Product", "clicking a tile makes it the active scene")
    rt.equal(await page.locator(".scene-item-thumb.active").count(), 1,
             "exactly one tile is active")

    # ---------- keyboard ----------
    await page.locator(".scene-item-thumb").nth(0).focus()
    await page.keyboard.press("ArrowRight")
    rt.equal(await page.evaluate(
        "() => document.activeElement.querySelector('.scene-thumb-name')?.textContent"),
        "The Dance", "ArrowRight moves focus along the strip")

    await page.keyboard.press("Enter")
    await asyncio.sleep(0.4)
    rt.equal(await page.locator(".scene-item-thumb.active .scene-thumb-name").inner_text(),
             "The Dance", "Enter selects the focused scene")
    # Selecting rebuilds the strip; focus must survive it or the next key is lost.
    rt.equal(await page.evaluate(
        "() => document.activeElement.querySelector('.scene-thumb-name')?.textContent"),
        "The Dance", "focus survives the re-render that selection triggers")

    await page.keyboard.press("End")
    rt.equal(await page.evaluate(
        "() => document.activeElement.querySelector('.scene-thumb-name')?.textContent"),
        "The Close", "End jumps to the last scene")
    await page.keyboard.press("Home")
    rt.equal(await page.evaluate(
        "() => document.activeElement.querySelector('.scene-thumb-name')?.textContent"),
        "The Reveal", "Home jumps to the first scene")

    # ---------- rename ----------
    # A double-click's first click re-renders the strip, so the handler must
    # resolve the live node rather than the one it closed over.
    await page.locator(".scene-item-thumb").nth(0).locator(".scene-thumb-name").dblclick()
    await asyncio.sleep(0.3)
    rt.equal(await page.locator(".scene-rename-input").count(), 1,
             "double-clicking the name opens the rename input")
    await page.keyboard.press("Escape")
    await asyncio.sleep(0.2)
    rt.equal(await page.locator(".scene-rename-input").count(), 0,
             "Escape abandons the rename")

    # ---------- transition menu ----------
    await page.locator(".scene-item-thumb").nth(1).click(button="right")
    await asyncio.sleep(0.3)
    rt.check(await page.locator("#scene-transition-menu").is_visible(),
             "right-click opens the transition menu")
    kinds = await page.locator("#scene-transition-menu .tl-context-item").all_inner_texts()
    rt.equal(sorted(kinds), sorted([
        "Cut", "Crossfade", "WipeLeft", "WipeRight",
        "WipeUp", "WipeDown", "SlideLeft", "SlideRight"]),
        "the menu offers every transition kind the engine implements")
    await page.locator("#timeline-panel").click(position={"x": 5, "y": 5})

    # ---------- delete and add ----------
    await page.evaluate("() => window.__calls.length = 0")
    await page.locator(".scene-item-thumb").nth(4).hover()
    await page.locator(".scene-item-thumb").nth(4).locator(".scene-delete").click()
    await asyncio.sleep(0.4)
    rt.check("scene_delete" in await _calls(page),
             "the delete button on a tile deletes that scene")

    await page.evaluate("() => window.__calls.length = 0")
    await page.locator(".scene-add-tile").click()
    await asyncio.sleep(0.4)
    rt.check("scene_add" in await _calls(page), "the add tile adds a scene")

    # ---------- layers ----------
    rt.check(await page.locator("#layers-list .layer-row").count() > 0,
             "layer rows render")
    await page.evaluate("() => window.__calls.length = 0")
    await page.locator("#layers-list .layer-row").first.locator(".layer-icon-btn").first.click()
    await asyncio.sleep(0.3)
    rt.check("object_update" in await _calls(page),
             "the eye toggle writes the object's visibility")

    await page.evaluate("() => window.__calls.length = 0")
    await page.locator("#layers-list .layer-row").first.locator(".layer-icon-btn").nth(1).click()
    await asyncio.sleep(0.3)
    rt.check("object_update" in await _calls(page),
             "the lock toggle writes the object's locked flag")

    # ---------- splitter ----------
    before = (await page.locator("#layers-panel").bounding_box())["width"]
    sp = await page.locator("#layers-splitter").bounding_box()
    await page.mouse.move(sp["x"] + 2, sp["y"] + sp["height"] / 2)
    await page.mouse.down()
    await page.mouse.move(sp["x"] + 90, sp["y"] + sp["height"] / 2, steps=6)
    await page.mouse.up()
    await asyncio.sleep(0.3)
    after = (await page.locator("#layers-panel").bounding_box())["width"]
    rt.check(after > before + 60, "dragging the splitter widens the layers column",
             "%.0f -> %.0f" % (before, after))

    # and it is bounded
    await page.mouse.move(sp["x"] + 2, sp["y"] + sp["height"] / 2)
    await page.mouse.down()
    await page.mouse.move(5, sp["y"] + sp["height"] / 2, steps=6)
    await page.mouse.up()
    await asyncio.sleep(0.3)
    narrow = (await page.locator("#layers-panel").bounding_box())["width"]
    rt.check(narrow >= 118, "the layers column cannot be dragged to nothing",
             "%.0f px" % narrow)

    rt.check(not errors, "no page errors", str(errors[:3]))

    # ---------- a crowded strip still behaves ----------
    errors.clear()
    await _open(page, _with_scenes(12))
    rt.equal(await page.locator("#scene-list .scene-item-thumb").count(), 12,
             "twelve scenes all render")
    list_box = await page.locator("#scene-list").bounding_box()
    scroll_w = await page.evaluate("() => document.getElementById('scene-list').scrollWidth")
    rt.check(scroll_w > list_box["width"],
             "a crowded strip scrolls horizontally rather than shrinking tiles",
             "scrollWidth %.0f vs %.0f" % (scroll_w, list_box["width"]))
    twelfth = await page.locator(".scene-item-thumb").nth(11).bounding_box()
    rt.check(twelfth["width"] > 120,
             "tiles keep their size when the strip is crowded",
             "%.0f px" % twelfth["width"])
    rt.check(not errors, "no page errors with twelve scenes", str(errors[:3]))

    return rt
