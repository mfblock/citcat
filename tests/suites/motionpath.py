"""Motion paths: bezier evaluation and how it overrides the transform.

runtime.js resolves a path position to the object *centre*:
    transform.x = pos.x - width / 2
    transform.y = pos.y - height / 2
so every expectation below converts between centre and top-left explicitly.
"""

DUR = 1000


def centre(o):
    return o["x"] + o["w"] / 2, o["y"] + o["h"] / 2


async def sample_centres(rt, name, n=20):
    """Centre position at n+1 evenly spaced progress values."""
    out = []
    for i in range(n + 1):
        o = await rt.resolve(0, int(DUR * i / n))
        out.append(centre(o[name]))
    return out


async def run(page, port, load_project):
    rt = await load_project(page, port, "motionpath")

    # ---------------- straight two-point path ----------------
    o = await rt.resolve(0, 0)
    cx, cy = centre(o["StraightPath"])
    rt.near(cx, 100, 0.5, "straight path: centre sits on the first point at progress 0")
    rt.near(cy, 100, 0.5, "straight path: y on the first point at progress 0")

    o = await rt.resolve(0, DUR)
    cx, cy = centre(o["StraightPath"])
    rt.near(cx, 900, 0.5, "straight path: centre sits on the last point at progress 1")
    rt.near(cy, 100, 0.5, "straight path: y on the last point at progress 1")

    o = await rt.resolve(0, DUR // 2)
    cx, cy = centre(o["StraightPath"])
    rt.near(cx, 500, 1.0, "straight path: centre is the midpoint at progress 0.5")
    rt.near(cy, 100, 1.0, "straight path: stays on the line at progress 0.5")

    # the path must override the object's own transform, not offset from it.
    # StraightPath's static transform is (0,0) with a 100x100 box, so a
    # top-left of 50 proves the centre-based override ran.
    rt.near(o["StraightPath"]["x"], 450, 1.0,
            "motion path overrides transform.x by object centre, not top-left")
    rt.near(o["StraightPath"]["y"], 50, 1.0,
            "motion path overrides transform.y by object centre, not top-left")

    # evenly spaced progress gives evenly spaced positions on a straight line
    pts = await sample_centres(rt, "StraightPath")
    steps = [pts[i + 1][0] - pts[i][0] for i in range(len(pts) - 1)]
    spread = max(steps) - min(steps)
    rt.check(spread < 2.0,
             "straight path: arc-length parameterisation gives constant speed",
             f"step sizes ranged {min(steps):.2f}..{max(steps):.2f}")

    # ---------------- diagonal path, both axes ----------------
    o = await rt.resolve(0, DUR // 2)
    cx, cy = centre(o["DiagonalPath"])
    rt.near(cx, 500, 1.0, "diagonal path: x at the midpoint")
    rt.near(cy, 250, 1.0, "diagonal path: y at the midpoint")

    o = await rt.resolve(0, DUR)
    cx, cy = centre(o["DiagonalPath"])
    rt.near(cx, 1000, 0.5, "diagonal path: x reaches the endpoint")
    rt.near(cy, 500, 0.5, "diagonal path: y reaches the endpoint")

    # ---------------- three-point curve ----------------
    o = await rt.resolve(0, 0)
    cx, cy = centre(o["CurvedPath"])
    rt.near(cx, 200, 0.5, "curve: starts on the first point (x)")
    rt.near(cy, 800, 0.5, "curve: starts on the first point (y)")

    o = await rt.resolve(0, DUR)
    cx, cy = centre(o["CurvedPath"])
    rt.near(cx, 1720, 0.5, "curve: ends on the last point (x)")
    rt.near(cy, 800, 0.5, "curve: ends on the last point (y)")

    # the arch is symmetric, so halfway along its length is the middle point
    o = await rt.resolve(0, DUR // 2)
    cx, cy = centre(o["CurvedPath"])
    rt.near(cx, 960, 25, "curve: reaches the middle control point at progress 0.5")
    rt.near(cy, 200, 25, "curve: peak height at progress 0.5")

    # the curve must actually bow away from the straight chord
    rt.check(cy < 500, "curve bows away from the chord between its endpoints",
             f"midpoint y was {cy:.1f}, expected well above (less than) 800")

    curve_pts = await sample_centres(rt, "CurvedPath")

    # continuity: no sample jumps far more than the average step
    dists = [
        ((curve_pts[i + 1][0] - curve_pts[i][0]) ** 2 +
         (curve_pts[i + 1][1] - curve_pts[i][1]) ** 2) ** 0.5
        for i in range(len(curve_pts) - 1)
    ]
    mean = sum(dists) / len(dists)
    rt.check(max(dists) < mean * 3,
             "curve: consecutive samples are continuous (no position jumps)",
             f"largest step {max(dists):.1f}px vs mean {mean:.1f}px")
    rt.check(min(dists) > 0.1,
             "curve: the object actually moves between every sample",
             f"smallest step was {min(dists):.3f}px")

    # x rises monotonically along this arch for monotonic progress
    worst = None
    for i in range(1, len(curve_pts)):
        drop = curve_pts[i - 1][0] - curve_pts[i][0]
        if drop > 0.5 and (worst is None or drop > worst[0]):
            worst = (drop, i)
    rt.check(worst is None, "curve: x advances monotonically along the path",
             "" if worst is None else f"x went back {worst[0]:.2f}px at sample {worst[1]}")

    # y goes up then comes back down - one direction change, not noise
    ys = [p[1] for p in curve_pts]
    turns = sum(
        1 for i in range(1, len(ys) - 1)
        if (ys[i] - ys[i - 1] > 0.5) != (ys[i + 1] - ys[i] > 0.5)
    )
    rt.check(turns <= 2, "curve: y has a single clean turning point",
             f"counted {turns} direction changes in y")

    # ---------------- path present but never driven ----------------
    for t in (0, 500, 1000):
        o = await rt.resolve(0, t)
        rt.near(o["PathNoProgress"]["x"], 700, 0.01,
                f"path without _path_progress keeps static x at {t}ms")
        rt.near(o["PathNoProgress"]["y"], 900, 0.01,
                f"path without _path_progress keeps static y at {t}ms")

    # ---------------- progress present but no path ----------------
    for t in (0, 500, 1000):
        o = await rt.resolve(0, t)
        rt.near(o["ProgressNoPath"]["x"], 300, 0.01,
                f"_path_progress without a path keeps static x at {t}ms")
        rt.near(o["ProgressNoPath"]["y"], 900, 0.01,
                f"_path_progress without a path keeps static y at {t}ms")

    # ---------------- degenerate single-point path ----------------
    for t in (0, 500, 1000):
        o = await rt.resolve(0, t)
        cx, cy = centre(o["SinglePointPath"])
        rt.near(cx, 500, 0.5, f"single-point path pins x at {t}ms")
        rt.near(cy, 500, 0.5, f"single-point path pins y at {t}ms")

    # ---------------- progress is clamped outside 0..1 ----------------
    # keyframes hold their end values, so t past the range must not run off
    o = await rt.resolve(0, 1400)
    cx, _ = centre(o["StraightPath"])
    rt.near(cx, 900, 0.5, "progress clamps at 1 past the last keyframe")

    errs = await rt.console_errors()
    rt.check(not errs, "no console errors", str(errs))
    return rt
