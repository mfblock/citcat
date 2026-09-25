"""Easing curves.

Expected values come from applyEasing() in src/js/runtime.js:

    Linear    t
    EaseIn    t^3
    EaseOut   1 - (1-t)^3
    EaseInOut t < 0.5 ? 4t^3 : 1 - (-2t+2)^3 / 2

Every object animates transform.x from 0 to 1000 over 1000ms, so the resolved
x is simply 1000 * easing(t) and the formulas can be checked directly.
"""

DIST = 1000.0
DUR = 1000


def f_linear(t):
    return t


def f_ease_in(t):
    return t ** 3


def f_ease_out(t):
    return 1 - (1 - t) ** 3


def f_ease_in_out(t):
    return 4 * t ** 3 if t < 0.5 else 1 - ((-2 * t + 2) ** 3) / 2


CURVES = {
    "Linear": f_linear,
    "EaseIn": f_ease_in,
    "EaseOut": f_ease_out,
    "EaseInOut": f_ease_in_out,
}


async def run(page, port, load_project):
    rt = await load_project(page, port, "easing")

    # --- every curve matches its formula exactly at 9 sample points ---
    for name, fn in CURVES.items():
        for frac in (0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 0.9):
            t_ms = int(DUR * frac)
            o = await rt.resolve(0, t_ms)
            expected = DIST * fn(frac)
            rt.near(o[name]["x"], expected, 0.5,
                    f"{name} matches its curve at t={frac:.2f}")

    # --- Linear is exact at the quarter marks ---
    for frac, want in ((0.25, 250.0), (0.5, 500.0), (0.75, 750.0)):
        o = await rt.resolve(0, int(DUR * frac))
        rt.near(o["Linear"]["x"], want, 0.01, f"Linear is exactly {want} at {frac:.0%}")

    # --- shape: EaseIn starts slow, EaseOut starts fast ---
    for frac in (0.1, 0.25, 0.4):
        o = await rt.resolve(0, int(DUR * frac))
        lin = DIST * frac
        rt.check(o["EaseIn"]["x"] < lin - 1,
                 f"EaseIn lags linear at t={frac:.2f} (slow start)",
                 f"easeIn={o['EaseIn']['x']:.1f} vs linear={lin:.1f}")
        rt.check(o["EaseOut"]["x"] > lin + 1,
                 f"EaseOut leads linear at t={frac:.2f} (fast start)",
                 f"easeOut={o['EaseOut']['x']:.1f} vs linear={lin:.1f}")

    # --- shape: past the midpoint the relationship inverts ---
    for frac in (0.6, 0.75, 0.9):
        o = await rt.resolve(0, int(DUR * frac))
        lin = DIST * frac
        rt.check(o["EaseIn"]["x"] < lin,
                 f"EaseIn still below linear at t={frac:.2f}",
                 f"easeIn={o['EaseIn']['x']:.1f} vs linear={lin:.1f}")
        rt.check(o["EaseOut"]["x"] > lin,
                 f"EaseOut still above linear at t={frac:.2f}",
                 f"easeOut={o['EaseOut']['x']:.1f} vs linear={lin:.1f}")

    # --- EaseInOut is symmetric: f(t) + f(1-t) == 1 ---
    for frac in (0.1, 0.2, 0.25, 0.35, 0.45):
        a = (await rt.resolve(0, int(DUR * frac)))["EaseInOut"]["x"]
        b = (await rt.resolve(0, int(DUR * (1 - frac))))["EaseInOut"]["x"]
        rt.near(a + b, DIST, 1.0,
                f"EaseInOut symmetric about the midpoint at t={frac:.2f}")

    # EaseInOut crosses the halfway value at the halfway time
    o = await rt.resolve(0, DUR // 2)
    rt.near(o["EaseInOut"]["x"], 500.0, 0.5, "EaseInOut is at 50% when time is 50%")

    # --- all curves are pinned at both ends ---
    start = await rt.resolve(0, 0)
    end = await rt.resolve(0, DUR)
    for name in CURVES:
        rt.near(start[name]["x"], 0.0, 0.01, f"{name} starts exactly at 0")
        rt.near(end[name]["x"], DIST, 0.01, f"{name} ends exactly at {DIST:.0f}")

    # --- monotonic: 20 samples, never goes backwards ---
    samples = {name: [] for name in CURVES}
    for i in range(21):
        o = await rt.resolve(0, int(DUR * i / 20))
        for name in CURVES:
            samples[name].append(o[name]["x"])

    for name, vals in samples.items():
        worst = None
        for i in range(1, len(vals)):
            drop = vals[i - 1] - vals[i]
            if drop > 0.01 and (worst is None or drop > worst[0]):
                worst = (drop, i)
        rt.check(worst is None, f"{name} is monotonic across 20 samples",
                 "" if worst is None else
                 f"went backwards by {worst[0]:.3f} at sample {worst[1]}")

    # no curve overshoots its endpoints
    for name, vals in samples.items():
        lo, hi = min(vals), max(vals)
        rt.check(lo >= -0.01 and hi <= DIST + 0.01,
                 f"{name} never overshoots the 0..{DIST:.0f} range",
                 f"range was {lo:.2f}..{hi:.2f}")

    # --- values are held flat outside the keyframe range ---
    before = await rt.resolve(0, 0)
    after = await rt.resolve(0, 1400)
    for name in CURVES:
        rt.near(before[name]["x"], 0.0, 0.01, f"{name} holds 0 before the first keyframe")
        rt.near(after[name]["x"], DIST, 0.01, f"{name} holds {DIST:.0f} after the last keyframe")

    errs = await rt.console_errors()
    rt.check(not errs, "no console errors", str(errs))
    return rt
