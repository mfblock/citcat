#!/usr/bin/env python3
"""
CitCat test runner.

  python3 tests/run.py             run every suite
  python3 tests/run.py keyframes   run one suite
  python3 tests/run.py -v          show every check, not just failures
"""
import asyncio
import importlib
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from harness import start_server, load_project, Fail  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

SUITES = [
    "keyframes",
    "easing",
    "motionpath",
    "effects",
    "events",
    "waitpoints",
    "transitions",
    "lifespan",
    "filters",
    "text",
    "playback",
    "render",
    "embed",
]

GREEN, RED, DIM, YELLOW, RESET = "\033[32m", "\033[31m", "\033[2m", "\033[33m", "\033[0m"


async def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    verbose = "-v" in sys.argv
    wanted = args or SUITES

    httpd, port = start_server()
    total = passed = 0
    suite_results = []

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1200, "height": 800})
        page.on("pageerror", lambda e: print(f"{RED}  pageerror: {e}{RESET}"))

        for name in wanted:
            try:
                mod = importlib.import_module(f"suites.{name}")
            except ModuleNotFoundError:
                print(f"{YELLOW}skip {name} (no suites/{name}.py){RESET}")
                continue

            print(f"\n{name}")
            s_total = s_passed = 0
            try:
                rts = await mod.run(page, port, load_project)
                if not isinstance(rts, (list, tuple)):
                    rts = [rts]
                for rt in rts:
                    for ok, desc, detail in rt.checks:
                        s_total += 1
                        if ok:
                            s_passed += 1
                            if verbose:
                                print(f"  {GREEN}pass{RESET} {desc}")
                        else:
                            print(f"  {RED}FAIL{RESET} {desc}")
                            if detail:
                                print(f"       {DIM}{detail}{RESET}")
            except Fail as e:
                print(f"  {RED}ERROR{RESET} {e}")
                s_total += 1
            except Exception:
                print(f"  {RED}EXCEPTION{RESET}")
                traceback.print_exc()
                s_total += 1

            colour = GREEN if s_passed == s_total else RED
            print(f"  {colour}{s_passed}/{s_total}{RESET}")
            suite_results.append((name, s_passed, s_total))
            total += s_total
            passed += s_passed

        await browser.close()

    httpd.shutdown()

    print("\n" + "=" * 46)
    for name, sp, st in suite_results:
        mark = f"{GREEN}ok{RESET}" if sp == st else f"{RED}{st - sp} failing{RESET}"
        print(f"  {name:<14} {sp:>3}/{st:<3}  {mark}")
    print("=" * 46)
    colour = GREEN if passed == total else RED
    print(f"{colour}{passed}/{total} checks passed{RESET}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
