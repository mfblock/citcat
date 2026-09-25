"""Gradient fills, gradient strokes, and colour alpha (D7).

Rendering features, so almost everything here samples canvas pixels. A resolved
struct value proves the data survived the resolver, not that anything was
painted -- which is exactly how the engine shipped for months with no `case
"Svg"` and with gradient backgrounds silently flattened.
"""
import asyncio


async def _settle(ms=250):
    await asyncio.sleep(ms / 1000)


def _grey(px):
    """Mean channel value, for ramps built from black->white."""
    return (px["r"] + px["g"] + px["b"]) / 3


async def run(page, port, load_project):
    rt = await load_project(page, port, "gradients")

    # ================= 1. a gradient actually paints a ramp =================
    await rt.seek(0, 0)
    await _settle()

    # LinearFill: black->white, top to bottom, box (100,100) 400x200
    top = await rt.sample(300, 110)
    mid = await rt.sample(300, 200)
    bot = await rt.sample(300, 290)

    rt.check(top["r"] < 60, "linear gradient fill starts dark", f"got {top}")
    rt.check(bot["r"] > 195, "linear gradient fill ends light", f"got {bot}")
    rt.check(
        _grey(top) < _grey(mid) < _grey(bot),
        "linear gradient fill ramps monotonically across the object",
        f"top={_grey(top):.0f} mid={_grey(mid):.0f} bottom={_grey(bot):.0f}",
    )
    # The regression guard: before D7 this object painted its flat #ff0000.
    rt.check(
        not (mid["r"] > 200 and mid["g"] < 40 and mid["b"] < 40),
        "gradient fill is not silently replaced by the flat fill",
        f"midpoint {mid} is the fallback colour #ff0000",
    )

    # Radial: white centre, black edge, box (600,100) 400x200
    rcentre = await rt.sample(800, 200)
    redge = await rt.sample(610, 200)
    rt.check(
        _grey(rcentre) > _grey(redge) + 60,
        "radial gradient fill is lighter at its centre than at its edge",
        f"centre={_grey(rcentre):.0f} edge={_grey(redge):.0f}",
    )

    # Ellipse takes a gradient too, not just Rect.
    ell_top = await rt.sample(1250, 410)
    ell_bot = await rt.sample(1250, 590)
    rt.check(
        _grey(ell_bot) > _grey(ell_top) + 60,
        "an Ellipse paints a gradient fill",
        f"top={_grey(ell_top):.0f} bottom={_grey(ell_bot):.0f}",
    )

    # ================= 2. fallback and robustness =================
    # One stop is not paintable -> the flat fill stands.
    one = await rt.sample(1250, 200)
    rt.check(
        one["g"] > 200 and one["r"] < 60,
        "a gradient with fewer than two stops falls back to the flat fill",
        f"got {one}, expected the flat #00ff00",
    )

    # Unsorted and out-of-range offsets must not throw, and must render in
    # offset order once clamped and sorted.
    u_top = await rt.sample(300, 410)
    u_bot = await rt.sample(300, 590)
    rt.check(
        _grey(u_bot) > _grey(u_top) + 60,
        "unsorted, out-of-range stops are clamped and sorted rather than throwing",
        f"top={_grey(u_top):.0f} bottom={_grey(u_bot):.0f}",
    )

    # A gradient stroke paints. 40px stroke centred on the box edge of
    # (600,400) 400x200, so y=400 sits in the middle of the top stroke band.
    s_left = await rt.sample(620, 400)
    rt.check(
        s_left["a"] > 0 and not (s_left["r"] > 200 and s_left["g"] < 40),
        "a gradient stroke paints, and is not the flat stroke colour",
        f"got {s_left}",
    )

    # ================= 3. angle rotates the ramp =================
    await rt.seek(1, 0)
    await _settle()

    # Angle0 box (100,100) 400x400: vertical ramp, so left and right of a row match.
    a0_l = await rt.sample(150, 300)
    a0_r = await rt.sample(450, 300)
    rt.near(_grey(a0_l), _grey(a0_r), 12,
            "at angle 0 the ramp runs top to bottom, so a row is uniform")

    # Angle90 box (700,100) 400x400: horizontal ramp, so that row varies.
    a90_l = await rt.sample(750, 300)
    a90_r = await rt.sample(1050, 300)
    rt.check(
        abs(_grey(a90_l) - _grey(a90_r)) > 120,
        "at angle 90 the ramp runs across the object, so a row varies",
        f"left={_grey(a90_l):.0f} right={_grey(a90_r):.0f}",
    )
    # 90 degrees clockwise from 'down' points left, so the dark end is on the right.
    rt.check(
        _grey(a90_l) > _grey(a90_r),
        "angle 90 sweeps clockwise from top-to-bottom, putting the first stop on the right",
        f"left={_grey(a90_l):.0f} right={_grey(a90_r):.0f}",
    )

    # ================= 4. alpha composites =================
    await rt.seek(2, 0)
    await _settle()

    # 50% white over a red backdrop -> roughly half way to white.
    half = await rt.sample(250, 250)
    rt.check(
        half["r"] > 230 and 90 < half["g"] < 165 and 90 < half["b"] < 165,
        "a #rrggbbaa fill composites against what is behind it",
        f"got {half}; opaque white would be 255/255/255, no alpha would be 255/0/0",
    )

    # opacity 0.5 x alpha 0.5 -> about a quarter of the way to white.
    both = await rt.sample(750, 250)
    rt.check(
        40 < both["g"] < 105,
        "colour alpha and transform.opacity compose rather than one winning",
        f"got {both}; expected roughly 25% coverage over red",
    )
    rt.check(
        both["g"] < half["g"],
        "opacity 0.5 over a 50% alpha fill is fainter than the alpha alone",
        f"both={both['g']} halfAlphaOnly={half['g']}",
    )

    # A gradient fading to fully transparent shows the backdrop at its far end.
    # Box (1100,100) 400x300, angle 0, so the ramp runs down the y axis --
    # sample top and bottom, not two points on one row.
    f_near = await rt.sample(1300, 110)
    f_far = await rt.sample(1300, 390)
    rt.check(
        f_near["g"] > 180,
        "a gradient's opaque end covers the backdrop",
        f"got {f_near}",
    )
    rt.check(
        f_far["r"] > 200 and f_far["g"] < 70,
        "a gradient stop at zero alpha lets the backdrop through",
        f"got {f_far}, expected the red backdrop",
    )

    # ================= 5. animation =================
    await rt.seek(3, 0)
    await _settle()

    # Colour alpha must pass through the middle, not jump. Over a black
    # background, a fading red reads as a darkening red.
    a_start = await rt.sample(250, 250)
    await rt.seek(3, 500)
    await _settle(120)
    a_mid = await rt.sample(250, 250)
    await rt.seek(3, 1000)
    await _settle(120)
    a_end = await rt.sample(250, 250)

    rt.check(a_start["r"] > 200, "alpha animation starts opaque", f"got {a_start}")
    rt.check(a_end["r"] < 60, "alpha animation ends transparent", f"got {a_end}")
    rt.check(
        a_start["r"] > a_mid["r"] > a_end["r"],
        "interpolating #ff0000ff -> #ff000000 passes through partial alpha",
        f"start={a_start['r']} mid={a_mid['r']} end={a_end['r']}; "
        f"the old six-digit colour maths dropped alpha and jumped",
    )

    # Gradient keyframes: black->white becomes white->black, so the ramp flips.
    async def grad_anim_delta(t):
        await rt.seek(3, t)
        await _settle(120)
        t_px = await rt.sample(800, 110)
        b_px = await rt.sample(800, 390)
        return _grey(b_px) - _grey(t_px)

    d0 = await grad_anim_delta(0)
    d500 = await grad_anim_delta(500)
    d1000 = await grad_anim_delta(1000)

    rt.check(d0 > 100, "gradient animation starts with a dark-to-light ramp", f"delta={d0:.0f}")
    rt.check(d1000 < -100, "gradient animation ends with a light-to-dark ramp", f"delta={d1000:.0f}")
    rt.check(
        d0 > d500 > d1000,
        "a gradient keyframe animates, shifting the ramp over time",
        f"deltas: 0ms={d0:.0f} 500ms={d500:.0f} 1000ms={d1000:.0f}",
    )
    rt.check(
        abs(d500) < 60,
        "a gradient at the midpoint of its animation is roughly flat",
        f"delta={d500:.0f}",
    )

    # Mismatched stop counts snap rather than blending into garbage.
    objs = await rt.resolve(3, 400)
    snap = objs["GradSnap"]["fill_gradient"] if "fill_gradient" in objs["GradSnap"] else None
    stops_mid = await rt.page.evaluate("""() => {
        const R = window.CitCatRuntime;
        const sc = R.state.project.scenes[3];
        const o = sc.objects.find(o => o.name === 'GradSnap');
        const r = R.resolveObjectAtTime(o, 400);
        return r.style.fill_gradient.stops.map(s => s.color);
    }""")
    rt.equal(
        stops_mid, ["#000000", "#ffffff"],
        "mismatched stop counts hold the earlier gradient rather than blending",
    )
    stops_end = await rt.page.evaluate("""() => {
        const R = window.CitCatRuntime;
        const sc = R.state.project.scenes[3];
        const o = sc.objects.find(o => o.name === 'GradSnap');
        const r = R.resolveObjectAtTime(o, 1000);
        return r.style.fill_gradient.stops.length;
    }""")
    rt.equal(stops_end, 3, "the mismatched gradient snaps at the later keyframe")

    # ================= 6. colour maths, directly =================
    maths = await rt.page.evaluate("""() => {
        const R = window.CitCatRuntime;
        return {
            three:    R.parseColor('#f80'),
            six:      R.parseColor('#ff8000'),
            eight:    R.parseColor('#ff000080'),
            bad:      R.parseColor('transparent'),
            short:    R.parseColor('#12345'),
            fmtOpaque:      R.formatColor({r:255,g:128,b:0,a:255}),
            fmtTranslucent: R.formatColor({r:255,g:0,b:0,a:128}),
            lerpAlpha: R.lerpColor('#ff0000ff', '#ff000000', 0.5),
            lerpRgb:   R.lerpColor('#000000', '#ffffff', 0.5),
            lerpMixed: R.lerpColor('#ff0000', '#ff000000', 0.5),
            lerpBad:   R.lerpColor('transparent', '#ff0000', 0.5),
        };
    }""")

    rt.equal(maths["three"], {"r": 255, "g": 136, "b": 0, "a": 255},
             "#rgb shorthand doubles nibbles rather than zero-padding")
    rt.equal(maths["six"], {"r": 255, "g": 128, "b": 0, "a": 255},
             "#rrggbb parses as fully opaque")
    rt.equal(maths["eight"], {"r": 255, "g": 0, "b": 0, "a": 128},
             "#rrggbbaa parses its alpha byte")
    rt.equal(maths["bad"], None,
             "'transparent' is not a hex colour and must not parse as black")
    rt.equal(maths["short"], None, "a five-digit string is not a colour")
    rt.equal(maths["fmtOpaque"], "#ff8000",
             "an opaque colour still formats as six digits")
    rt.equal(maths["fmtTranslucent"], "#ff000080",
             "a translucent colour formats as eight digits")
    rt.equal(maths["lerpRgb"], "#808080", "opaque endpoints blend and stay opaque")
    rt.check(
        maths["lerpAlpha"].lower() in ("#ff000080", "#ff00007f"),
        "alpha blends as a fourth channel",
        f"got {maths['lerpAlpha']}; the old code returned #ff0000",
    )
    rt.check(
        len(maths["lerpMixed"]) == 9,
        "a six-digit and an eight-digit colour blend to a translucent result",
        f"got {maths['lerpMixed']}",
    )
    rt.equal(maths["lerpBad"], "transparent",
             "an unparseable colour holds rather than fading through black")

    # ================= 7. resolving must not mutate the source =================
    mutated = await rt.page.evaluate("""() => {
        const R = window.CitCatRuntime;
        const sc = R.state.project.scenes[3];
        const o = sc.objects.find(o => o.name === 'GradAnim');
        const before = JSON.stringify(o.keyframes);
        const r = R.resolveObjectAtTime(o, 0);
        r.style.fill_gradient.stops[0].color = '#123456';
        r.style.fill_gradient.angle = 999;
        return before === JSON.stringify(o.keyframes);
    }""")
    rt.check(mutated, "resolving a gradient does not share state with the project",
             "mutating the resolved gradient wrote back into the source keyframes")

    # ================= 8. parity with the editor renderer =================
    # canvas.js is not loaded by the harness page (it needs the whole editor
    # shell), so this compares implementations by source rather than by pixels.
    parity = await rt.page.evaluate("""() => {
        const R = window.CitCatRuntime;
        return ['buildCanvasGradient','gradientFillStyle','gradientStrokeStyle',
                'isPaintableGradient','paintableStops','boxOf','parseColor',
                'formatColor','lerpColor']
               .filter(k => typeof R[k] !== 'function');
    }""")
    rt.check(
        not parity,
        "the engine exports the gradient and colour helpers canvas.js calls",
        f"missing: {parity}",
    )

    errs = await rt.console_errors()
    rt.check(not errs, "no console errors", str(errs))
    return rt
