"""
CitCat test harness.

Loads a .citcat project into the real runtime.js inside headless Chromium and
lets a test drive it and assert on what the engine actually computes.

Run:  python3 tests/run.py            (all suites)
      python3 tests/run.py keyframes  (one suite)
"""
import asyncio
import http.server
import json
import os
import re
import socketserver
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TESTS = ROOT / "tests"
PROJECTS = TESTS / "projects"


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send_head(self):
        """Serve byte ranges.

        SimpleHTTPRequestHandler ignores the Range header. Chromium then reports
        a video as `seekable [[0,0]]` and silently drops every currentTime
        assignment, so seeking appears broken when only the server is. A data:
        URI -- what the single-file export actually ships -- seeks fine, so
        without this the harness fails the engine for a fault it does not have.
        """
        rng = self.headers.get("Range")
        if not rng:
            return super().send_head()

        path = self.translate_path(self.path)
        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404)
            return None

        try:
            size = os.fstat(f.fileno()).st_size
            m = re.match(r"bytes=(\d*)-(\d*)$", rng.strip())
            if not m:
                self.send_error(400, "malformed Range")
                f.close()
                return None

            start_s, end_s = m.groups()
            if start_s:
                start = int(start_s)
                end = int(end_s) if end_s else size - 1
            else:
                # suffix form: bytes=-N means the last N bytes
                start = max(0, size - int(end_s))
                end = size - 1
            end = min(end, size - 1)

            if start >= size or start > end:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                f.close()
                return None

            self.send_response(206)
            self.send_header("Content-Type", self.guess_type(path))
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()
            f.seek(start)
            self._range_remaining = end - start + 1
            return _Capped(f, end - start + 1)
        except Exception:
            f.close()
            raise


class _Capped:
    """A read-only file view that stops after n bytes, for copyfile()."""

    def __init__(self, f, n):
        self._f = f
        self._left = n

    def read(self, amt=-1):
        if self._left <= 0:
            return b""
        if amt is None or amt < 0 or amt > self._left:
            amt = self._left
        data = self._f.read(amt)
        self._left -= len(data)
        return data

    def close(self):
        self._f.close()


def start_server():
    """Serve tests/ with runtime.js copied in, on a free port."""
    (TESTS / "runtime.js").write_bytes((ROOT / "src" / "js" / "runtime.js").read_bytes())
    handler = lambda *a, **k: _Quiet(*a, directory=str(TESTS), **k)
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, port


class Fail(Exception):
    pass


class Runtime:
    """Driver around one loaded project."""

    def __init__(self, page, project):
        self.page = page
        self.project = project
        self.checks = []          # (ok, description, detail)

    # ---------- assertions ----------

    def check(self, ok, desc, detail=""):
        self.checks.append((bool(ok), desc, detail))
        return bool(ok)

    def near(self, actual, expected, tol, desc):
        ok = actual is not None and abs(actual - expected) <= tol
        return self.check(ok, desc, f"expected {expected}±{tol}, got {actual}")

    def equal(self, actual, expected, desc):
        return self.check(actual == expected, desc, f"expected {expected!r}, got {actual!r}")

    # ---------- driving ----------

    async def resolve(self, scene_index, time_ms):
        """All objects in a scene, resolved at time_ms. Returns {name: obj}."""
        objs = await self.page.evaluate(
            "([i,t]) => window.__resolveAt(i,t)", [scene_index, time_ms]
        )
        return {o["name"]: o for o in objs}

    async def state(self):
        return await self.page.evaluate("() => window.__state()")

    async def play(self):
        await self.page.evaluate("() => window.CitCatRuntime.play()")

    async def pause(self):
        await self.page.evaluate("() => window.CitCatRuntime.pause()")

    async def stop(self):
        await self.page.evaluate("() => window.CitCatRuntime.stop()")

    async def seek(self, scene_index, time_ms):
        await self.page.evaluate(
            "([i,t]) => window.CitCatRuntime.seekTo(i,t)", [scene_index, time_ms]
        )

    async def wait(self, seconds):
        await asyncio.sleep(seconds)

    async def click_stage(self, sx, sy):
        """Click at stage coordinates."""
        pt = await self.page.evaluate(
            "([x,y]) => window.__stageToClient(x,y)", [sx, sy]
        )
        await self.page.mouse.click(pt["x"], pt["y"])

    async def click_object(self, name, scene_index=None):
        """Click the centre of a named object in the current (or given) scene."""
        if scene_index is None:
            scene_index = (await self.state())["scene"]
        objs = await self.resolve(scene_index, 0)
        if name not in objs:
            raise Fail(f"no object named {name!r} in scene {scene_index}")
        o = objs[name]
        await self.click_stage(o["x"] + o["w"] / 2, o["y"] + o["h"] / 2)

    async def sample(self, sx, sy):
        return await self.page.evaluate("([x,y]) => window.__sample(x,y)", [sx, sy])

    async def console_errors(self):
        return await self.page.evaluate("() => window.__errors")

    # ---------- frame pacing ----------

    async def measure_frames(self, seconds):
        """Play for N seconds and report frame timings from inside the page."""
        await self.page.evaluate("""() => {
            window.__frames = [];
            const R = window.CitCatRuntime;
            const prev = R.state.onTimeUpdate;
            window.__prevOnTime = prev;
            R.state.onTimeUpdate = function (i, t) {
                window.__frames.push(performance.now());
                if (prev) prev(i, t);
            };
        }""")
        await self.play()
        await asyncio.sleep(seconds)
        await self.pause()
        frames = await self.page.evaluate("() => window.__frames")
        await self.page.evaluate("""() => {
            window.CitCatRuntime.state.onTimeUpdate = window.__prevOnTime;
        }""")
        deltas = [round(frames[i + 1] - frames[i], 2) for i in range(len(frames) - 1)]
        return deltas


async def load_project(page, port, name):
    """Load tests/projects/<name>.citcat into the page."""
    path = PROJECTS / f"{name}.citcat"
    if not path.exists():
        raise Fail(f"missing project {path}")
    project = json.loads(path.read_text())
    await page.goto(f"http://127.0.0.1:{port}/page.html", wait_until="load")
    await page.evaluate("p => window.__load(p)", project)
    return Runtime(page, project)
