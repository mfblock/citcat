"""Text rendering: line breaks, wrapping, alignment, size, typewriter."""

from suites._render_util import scan, render_at


async def run(page, port, load_project):
    rt = await load_project(page, port, "text")
    await render_at(rt, 0, 0)

    # ----------------------------------------------------------- multi-line
    # "LINE ONE\nLINE TWO" at font_size 40, line_height 1.5 -> 60px apart,
    # box origin (100,60), textBaseline "top".
    line1 = await scan(rt, 100, 60, 600, 45)
    line2 = await scan(rt, 100, 120, 600, 45)
    rt.check(line1["lit"] > 50, "explicit \\n: first line renders",
             f"{line1}")
    rt.check(line2["lit"] > 50, "explicit \\n: second line renders on its own row",
             f"{line2}")

    # ------------------------------------------------------------- wrapping
    # WrapOn: 300px-wide box, text_wrap true, long string, font_size 30.
    # Wrapped text must produce ink well below the first line.
    wrap_first = await scan(rt, 100, 340, 300, 40)
    wrap_below = await scan(rt, 100, 385, 300, 215)
    rt.check(wrap_first["lit"] > 0, "wrap on: first line renders", f"{wrap_first}")
    rt.check(wrap_below["lit"] > 0,
             "text_wrap=true wraps a long string onto further lines",
             f"nothing below the first line: {wrap_below}")

    # Wrapped text must also stay inside the box width.
    wrap_overflow = await scan(rt, 405, 340, 595, 260)
    rt.check(wrap_overflow["lit"] == 0,
             "text_wrap=true keeps ink inside the object width",
             f"ink spilled past the box: {wrap_overflow}")

    # WrapOff: same string, wrap false -> one long line, overflows right.
    nowrap_below = await scan(rt, 1100, 385, 300, 215)
    nowrap_over = await scan(rt, 1405, 340, 495, 40)
    rt.check(nowrap_below["lit"] == 0,
             "text_wrap=false does not wrap onto a second line",
             f"{nowrap_below}")
    rt.check(nowrap_over["lit"] > 0,
             "text_wrap=false lets the line overflow the box width",
             f"{nowrap_over}")

    # ------------------------------------------------------------ alignment
    # Identical text "ABC" in identical-height boxes, three alignments.
    # Compare where the ink sits relative to each box's own left edge.
    left = await scan(rt, 100, 900, 600, 80)
    centre = await scan(rt, 800, 900, 600, 80)
    right = await scan(rt, 1450, 900, 400, 80)

    rt.check(left["lit"] > 0 and centre["lit"] > 0 and right["lit"] > 0,
             "all three alignment probes render ink",
             f"left={left['lit']} centre={centre['lit']} right={right['lit']}")

    if left["lit"] and centre["lit"] and right["lit"]:
        rt.check(left["minX"] < 20,
                 "text_align Left puts ink at the box's left edge",
                 f"first ink column {left['minX']}")
        rt.check(200 < centre["minX"] < 400,
                 "text_align Center centres the ink in the box",
                 f"first ink column {centre['minX']} (box is 600 wide)")
        rt.check(right["maxX"] > 380,
                 "text_align Right puts ink at the box's right edge",
                 f"last ink column {right['maxX']} (box is 400 wide)")

    # ------------------------------------------------------------ font size
    small = await scan(rt, 1400, 60, 500, 160)
    await render_at(rt, 0, 1000)
    big = await scan(rt, 1400, 60, 500, 160)
    rt.check(big["lit"] > small["lit"] * 2,
             "font_size keyframe grows the rendered glyphs",
             f"lit pixels {small['lit']} -> {big['lit']}")

    # ----------------------------------------------------------- typewriter
    tw0 = (await rt.resolve(0, 0))["Typewriter"]["typewriter"]
    tw5 = (await rt.resolve(0, 500))["Typewriter"]["typewriter"]
    tw1 = (await rt.resolve(0, 1000))["Typewriter"]["typewriter"]
    rt.near(tw0, 0.0, 0.01, "typewriter progress is 0 at the start")
    rt.near(tw5, 0.5, 0.05, "typewriter progress is ~0.5 halfway")
    rt.near(tw1, 1.0, 0.01, "typewriter progress is 1 at the end")

    await render_at(rt, 0, 0)
    ink0 = await scan(rt, 100, 230, 900, 70)
    await render_at(rt, 0, 500)
    ink5 = await scan(rt, 100, 230, 900, 70)
    await render_at(rt, 0, 1000)
    ink10 = await scan(rt, 100, 230, 900, 70)

    rt.check(ink0["lit"] == 0, "typewriter renders nothing at progress 0", f"{ink0}")
    rt.check(ink10["lit"] > 0, "typewriter renders the full string at progress 1",
             f"{ink10}")
    rt.check(0 < ink5["lit"] < ink10["lit"],
             "typewriter renders partial text halfway",
             f"half={ink5['lit']} full={ink10['lit']}")
    if ink5["lit"] and ink10["lit"]:
        rt.check(ink5["maxX"] < ink10["maxX"],
                 "typewriter reveals left-to-right",
                 f"half reaches x={ink5['maxX']}, full reaches x={ink10['maxX']}")

    # --------------------------------------------------------- line_height
    # Same content and size, line_height 1.0 vs 3.0 -> different row 2 offset.
    tight = await scan(rt, 100, 650, 400, 150)
    loose = await scan(rt, 900, 650, 400, 220)
    rt.check(tight["lit"] > 0 and loose["lit"] > 0,
             "line_height probes both render", f"{tight['lit']} / {loose['lit']}")
    if tight["lit"] and loose["lit"]:
        rt.check(loose["maxY"] > tight["maxY"] + 30,
                 "line_height 3.0 spaces lines further apart than 1.0",
                 f"tight bottom y={tight['maxY']}, loose bottom y={loose['maxY']}")

    # -------------------------------------------------------- empty content
    empty = await scan(rt, 1400, 250, 300, 70)
    rt.check(empty["lit"] == 0, "empty text draws nothing", f"{empty}")

    errs = await rt.console_errors()
    rt.check(not errs, "empty content and text rendering raise no errors", str(errs))
    return rt
