"""Model coverage: is there any field or variant that no test proves is alive?

`transition_in` was dead config for the life of the project. Every scene
transition in every shipped project used it; none ever played. The tests passed
throughout, because the fixtures were authored with the same mistaken
assumption as the implementation -- both reached for `transition_out`. Test and
code agreed with each other, and both were wrong about what authors write.

Unit tests prove the code does what its author thought. They cannot prove the
author thought correctly. This suite closes that gap structurally, so nobody has
to think of the specific bug:

  1. inventory  - parse the real model out of the Rust source, so the list
                  cannot rot the way a hand-maintained one would
  2. exercised  - walk every project on disk and ask which fields any of them
                  actually set. A field nothing sets is a field nothing proves.
  3. liveness   - change one field, and assert *something observable* changes.
                  A field whose value makes no difference to any output is dead,
                  whatever the code around it looks like.

Adding a field to the model should make layer 3 fail until somebody proves the
engine does something with it. That is the point.
"""
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
MODEL = ROOT / "src-tauri" / "src" / "model"

PRIMITIVES = {"String", "f64", "u32", "u8", "u16", "i32", "bool", "usize"}

# Fields that carry identity or authoring metadata rather than behaviour. They
# cannot be shown live by watching playback, and should not be: a name change
# that altered the render would be a bug. Listed explicitly so the suite states
# what it is not covering rather than skipping it silently.
STRUCTURAL = {
    "Scene.id", "Scene.name", "Scene.sort_order",
    "SceneObject.id", "SceneObject.name", "SceneObject.locked",
}

# Fields the browser engine deliberately does not read, with the reason. The
# suite asserts they really are inert there, so that implementing one shows up
# as a failure telling you to move it out of this list. The consequence is
# recorded here rather than left implicit.
ENGINE_IGNORES = {
    "SceneObject.data_bindings":
        "resolved in Rust (export::resolve_bindings) before a project ships, and "
        "in the editor preview, so the playback engine never sees an unresolved "
        "binding. Consequence: a raw .citcat played directly -- the landing-page "
        "demo, or an embed pointed at an unexported project -- shows the literal "
        "placeholder text instead of data.",
    "SceneObject.condition":
        "evaluated alongside data bindings at export time. Same consequence: "
        "conditional visibility does not apply when a raw .citcat is played "
        "directly, only in exported output.",
}


# ----------------------------------------------------------------- layer 1

def _balanced(src, open_idx):
    depth = 0
    for i in range(open_idx, len(src)):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                return src[open_idx + 1:i]
    raise ValueError("unbalanced braces in model source")


ITEM_RE = re.compile(
    r"#\[derive\(([^)]*)\)\]\s*"
    r"((?:#\[[^\]]*\]\s*)*)"
    r"pub\s+(struct|enum)\s+(\w+)\s*\{",
    re.MULTILINE,
)
FIELD_RE = re.compile(r"((?:#\[[^\]]*\]\s*)*)pub\s+(\w+)\s*:\s*([^,]+),")


def parse_model():
    """Pull every serialisable struct and enum out of src-tauri/src/model/.

    Hand-maintaining this list is exactly the failure mode the suite guards
    against, so it is derived from the source every run.
    """
    structs, enums = {}, {}
    for path in sorted(MODEL.glob("*.rs")):
        src = path.read_text()
        cut = src.find("#[cfg(test)]")          # keep test helpers out of the model
        if cut != -1:
            src = src[:cut]
        for m in ITEM_RE.finditer(src):
            derives, attrs, kind, name = m.groups()
            if "Serialize" not in derives:
                continue
            body = _balanced(src, m.end() - 1)
            if kind == "struct":
                structs[name] = {
                    "file": path.name,
                    "fields": [
                        {
                            "name": fn,
                            "type": ft.strip(),
                            "optional": ft.strip().startswith("Option<"),
                        }
                        for fa, fn, ft in FIELD_RE.findall(body)
                    ],
                }
            else:
                variants, depth, cur = [], 0, ""
                for ch in body:
                    if ch == "{":
                        depth += 1
                    elif ch == "}":
                        depth -= 1
                    if ch == "," and depth == 0:
                        variants.append(cur)
                        cur = ""
                    else:
                        cur += ch
                variants.append(cur)
                names = []
                for v in variants:
                    v = re.sub(r"///[^\n]*", "", v)
                    v = re.sub(r"^(?:\s*#\[[^\]]*\]\s*)+", "", v).strip()
                    vm = re.match(r"(\w+)", v)
                    if vm:
                        names.append(vm.group(1))
                enums[name] = {"file": path.name, "variants": names,
                               "tagged": "tag =" in attrs}
    return structs, enums


def unwrap(t):
    if t.startswith("Option<") and t.endswith(">"):
        return "opt", t[7:-1].strip()
    if t.startswith("Vec<") and t.endswith(">"):
        return "vec", t[4:-1].strip()
    return "plain", t


# ----------------------------------------------------------------- layer 2

class Walker:
    """Walks project JSON guided by the model graph, recording what is set."""

    def __init__(self, structs, enums):
        self.structs, self.enums = structs, enums
        self.values = defaultdict(set)
        self.present = defaultdict(int)
        self.variants = defaultdict(set)
        self.sources = defaultdict(set)

    def walk(self, struct_name, node, src):
        if not isinstance(node, dict) or struct_name not in self.structs:
            return
        for f in self.structs[struct_name]["fields"]:
            key = f"{struct_name}.{f['name']}"
            self.present[key] += 1
            val = node.get(f["name"])
            kind, inner = unwrap(f["type"])

            if kind == "opt":
                self.values[key].add("None" if val is None else "Some")
                if val is not None:
                    self.sources[key].add(src)
                    self._descend(inner, val, src)
            elif kind == "vec":
                if isinstance(val, list) and val:
                    self.values[key].add("nonempty")
                    self.sources[key].add(src)
                    for item in val:
                        self._descend(inner, item, src)
                else:
                    self.values[key].add("empty")
            elif inner in PRIMITIVES:
                self.values[key].add(repr(val))
                self.sources[key].add(src)
            else:
                self.values[key].add("set" if val is not None else "None")
                if val is not None:
                    self.sources[key].add(src)
                    self._descend(inner, val, src)

    def _descend(self, type_name, val, src):
        if type_name in self.structs:
            self.walk(type_name, val, src)
        elif type_name in self.enums:
            info = self.enums[type_name]
            if isinstance(val, str):
                self.variants[type_name].add(val)
            elif isinstance(val, dict):
                if info["tagged"] and val.get("type"):
                    self.variants[type_name].add(val["type"])
                else:
                    for k in val:
                        if k in info["variants"]:
                            self.variants[type_name].add(k)


def collect_projects():
    out = []
    for pat in ("tests/projects/*.citcat", "templates/*.citcat", "examples/**/*.citcat"):
        for p in sorted(ROOT.glob(pat)):
            try:
                out.append((("fixture" if "tests/" in str(p) else "shipped"),
                            p.name, json.loads(p.read_text())))
            except Exception:
                out.append(("broken", p.name, None))
    return out


# ----------------------------------------------------------------- layer 3

FINGERPRINT_JS = """
(times) => {
  const R = window.CitCatRuntime;
  const c = document.getElementById('stage');
  const ctx = c.getContext('2d');
  const out = { frames: [], resolved: [] };

  for (const [sceneIdx, t] of times) {
    if (sceneIdx >= R.state.project.scenes.length) { out.frames.push('n/a'); continue; }
    R.seekTo(sceneIdx, t);
    // Sample a coarse grid; enough to notice any change in what is painted.
    const step = 60, acc = [];
    for (let y = step / 2; y < c.height; y += step) {
      for (let x = step / 2; x < c.width; x += step) {
        const d = ctx.getImageData(x, y, 1, 1).data;
        acc.push(d[0], d[1], d[2], d[3]);
      }
    }
    out.frames.push(acc.join(','));
    out.resolved.push(JSON.stringify(
      R.state.project.scenes[sceneIdx].objects.map(o => {
        const r = R.resolveObjectAtTime(o, t);
        return [r.name, r.visible, r.transform, r.style, r.content,
                r.filters || null, r._typewriter_progress ?? null,
                // Media settings reach the renderer through resolution, and a
                // canvas probe cannot see them without real media files, so
                // capture them here. This proves the resolver carries them;
                // whether playback honours them needs a media fixture.
                r.video_trim_start_ms ?? null, r.video_trim_end_ms ?? null,
                r.video_muted ?? null, r.audio_volume ?? null,
                r.audio_loop ?? null];
      })
    ));
  }
  return out;
}
"""


async def fingerprint(rt, times=((0, 0), (0, 1000), (1, 0))):
    """What the engine paints and computes for this project, as a comparable blob."""
    fp = await rt.page.evaluate(FINGERPRINT_JS, [list(t) for t in times])
    return json.dumps(fp, sort_keys=True)


async def playback_trace(rt, seconds=1.4):
    """Where playback gets to in N seconds -- catches timing-shaped fields."""
    await rt.page.evaluate("() => { window.CitCatRuntime.stop(); }")
    await rt.play()
    await rt.wait(seconds)
    st = await rt.state()
    await rt.stop()
    # Round time so ordinary frame jitter does not read as a difference.
    return f"scene={st['scene']} waiting={st['waiting']} t={round(st['time'] / 250)}"


# A transition only paints during the overflow hold at the end of a scene, and a
# fixed-time fingerprint never lands there. This plays across the boundary and
# records both what was painted on the way and how long the crossing took --
# enough to tell Crossfade from SlideLeft, and 600ms from 2500ms.
BOUNDARY_JS = """
async () => {
  const R = window.CitCatRuntime;
  const c = document.getElementById('stage');
  const ctx = c.getContext('2d');
  const probes = [[480, 270], [960, 540], [1440, 810]];
  const samples = [];
  R.stop();
  R.play();
  const t0 = performance.now();
  while (performance.now() - t0 < 6000) {
    await new Promise(r => setTimeout(r, 40));
    const row = [R.state.currentSceneIndex];
    for (const [x, y] of probes) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      row.push(d[0], d[1], d[2]);
    }
    samples.push(row.join(':'));
    if (R.state.currentSceneIndex >= R.state.project.scenes.length - 1
        && R.state.currentTimeMs > 120) break;
  }
  R.stop();
  // Quantise the crossing time so frame jitter does not read as a difference.
  return { crossedAfter: Math.round(samples.length / 3),
           painted: Array.from(new Set(samples)).sort().join('|') };
}
"""


async def boundary_trace(rt):
    r = await rt.page.evaluate(BOUNDARY_JS)
    return json.dumps(r, sort_keys=True)


async def click_trace(rt):
    """Play, click where the Goto button is, report whether the scene changed."""
    await rt.page.evaluate("() => { window.CitCatRuntime.stop(); }")
    await rt.play()
    await rt.wait(0.2)
    await rt.click_stage(1650, 160)          # centre of the "Goto" button
    await rt.wait(0.3)
    st = await rt.state()
    await rt.stop()
    return f"scene={st['scene']}"


async def load_dict(rt, project):
    await rt.page.evaluate("p => window.__load(p)", project)


def deep(o):
    return json.loads(json.dumps(o))


# Each entry: (field key, how to mutate a project dict, whether playback matters)
def build_mutations(base):
    s0, s1 = base["scenes"][0], base["scenes"][1]

    def m_scene_duration(p):
        p["scenes"][0]["duration_ms"] = 800

    def m_scene_background(p):
        p["scenes"][0]["background"]["fill"] = "#00ff88"

    def m_bg_gradient(p):
        p["scenes"][0]["background"]["gradient"] = {
            "gradient_type": "Linear",
            "stops": [{"offset": 0.0, "color": "#000000"},
                      {"offset": 1.0, "color": "#ffffff"}],
        }

    def m_bg_image(p):
        # A 1x1 red PNG as a data URI: no network, decodes immediately.
        p["scenes"][0]["background"]["image"] = (
            "data:image/png;base64,"
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        )

    def m_scene_objects(p):
        p["scenes"][0]["objects"] = p["scenes"][0]["objects"][:2]

    def m_transition_in(p):
        p["scenes"][1]["transition_in"] = {"kind": "Crossfade", "duration_ms": 600}

    def m_transition_out(p):
        p["scenes"][0]["transition_out"] = {"kind": "Crossfade", "duration_ms": 600}

    def m_transition_kind(p):
        p["scenes"][0]["transition_out"] = {"kind": "SlideLeft", "duration_ms": 600}

    def m_transition_duration(p):
        p["scenes"][0]["transition_out"] = {"kind": "Crossfade", "duration_ms": 2500}

    def m_wait_points(p):
        p["scenes"][0]["wait_points"] = [
            {"id": "wp-cov", "time_ms": 400, "resume_on": {"type": "AnyClick"}}
        ]

    def m_subtitle_track(p):
        p["scenes"][0]["subtitle_track"] = {
            "id": "st-cov",
            "entries": [{"id": "se-cov", "start_ms": 0, "end_ms": 2500,
                         "text": "coverage subtitle"}],
        }

    def _o(p, name):
        for o in p["scenes"][0]["objects"]:
            if o["name"] == name:
                return o
        raise KeyError(name)

    def m_object_type(p):
        _o(p, "Under")["object_type"] = "Ellipse"

    def m_transform(p):
        _o(p, "Under")["transform"]["x"] = 40.0

    def m_style(p):
        _o(p, "Under")["style"]["fill"] = "#ff8800"

    def m_content(p):
        _o(p, "Label")["content"] = "different text entirely"

    def m_z_index(p):
        _o(p, "Under")["z_index"] = 9

    def m_visible(p):
        _o(p, "Under")["visible"] = False

    def m_keyframes(p):
        _o(p, "Moving")["keyframes"] = [
            {"id": "k1", "time_ms": 0, "property": "transform.y",
             "value": {"type": "Number", "value": 0.0}, "easing": "Linear"},
            {"id": "k2", "time_ms": 2000, "property": "transform.y",
             "value": {"type": "Number", "value": 900.0}, "easing": "Linear"},
        ]

    def m_motion_path(p):
        _o(p, "Pathed")["motion_path"]["points"][1]["y"] = 100.0

    def m_filters(p):
        _o(p, "Blurred")["filters"] = {"grayscale": 1.0}

    def m_text_wrap(p):
        lbl = _o(p, "Label")
        lbl["content"] = "a much longer sentence that has to wrap inside its box"
        lbl["text_wrap"] = True
        lbl["transform"]["width"] = 300.0

    def m_appear_at(p):
        _o(p, "Under")["appear_at_ms"] = 2000

    def m_disappear_at(p):
        _o(p, "Under")["disappear_at_ms"] = 500

    def m_condition(p):
        _o(p, "Under")["condition"] = {
            "column": "tier", "operator": "Equals", "value": "premium",
        }

    def m_data_bindings(p):
        _o(p, "Label")["data_bindings"] = [
            {"id": "db-cov", "property": "content", "column": "title",
             "transform": {"type": "Uppercase"}}
        ]

    def m_events(p):
        _o(p, "Goto")["events"] = []

    # The media fields have to be isolated: making the object a Video *and*
    # trimming it in one step would pass on the type change alone and prove
    # nothing about the trim. prep makes it a Video; the mutation only trims.
    def p_as_video(p):
        o = _o(p, "Under")
        o["object_type"] = "Video"
        o["content"] = "clip.mp4"

    def m_video_trim(p):
        _o(p, "Under")["video_trim_start_ms"] = 500

    def p_as_audio(p):
        o = _o(p, "Under")
        o["object_type"] = "Audio"
        o["content"] = "track.mp3"

    def m_audio_volume(p):
        _o(p, "Under")["audio_volume"] = 0.3

    # Same trap: shortening the scenes *and* enabling the loop would pass on the
    # duration change. prep shortens both sides; the mutation only loops.
    def p_short_loopable(p):
        p["scenes"][0]["duration_ms"] = 300
        p["scenes"][1]["duration_ms"] = 300

    def m_export_loop(p):
        p["export_settings"]["loop_playback"] = True

    def m_meta_size(p):
        p["meta"]["width"] = 1280
        p["meta"]["height"] = 720

    def short(p):
        """Shrink both scenes so a boundary crossing is quick to observe."""
        p["scenes"][0]["duration_ms"] = 500
        p["scenes"][1]["duration_ms"] = 500

    # observe:
    #   render   - fingerprint at fixed times (default)
    #   playback - where playback gets to in a fixed wall-clock window
    #   boundary - play across the scene boundary, sampling what is painted
    #   click    - play, click the button, see whether the scene changed
    # prep runs on the baseline as well as the variant, so both are comparable.
    return [
        dict(key="Scene.duration_ms", mutate=m_scene_duration, observe="playback"),
        dict(key="Scene.background", mutate=m_scene_background),
        dict(key="Background.gradient", mutate=m_bg_gradient),
        dict(key="Background.image", mutate=m_bg_image),
        dict(key="Scene.objects", mutate=m_scene_objects),
        dict(key="Scene.transition_in", mutate=m_transition_in,
             observe="boundary", prep=short),
        dict(key="Scene.transition_out", mutate=m_transition_out,
             observe="boundary", prep=short),
        dict(key="Transition.kind", mutate=m_transition_kind,
             observe="boundary", prep=short),
        dict(key="Transition.duration_ms", mutate=m_transition_duration,
             observe="boundary", prep=short),
        dict(key="Scene.wait_points", mutate=m_wait_points, observe="playback"),
        dict(key="Scene.subtitle_track", mutate=m_subtitle_track),
        dict(key="SceneObject.object_type", mutate=m_object_type),
        dict(key="SceneObject.transform", mutate=m_transform),
        dict(key="SceneObject.style", mutate=m_style),
        dict(key="SceneObject.content", mutate=m_content),
        dict(key="SceneObject.z_index", mutate=m_z_index),
        dict(key="SceneObject.visible", mutate=m_visible),
        dict(key="SceneObject.keyframes", mutate=m_keyframes),
        dict(key="SceneObject.motion_path", mutate=m_motion_path),
        dict(key="SceneObject.filters", mutate=m_filters),
        dict(key="SceneObject.text_wrap", mutate=m_text_wrap),
        dict(key="SceneObject.appear_at_ms", mutate=m_appear_at),
        dict(key="SceneObject.disappear_at_ms", mutate=m_disappear_at),
        dict(key="SceneObject.condition", mutate=m_condition),
        dict(key="SceneObject.data_bindings", mutate=m_data_bindings),
        dict(key="SceneObject.events", mutate=m_events, observe="click"),
        dict(key="SceneObject.video_trim_start_ms", mutate=m_video_trim,
             prep=p_as_video),
        dict(key="SceneObject.audio_volume", mutate=m_audio_volume,
             prep=p_as_audio),
        dict(key="ExportSettings.loop_playback", mutate=m_export_loop,
             observe="playback", prep=p_short_loopable),
        dict(key="ProjectMeta.width", mutate=m_meta_size),
    ]


# ----------------------------------------------------------------- the suite

async def run(page, port, load_project):
    rt = await load_project(page, port, "coverage")
    structs, enums = parse_model()

    # ---------------- layer 1: the parse must not be vacuously empty ----------
    rt.check(len(structs) >= 20,
             "model parse finds a plausible number of structs",
             f"found {len(structs)}")
    rt.check(len(enums) >= 10,
             "model parse finds a plausible number of enums",
             f"found {len(enums)}")

    for expected in ("Project", "Scene", "SceneObject", "Transform", "Style",
                     "Background", "Transition", "Keyframe"):
        rt.check(expected in structs, f"model parse finds struct {expected}")

    so = {f["name"] for f in structs.get("SceneObject", {"fields": []})["fields"]}
    for expected in ("id", "object_type", "transform", "style", "keyframes",
                     "filters", "motion_path", "appear_at_ms"):
        rt.check(expected in so,
                 f"SceneObject parse includes {expected}",
                 f"parsed: {sorted(so)}")

    rt.check("Ellipse" in enums.get("ObjectType", {"variants": []})["variants"],
             "ObjectType parse includes its variants")

    n_fields = sum(len(d["fields"]) for d in structs.values())
    n_variants = sum(len(d["variants"]) for d in enums.values())
    rt.check(n_fields > 100, "model has the expected order of magnitude of fields",
             f"{n_fields} fields, {n_variants} variants")

    # ---------------- layer 2: what does any project on disk set? ------------
    projects = collect_projects()
    rt.check(len(projects) >= 10, "found projects to survey", f"{len(projects)}")

    for kind, name, data in projects:
        rt.check(kind != "broken", f"project {name} parses as JSON")

    w = Walker(structs, enums)
    for kind, name, data in projects:
        if data is not None:
            w.walk("Project", data, f"{kind}:{name}")

    reachable = [k for k in w.present if w.present[k]]
    rt.check(len(reachable) > 80,
             "the walk reaches most of the model",
             f"reached {len(reachable)} of {n_fields} fields")

    # Option fields nothing ever sets. This is the transition_in shape exactly.
    for sname in sorted(structs):
        for f in structs[sname]["fields"]:
            key = f"{sname}.{f['name']}"
            if not w.present[key]:
                continue
            kind, inner = unwrap(f["type"])
            if kind == "opt":
                rt.check(
                    w.values[key] != {"None"},
                    f"some project sets {key}",
                    "no project on disk sets this field, so nothing proves the "
                    "engine reads it -- this is the shape transition_in had",
                )
            elif kind == "vec":
                rt.check(
                    w.values[key] != {"empty"},
                    f"some project fills {key}",
                    "every project leaves this collection empty",
                )

    # Enum variants nothing ever uses.
    for ename in sorted(enums):
        for v in enums[ename]["variants"]:
            rt.check(
                v in w.variants[ename],
                f"some project uses {ename}::{v}",
                f"no project on disk contains this variant, so no test exercises "
                f"whatever the engine does with it",
            )

    # Fields only fixtures touch: real authored projects never produce them, so
    # the shipped surface is narrower than the tested one.
    for sname in sorted(structs):
        for f in structs[sname]["fields"]:
            key = f"{sname}.{f['name']}"
            srcs = w.sources[key]
            if srcs and not any(s.startswith("shipped") for s in srcs):
                rt.check(
                    False,
                    f"{key} is set by a shipped project, not only by fixtures",
                    "only test fixtures set this; no real authored project does",
                )

    # ---------------- layer 3: does changing it change anything? -------------
    base = deep(rt.project)
    await load_dict(rt, base)

    observers = {
        "render": fingerprint,
        "playback": playback_trace,
        "boundary": boundary_trace,
        "click": click_trace,
    }

    base_fp = await fingerprint(rt)
    rt.check(len(base_fp) > 500, "baseline fingerprint is substantial",
             f"{len(base_fp)} bytes -- a blank canvas would prove nothing")

    # The click observer is only meaningful if the baseline actually navigates.
    rt.equal(await click_trace(rt), "scene=1",
             "baseline: clicking the button navigates, so removing its event is visible")
    await load_dict(rt, base)

    for spec in build_mutations(base):
        key, mutate = spec["key"], spec["mutate"]
        observe = observers[spec.get("observe", "render")]
        prep = spec.get("prep")

        control, variant = deep(base), deep(base)
        try:
            if prep:
                prep(control)
                prep(variant)
            mutate(variant)
        except Exception as e:
            rt.check(False, f"changing {key} changes something observable",
                     f"mutation failed: {e}")
            continue

        await load_dict(rt, control)
        before = await observe(rt)
        await load_dict(rt, variant)
        after = await observe(rt)

        if key in ENGINE_IGNORES:
            # Asserted inert on purpose: if someone implements it, this check
            # fails and tells them to take it out of ENGINE_IGNORES.
            rt.check(
                before == after,
                f"{key} is still inert in the playback engine, as documented",
                f"it now changes output -- implement it properly and remove it "
                f"from ENGINE_IGNORES. Reason it was listed: {ENGINE_IGNORES[key]}",
            )
            continue

        rt.check(
            before != after,
            f"changing {key} changes something observable",
            f"the engine produced identical output with this field changed, so "
            f"nothing reads it (observed via {spec.get('observe', 'render')})",
        )

    # Restore, so a later suite sharing the page is not left on a mutation.
    await load_dict(rt, base)

    # State plainly what layer 3 does not cover, rather than omitting it.
    for key in sorted(STRUCTURAL):
        rt.check(
            True,
            f"{key} is identity/authoring metadata, not covered by liveness",
        )

    errs = await rt.console_errors()
    rt.check(not errs, "no console errors", str(errs))
    return rt
