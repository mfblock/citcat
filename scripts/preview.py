#!/usr/bin/env python3
"""
Render frames from a .citcat project to PNG, so you can see what you designed.

    python3 scripts/preview.py templates/demo-showcase.citcat
    python3 scripts/preview.py my.citcat --at 0:500 2:1200
    python3 scripts/preview.py my.citcat --per-scene 8 --out /tmp/look

Runs the real engine (src/js/runtime.js) in headless Chromium, so what you get
is what an HTML5 export produces -- not an approximation.

Times are <scene index>:<milliseconds>, both zero-based. Without --at it spreads
--per-scene frames evenly across each scene.
"""
import argparse
import asyncio
import http.server
import json
import socketserver
import sys
import threading
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PAGE = """<!DOCTYPE html><html><head><meta charset="utf-8">
{base_tag}<style>html,body{{margin:0;background:#000}}canvas{{display:block}}</style></head><body>
<canvas id="stage"></canvas>
<script>
  // runtime.js swaps the module for a standalone constructor when __TAURI__ is
  // absent. Keep the module API by faking the flag, then drop it.
  window.__TAURI__ = {{ __preview: true }};
</script>
<script src="/src/js/runtime.js"></script>
<script>
  delete window.__TAURI__;
  window.__load = function (project) {{
    var R = window.CitCatRuntime, c = document.getElementById('stage');
    c.width = project.meta.width; c.height = project.meta.height;
    R.stop(); R.setProject(project); R.renderStandalone(c, null);
    return {{ w: c.width, h: c.height, scenes: project.scenes.map(function (s) {{
      return {{ name: s.name, duration: s.duration_ms }}; }}) }};
  }};
  window.__seek = function (i, ms) {{ window.CitCatRuntime.seekTo(i, ms); }};
</script></body></html>
"""


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith("/__preview"):
            # A project's Image/Video/Audio/Svg `content` is a path relative to
            # the *project file's own folder* (that's how a folder export and
            # the editor resolve it -- see examples/*/README.md). The page is
            # always served from "/__preview" though, so a plain relative path
            # in the DOM would resolve against server root instead and silently
            # 404. A <base> tag pointed at the project's folder fixes that
            # without disturbing the root-absolute "/src/js/runtime.js" load.
            parsed = urllib.parse.urlsplit(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            base_dir = (qs.get("base") or [""])[0]
            base_tag = f'<base href="/{base_dir}/">' if base_dir else ""
            body = PAGE.format(base_tag=base_tag).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def serve(directory):
    handler = lambda *a, **k: _Quiet(*a, directory=str(directory), **k)
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def parse_at(values):
    out = []
    for v in values:
        try:
            scene, ms = v.split(":")
            out.append((int(scene), int(ms)))
        except ValueError:
            sys.exit(f"--at wants <scene>:<ms>, got {v!r}")
    return out


async def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("project")
    ap.add_argument("--out", default=None, help="output directory")
    ap.add_argument("--at", nargs="+", metavar="SCENE:MS",
                    help="specific moments, e.g. 0:500 2:1200")
    ap.add_argument("--per-scene", type=int, default=5,
                    help="frames per scene when --at is not given (default 5)")
    ap.add_argument("--width", type=int, default=None,
                    help="scale output to this width (default: project size)")
    args = ap.parse_args()

    project_path = Path(args.project).resolve()
    if not project_path.exists():
        sys.exit(f"no such project: {project_path}")
    project = json.loads(project_path.read_text())

    out_dir = Path(args.out) if args.out else ROOT / "preview" / project_path.stem
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        sys.exit("playwright is not installed: pip3 install playwright")

    # Serve the whole repo (runtime.js needs to load from /src/js/), and tell
    # the page the project's own folder via ?base= so relative asset paths in
    # the project resolve the way they do in a folder export.
    httpd, port = serve(ROOT)
    base = f"http://127.0.0.1:{port}"

    base_qs = ""
    try:
        rel = project_path.parent.relative_to(ROOT)
        base_qs = "?base=" + urllib.parse.quote(rel.as_posix())
    except ValueError:
        pass  # project lives outside the repo; relative assets won't resolve

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        await page.goto(f"{base}/__preview{base_qs}", wait_until="load")
        info = await page.evaluate("p => window.__load(p)", project)

        moments = parse_at(args.at) if args.at else [
            (i, round(s["duration"] * k / max(1, args.per_scene - 1)))
            for i, s in enumerate(info["scenes"])
            for k in range(args.per_scene)
        ]

        canvas = page.locator("#stage")
        written = []
        for scene_i, ms in moments:
            if scene_i >= len(info["scenes"]):
                print(f"  skipped {scene_i}:{ms} — only {len(info['scenes'])} scenes")
                continue
            await page.evaluate("([i,t]) => window.__seek(i,t)", [scene_i, ms])
            # Give async image, SVG and video decodes a chance to land.
            await asyncio.sleep(0.35)
            name = f"scene{scene_i + 1}-{ms:06d}ms.png"
            await canvas.screenshot(path=str(out_dir / name))
            written.append(name)

        await browser.close()

    httpd.shutdown()

    print(f"{len(written)} frames → {out_dir}")
    for i, s in enumerate(info["scenes"]):
        print(f"  scene {i + 1}  {s['name']}  ({s['duration']}ms)")
    if errors:
        print("\nengine errors while rendering:")
        for e in errors[:5]:
            print("  ", e)


if __name__ == "__main__":
    asyncio.run(main())
