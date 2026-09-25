#!/usr/bin/env python3
"""
Generate docs/embed.js from src/js/runtime.js + src/js/embed-wrapper.js.

There is exactly one engine in this repo. The embed player used to carry a
hand-written copy of it, which drifted badly: by the time a test suite was
pointed at it, it was missing transition rendering, the motion-path arc-length
fix, the SceneEnd fired-guard and resolved-object hit testing. So embed.js is
now a build artifact, not a source file.

The engine is wrapped in a factory:

    function __citcatCreateEngine(window) { ...runtime.js... return CitCatRuntime; }

Two things make that work, and both are asserted below so this fails loudly
rather than silently generating something broken:

  * runtime.js is a single `var CitCatRuntime = (function () { ... })();`, so
    putting it inside a function body makes that binding local. Each call to the
    factory therefore yields a fresh closure -- a fresh `state`, `eventState` and
    `waitState`. Several <citcat-player> elements can share a page.

  * runtime.js ends with a block that replaces CitCatRuntime with a standalone
    constructor when `window.__TAURI__` is absent. The factory's `window`
    PARAMETER shadows the real global inside that scope, and we pass an object
    with a truthy __TAURI__, so the block is skipped and the module survives.
    `document`, `performance` and requestAnimationFrame are untouched globals.

Usage:  python3 scripts/build-embed.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = ROOT / "src" / "js" / "runtime.js"
WRAPPER = ROOT / "src" / "js" / "embed-wrapper.js"
OUT = ROOT / "docs" / "embed.js"

HEADER = """/* GENERATED FILE - DO NOT EDIT.
 *
 * Built by scripts/build-embed.py from:
 *   src/js/runtime.js        the engine, verbatim
 *   src/js/embed-wrapper.js  the <citcat-player> web component
 *
 * Edit those two files and re-run the script (or scripts/build-site.sh).
 * Hand-edits here are lost on the next build, and the whole point of this file
 * being generated is that the embed player and the HTML5 export can no longer
 * drift apart.
 */
"""


def fail(msg):
    sys.stderr.write(f"build-embed: {msg}\n")
    sys.exit(1)


def check_runtime_shape(src):
    """The factory trick depends on runtime.js's top-level form. Verify it."""
    lines = src.split("\n")

    if not re.match(r"^var CitCatRuntime = \(function \(\) \{", lines[0]):
        fail(
            "runtime.js no longer starts with `var CitCatRuntime = (function () {`.\n"
            "  The factory wrapper relies on the engine being one IIFE assigned to a\n"
            "  var, so that wrapping it in a function gives each player its own state.\n"
            f"  Got: {lines[0]!r}"
        )

    # Top-level statements: the IIFE plus the guarded standalone block, nothing else.
    top = [(i + 1, l) for i, l in enumerate(lines) if l and not l[0].isspace()]
    if len(top) != 4:
        fail(
            "runtime.js has unexpected top-level statements. Expected exactly 4 lines\n"
            "  at column 0 (the IIFE open/close and the standalone block open/close).\n"
            "  Anything else would be evaluated once per factory call, which is probably\n"
            "  not what you want. Found:\n"
            + "\n".join(f"    {n}: {l}" for n, l in top)
        )

    if "!window.__TAURI__" not in src:
        fail(
            "runtime.js no longer guards its standalone-constructor block on\n"
            "  `!window.__TAURI__`. The factory passes a fake window to skip that block;\n"
            "  without the guard the factory would return a constructor, not the module."
        )

    if not re.search(r"^\s*state: state,\s*$", src, re.M):
        fail("runtime.js no longer exports `state`; the wrapper reads engine.state.")


def check_wrapper_shape(src):
    if "__citcatCreateEngine" not in src:
        fail("embed-wrapper.js does not call __citcatCreateEngine; nothing would bind.")
    if re.search(r"^\s*function applyEasing", src, re.M):
        fail("embed-wrapper.js contains engine logic. It must only drive the public API.")


def main():
    for p in (RUNTIME, WRAPPER):
        if not p.exists():
            fail(f"missing {p.relative_to(ROOT)}")

    runtime = RUNTIME.read_text()
    wrapper = WRAPPER.read_text()

    check_runtime_shape(runtime)
    check_wrapper_shape(wrapper)

    out = (
        HEADER
        + "(function () {\n"
        + "  // `window` here is a parameter, shadowing the global: see the note in\n"
        + "  // scripts/build-embed.py. It is how the standalone block below is skipped.\n"
        + "  function __citcatCreateEngine(window) {\n\n"
        + runtime
        + "\n    return CitCatRuntime;\n"
        + "  }\n\n"
        + wrapper
        + "\n})();\n"
    )

    OUT.write_text(out)
    kb = len(out.encode()) / 1024
    print(f"build-embed: wrote {OUT.relative_to(ROOT)} ({kb:.1f} KB)")
    print(f"  engine  {RUNTIME.relative_to(ROOT)}  {len(runtime.splitlines())} lines")
    print(f"  wrapper {WRAPPER.relative_to(ROOT)}  {len(wrapper.splitlines())} lines")


if __name__ == "__main__":
    main()
