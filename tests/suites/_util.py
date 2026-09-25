"""Small helpers shared by the interaction suites."""
import time


async def poll(fn, pred, timeout=6.0, interval=0.05):
    """Call fn() until pred(value) is true. Returns (value, elapsed_seconds).

    Polls instead of sleeping a fixed amount, so timing-sensitive tests stay
    reliable on a slow machine without loosening the assertion itself.
    """
    start = time.monotonic()
    value = None
    while time.monotonic() - start < timeout:
        value = await fn()
        if pred(value):
            return value, time.monotonic() - start
        import asyncio
        await asyncio.sleep(interval)
    return value, time.monotonic() - start


async def wait_for_scene(rt, index, timeout=6.0):
    """Wait until the runtime reaches a scene index. Returns elapsed seconds."""
    _, elapsed = await poll(rt.state, lambda s: s and s["scene"] == index, timeout)
    return elapsed


async def wait_until_waiting(rt, timeout=6.0):
    _, elapsed = await poll(rt.state, lambda s: s and s["waiting"], timeout)
    return elapsed


async def stage_to_client(rt, x, y):
    return await rt.page.evaluate("([x,y]) => window.__stageToClient(x,y)", [x, y])


async def move_to_stage(rt, x, y, steps=1):
    pt = await stage_to_client(rt, x, y)
    await rt.page.mouse.move(pt["x"], pt["y"], steps=steps)


async def effective_visible(rt, obj_id):
    """Visibility as the renderer sees it: runtime override, else the base value."""
    return await rt.page.evaluate(
        """(id) => {
            const R = window.CitCatRuntime;
            const v = R.getRuntimeVisibility(id);
            if (v !== null) return v;
            const sc = R.state.project.scenes[R.state.currentSceneIndex];
            const o = sc.objects.find(o => o.id === id);
            return o ? o.visible : null;
        }""",
        obj_id,
    )


async def runtime_visibility_raw(rt, obj_id):
    """Only the runtime override (null when no event has touched it)."""
    return await rt.page.evaluate(
        "(id) => window.CitCatRuntime.getRuntimeVisibility(id)", obj_id
    )


async def transition_state(rt):
    """getTransitionState() without dragging whole resolved scenes over the bridge."""
    return await rt.page.evaluate(
        """() => {
            const t = window.CitCatRuntime.getTransitionState();
            if (!t) return null;
            return {
                kind: t.kind,
                progress: t.progress,
                hasOutgoing: !!t.outgoingScene,
                hasIncoming: !!t.incomingScene,
                outgoingName: t.outgoingScene ? t.outgoingScene.name : null,
                incomingName: t.incomingScene ? t.incomingScene.name : null,
            };
        }"""
    )


async def restart_at(rt, scene_index):
    """Clean slate on one scene: stop (resets fired timers/wait points), seek, play."""
    await rt.stop()
    await rt.seek(scene_index, 0)
    await rt.play()
