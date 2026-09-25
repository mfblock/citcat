use tauri::State;

use std::fs;
use std::path::PathBuf;

use crate::model::{
    Easing, EffectCategory, EffectPreset, Keyframe, KeyframeValue, ObjectType,
};
use crate::state::AppState;

fn all_types() -> Vec<ObjectType> {
    vec![
        ObjectType::Text,
        ObjectType::Rect,
        ObjectType::Ellipse,
        ObjectType::Image,
        ObjectType::Svg,
        ObjectType::Button,
        ObjectType::Hotspot,
    ]
}

fn text_types() -> Vec<ObjectType> {
    vec![ObjectType::Text, ObjectType::Button]
}

fn build_effects_library() -> Vec<EffectPreset> {
    vec![
        EffectPreset {
            id: "fade-in".to_string(),
            name: "Fade In".to_string(),
            category: EffectCategory::Entrance,
            duration_ms: 500,
            keyframes: vec![
                Keyframe::new(0, "transform.opacity", KeyframeValue::Number(0.0), Easing::EaseOut),
                Keyframe::new(500, "transform.opacity", KeyframeValue::Number(1.0), Easing::EaseOut),
            ],
            applies_to: all_types(),
        },
        EffectPreset {
            id: "slide-in-left".to_string(),
            name: "Slide In Left".to_string(),
            category: EffectCategory::Entrance,
            duration_ms: 600,
            keyframes: vec![
                Keyframe::new(0, "transform.x", KeyframeValue::Number(-9999.0), Easing::EaseOut),
                Keyframe::new(600, "transform.x", KeyframeValue::Number(0.0), Easing::EaseOut),
                Keyframe::new(0, "transform.opacity", KeyframeValue::Number(0.0), Easing::Linear),
                Keyframe::new(100, "transform.opacity", KeyframeValue::Number(1.0), Easing::Linear),
            ],
            applies_to: all_types(),
        },
        EffectPreset {
            id: "slide-in-right".to_string(),
            name: "Slide In Right".to_string(),
            category: EffectCategory::Entrance,
            duration_ms: 600,
            keyframes: vec![
                Keyframe::new(0, "transform.x", KeyframeValue::Number(9999.0), Easing::EaseOut),
                Keyframe::new(600, "transform.x", KeyframeValue::Number(0.0), Easing::EaseOut),
                Keyframe::new(0, "transform.opacity", KeyframeValue::Number(0.0), Easing::Linear),
                Keyframe::new(100, "transform.opacity", KeyframeValue::Number(1.0), Easing::Linear),
            ],
            applies_to: all_types(),
        },
        EffectPreset {
            id: "slide-in-up".to_string(),
            name: "Slide In Up".to_string(),
            category: EffectCategory::Entrance,
            duration_ms: 600,
            keyframes: vec![
                Keyframe::new(0, "transform.y", KeyframeValue::Number(9999.0), Easing::EaseOut),
                Keyframe::new(600, "transform.y", KeyframeValue::Number(0.0), Easing::EaseOut),
                Keyframe::new(0, "transform.opacity", KeyframeValue::Number(0.0), Easing::Linear),
                Keyframe::new(100, "transform.opacity", KeyframeValue::Number(1.0), Easing::Linear),
            ],
            applies_to: all_types(),
        },
        EffectPreset {
            id: "slide-in-down".to_string(),
            name: "Slide In Down".to_string(),
            category: EffectCategory::Entrance,
            duration_ms: 600,
            keyframes: vec![
                Keyframe::new(0, "transform.y", KeyframeValue::Number(-9999.0), Easing::EaseOut),
                Keyframe::new(600, "transform.y", KeyframeValue::Number(0.0), Easing::EaseOut),
                Keyframe::new(0, "transform.opacity", KeyframeValue::Number(0.0), Easing::Linear),
                Keyframe::new(100, "transform.opacity", KeyframeValue::Number(1.0), Easing::Linear),
            ],
            applies_to: all_types(),
        },
        EffectPreset {
            id: "scale-up".to_string(),
            name: "Scale Up".to_string(),
            category: EffectCategory::Entrance,
            duration_ms: 500,
            keyframes: vec![
                Keyframe::new(0, "transform.width", KeyframeValue::Scale(0.0), Easing::EaseOut),
                Keyframe::new(0, "transform.height", KeyframeValue::Scale(0.0), Easing::EaseOut),
                Keyframe::new(500, "transform.width", KeyframeValue::Scale(1.0), Easing::EaseOut),
                Keyframe::new(500, "transform.height", KeyframeValue::Scale(1.0), Easing::EaseOut),
                Keyframe::new(0, "transform.opacity", KeyframeValue::Number(0.0), Easing::Linear),
                Keyframe::new(150, "transform.opacity", KeyframeValue::Number(1.0), Easing::Linear),
            ],
            applies_to: all_types(),
        },
        EffectPreset {
            id: "typewriter".to_string(),
            name: "Typewriter".to_string(),
            category: EffectCategory::Entrance,
            duration_ms: 1500,
            keyframes: vec![
                Keyframe::new(0, "_typewriter_progress", KeyframeValue::Number(0.0), Easing::Linear),
                Keyframe::new(1500, "_typewriter_progress", KeyframeValue::Number(1.0), Easing::Linear),
            ],
            applies_to: text_types(),
        },
        EffectPreset {
            id: "fade-out".to_string(),
            name: "Fade Out".to_string(),
            category: EffectCategory::Exit,
            duration_ms: 500,
            keyframes: vec![
                Keyframe::new(0, "transform.opacity", KeyframeValue::Number(1.0), Easing::EaseIn),
                Keyframe::new(500, "transform.opacity", KeyframeValue::Number(0.0), Easing::EaseIn),
            ],
            applies_to: all_types(),
        },
        EffectPreset {
            id: "slide-out-left".to_string(),
            name: "Slide Out Left".to_string(),
            category: EffectCategory::Exit,
            duration_ms: 600,
            keyframes: vec![
                Keyframe::new(0, "transform.x", KeyframeValue::Number(0.0), Easing::EaseIn),
                Keyframe::new(600, "transform.x", KeyframeValue::Number(-9999.0), Easing::EaseIn),
                Keyframe::new(500, "transform.opacity", KeyframeValue::Number(1.0), Easing::Linear),
                Keyframe::new(600, "transform.opacity", KeyframeValue::Number(0.0), Easing::Linear),
            ],
            applies_to: all_types(),
        },
        EffectPreset {
            id: "slide-out-right".to_string(),
            name: "Slide Out Right".to_string(),
            category: EffectCategory::Exit,
            duration_ms: 600,
            keyframes: vec![
                Keyframe::new(0, "transform.x", KeyframeValue::Number(0.0), Easing::EaseIn),
                Keyframe::new(600, "transform.x", KeyframeValue::Number(9999.0), Easing::EaseIn),
                Keyframe::new(500, "transform.opacity", KeyframeValue::Number(1.0), Easing::Linear),
                Keyframe::new(600, "transform.opacity", KeyframeValue::Number(0.0), Easing::Linear),
            ],
            applies_to: all_types(),
        },
        EffectPreset {
            id: "scale-down".to_string(),
            name: "Scale Down".to_string(),
            category: EffectCategory::Exit,
            duration_ms: 500,
            keyframes: vec![
                Keyframe::new(0, "transform.width", KeyframeValue::Scale(1.0), Easing::EaseIn),
                Keyframe::new(0, "transform.height", KeyframeValue::Scale(1.0), Easing::EaseIn),
                Keyframe::new(500, "transform.width", KeyframeValue::Scale(0.0), Easing::EaseIn),
                Keyframe::new(500, "transform.height", KeyframeValue::Scale(0.0), Easing::EaseIn),
                Keyframe::new(350, "transform.opacity", KeyframeValue::Number(1.0), Easing::Linear),
                Keyframe::new(500, "transform.opacity", KeyframeValue::Number(0.0), Easing::Linear),
            ],
            applies_to: all_types(),
        },
        EffectPreset {
            id: "pulse".to_string(),
            name: "Pulse".to_string(),
            category: EffectCategory::Emphasis,
            duration_ms: 800,
            // Proportional, not absolute: dim to half of whatever the object
            // already is and come back. An absolute 1.0 -> 0.5 -> 1.0 snapped a
            // deliberately translucent object to fully opaque before pulsing.
            // Scale also keeps the result inside 0..1 for any base in 0..1.
            keyframes: vec![
                Keyframe::new(0, "transform.opacity", KeyframeValue::Scale(1.0), Easing::EaseInOut),
                Keyframe::new(400, "transform.opacity", KeyframeValue::Scale(0.5), Easing::EaseInOut),
                Keyframe::new(800, "transform.opacity", KeyframeValue::Scale(1.0), Easing::EaseInOut),
            ],
            applies_to: all_types(),
        },
        EffectPreset {
            id: "bounce".to_string(),
            name: "Bounce".to_string(),
            category: EffectCategory::Emphasis,
            duration_ms: 1000,
            keyframes: vec![
                Keyframe::new(0, "transform.y", KeyframeValue::Offset(0.0), Easing::EaseOut),
                Keyframe::new(250, "transform.y", KeyframeValue::Offset(-40.0), Easing::EaseOut),
                Keyframe::new(500, "transform.y", KeyframeValue::Offset(0.0), Easing::EaseIn),
                Keyframe::new(700, "transform.y", KeyframeValue::Offset(-15.0), Easing::EaseOut),
                Keyframe::new(1000, "transform.y", KeyframeValue::Offset(0.0), Easing::EaseIn),
            ],
            applies_to: all_types(),
        },
        EffectPreset {
            id: "spin".to_string(),
            name: "Spin".to_string(),
            category: EffectCategory::Motion,
            duration_ms: 1000,
            // One full turn from wherever the object already points. An absolute
            // 0 -> 360 snapped a pre-rotated object upright before spinning.
            keyframes: vec![
                Keyframe::new(0, "transform.rotation", KeyframeValue::Offset(0.0), Easing::Linear),
                Keyframe::new(1000, "transform.rotation", KeyframeValue::Offset(360.0), Easing::Linear),
            ],
            applies_to: all_types(),
        },
        EffectPreset {
            id: "float".to_string(),
            name: "Float".to_string(),
            category: EffectCategory::Motion,
            duration_ms: 2000,
            keyframes: vec![
                Keyframe::new(0, "transform.y", KeyframeValue::Offset(0.0), Easing::EaseInOut),
                Keyframe::new(1000, "transform.y", KeyframeValue::Offset(-20.0), Easing::EaseInOut),
                Keyframe::new(2000, "transform.y", KeyframeValue::Offset(0.0), Easing::EaseInOut),
            ],
            applies_to: all_types(),
        },
    ]
}

/// Directories that may hold effect plugins.
///
/// These used to be bare relative paths, which only resolve when the process
/// happens to be started from the repo root — so plugins loaded in a dev shell
/// and nowhere else, including in the shipped .app. Derive candidates from both
/// the working directory and the executable instead.
fn plugin_dirs() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();

    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd.clone());
        // cargo test / cargo run put the CWD in src-tauri
        if let Some(parent) = cwd.parent() {
            roots.push(parent.to_path_buf());
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            roots.push(dir.to_path_buf());
            // macOS bundle: Contents/MacOS/<exe> -> Contents/Resources
            if let Some(contents) = dir.parent() {
                roots.push(contents.join("Resources"));
            }
        }
    }

    let mut dirs = Vec::new();
    for root in roots {
        for sub in ["effects/custom", "effects"] {
            let candidate = root.join(sub);
            let key = candidate.canonicalize().unwrap_or_else(|_| candidate.clone());
            if candidate.is_dir() && !dirs.iter().any(|(k, _)| k == &key) {
                dirs.push((key, candidate));
            }
        }
    }
    dirs.into_iter().map(|(_, d)| d).collect()
}

fn load_plugin_effects() -> Vec<EffectPreset> {
    let mut plugins: Vec<EffectPreset> = Vec::new();
    for dir in plugin_dirs() {
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let content = match fs::read_to_string(&path) {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("effect plugin {:?}: cannot read: {}", path, e);
                    continue;
                }
            };
            match serde_json::from_str::<EffectPreset>(&content) {
                // A plugin found under two roots is the same plugin.
                Ok(effect) => {
                    if !plugins.iter().any(|p| p.id == effect.id) {
                        plugins.push(effect);
                    }
                }
                // Previously swallowed, so a typo'd plugin just vanished.
                Err(e) => eprintln!("effect plugin {:?}: invalid: {}", path, e),
            }
        }
    }
    plugins
}

/// Built-ins plus whatever is in effects/custom. The single definition of
/// "every effect that exists", so listing and applying cannot disagree.
fn full_effects_library() -> Vec<EffectPreset> {
    let mut all = build_effects_library();
    all.extend(load_plugin_effects());
    all
}

#[tauri::command]
pub fn effects_list() -> Vec<EffectPreset> {
    full_effects_library()
}

#[tauri::command]
pub fn effects_reload() -> Vec<EffectPreset> {
    full_effects_library()
}

#[tauri::command]
pub fn effect_apply(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
    effect_id: String,
    time_ms: u32,
) -> Result<Vec<Keyframe>, String> {
    // Must match what effects_list() offers, or every plugin effect shown in
    // the dropdown fails to apply with "not found".
    let library = full_effects_library();
    let effect = library
        .iter()
        .find(|e| e.id == effect_id)
        .ok_or_else(|| format!("Effect '{}' not found", effect_id))?;

    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let stage_width = project.meta.width as f64;
    let stage_height = project.meta.height as f64;
    let scene = project.find_scene_mut(&scene_id)?;
    let obj = scene
        .objects
        .iter_mut()
        .find(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?;

    let transform = obj.transform.clone();

    let mut new_keyframes = Vec::new();
    for template_kf in &effect.keyframes {
        let resolved_value = resolve_template_value(
            &template_kf.value,
            &template_kf.property,
            &effect.id,
            &transform,
            stage_width,
            stage_height,
        );

        let kf = Keyframe::new(
            time_ms + template_kf.time_ms,
            &template_kf.property,
            resolved_value,
            template_kf.easing.clone(),
        );
        new_keyframes.push(kf);
    }

    for kf in &new_keyframes {
        obj.keyframes
            .retain(|k| !(k.property == kf.property && k.time_ms == kf.time_ms));
    }

    let result = new_keyframes.clone();
    obj.keyframes.extend(new_keyframes);
    obj.keyframes.sort_by_key(|k| k.time_ms);
    project.touch();
    Ok(result)
}

/// Turns one effect-template keyframe value into a concrete value for a given
/// target object. `Offset` and `Scale` are resolved here and never leave this
/// function, so the playback runtime only ever sees `Number`, `Color` or `Bool`.
fn resolve_template_value(
    value: &KeyframeValue,
    property: &str,
    effect_id: &str,
    transform: &crate::model::Transform,
    stage_w: f64,
    stage_h: f64,
) -> KeyframeValue {
    match value {
        KeyframeValue::Number(v) => KeyframeValue::Number(resolve_effect_value(
            *v, property, effect_id, transform.x, transform.y, stage_w, stage_h,
        )),
        KeyframeValue::Offset(v) => match base_value(property, transform) {
            Some(base) => KeyframeValue::Number(base + v),
            // No numeric base for this property: the offset is all there is.
            None => KeyframeValue::Number(*v),
        },
        KeyframeValue::Scale(v) => match base_value(property, transform) {
            Some(base) => KeyframeValue::Number(base * v),
            // Nothing to scale against; fall back to the literal rather than
            // silently collapsing the object to zero.
            None => KeyframeValue::Number(*v),
        },
        other => other.clone(),
    }
}

/// The object's current value for an animatable numeric property, used as the
/// base for `Offset` and `Scale` template values. `None` for properties that
/// have no numeric base (colours, booleans, synthetic progress properties).
fn base_value(property: &str, t: &crate::model::Transform) -> Option<f64> {
    match property {
        "transform.x" => Some(t.x),
        "transform.y" => Some(t.y),
        "transform.width" => Some(t.width),
        "transform.height" => Some(t.height),
        "transform.rotation" => Some(t.rotation),
        "transform.opacity" => Some(t.opacity),
        _ => None,
    }
}

fn resolve_effect_value(
    template_val: f64,
    property: &str,
    effect_id: &str,
    obj_x: f64,
    obj_y: f64,
    stage_w: f64,
    stage_h: f64,
) -> f64 {
    match effect_id {
        "slide-in-left" if property == "transform.x" => {
            if template_val == -9999.0 {
                obj_x - stage_w
            } else {
                obj_x
            }
        }
        "slide-in-right" if property == "transform.x" => {
            if template_val == 9999.0 {
                obj_x + stage_w
            } else {
                obj_x
            }
        }
        "slide-in-up" if property == "transform.y" => {
            if template_val == 9999.0 {
                obj_y + stage_h
            } else {
                obj_y
            }
        }
        "slide-in-down" if property == "transform.y" => {
            if template_val == -9999.0 {
                obj_y - stage_h
            } else {
                obj_y
            }
        }
        "slide-out-left" if property == "transform.x" => {
            if template_val == -9999.0 {
                obj_x - stage_w
            } else {
                obj_x
            }
        }
        "slide-out-right" if property == "transform.x" => {
            if template_val == 9999.0 {
                obj_x + stage_w
            } else {
                obj_x
            }
        }
        // scale-up / scale-down use KeyframeValue::Scale, and bounce / float use
        // KeyframeValue::Offset, so they need no special case here.
        _ => template_val,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Transform;

    /// An object that is nowhere near the origin and not at a default size, so
    /// absolute-vs-relative mistakes show up as large wrong numbers.
    fn obj_transform() -> Transform {
        Transform {
            x: 800.0,
            y: 450.0,
            width: 200.0,
            height: 120.0,
            rotation: 30.0,
            opacity: 1.0,
        }
    }

    fn effect(id: &str) -> EffectPreset {
        build_effects_library()
            .into_iter()
            .find(|e| e.id == id)
            .unwrap_or_else(|| panic!("no built-in effect {}", id))
    }

    /// Resolve every keyframe of an effect against a transform, returning
    /// (time_ms, property, numeric value) triples.
    fn apply(effect_id: &str, t: &Transform) -> Vec<(u32, String, f64)> {
        let e = effect(effect_id);
        e.keyframes
            .iter()
            .filter_map(|kf| {
                match resolve_template_value(&kf.value, &kf.property, &e.id, t, 1920.0, 1080.0) {
                    KeyframeValue::Number(v) => Some((kf.time_ms, kf.property.clone(), v)),
                    _ => None,
                }
            })
            .collect()
    }

    fn values_for(resolved: &[(u32, String, f64)], property: &str) -> Vec<(u32, f64)> {
        let mut v: Vec<(u32, f64)> = resolved
            .iter()
            .filter(|(_, p, _)| p == property)
            .map(|(t, _, val)| (*t, *val))
            .collect();
        v.sort_by_key(|(t, _)| *t);
        v
    }

    // ---- Bug 2: Scale Up was a no-op (both keyframes resolved to 0.0) ----

    #[test]
    fn test_scale_up_grows_to_natural_size() {
        let t = obj_transform();
        let resolved = apply("scale-up", &t);

        let w = values_for(&resolved, "transform.width");
        assert_eq!(w.len(), 2, "expected two width keyframes, got {:?}", w);
        assert_eq!(w[0].1, 0.0, "scale-up must start at zero width");
        assert_eq!(
            w[1].1, t.width,
            "scale-up must end at the object's natural width, got {}",
            w[1].1
        );
        assert_ne!(w[0].1, w[1].1, "scale-up is a no-op: both width keyframes equal");

        let h = values_for(&resolved, "transform.height");
        assert_eq!(h[0].1, 0.0);
        assert_eq!(h[1].1, t.height, "scale-up must end at natural height");
        assert_ne!(h[0].1, h[1].1, "scale-up is a no-op on height");
    }

    // ---- Bug 3: Scale Down was a no-op (both keyframes resolved to obj_w) ----

    #[test]
    fn test_scale_down_shrinks_to_zero() {
        let t = obj_transform();
        let resolved = apply("scale-down", &t);

        let w = values_for(&resolved, "transform.width");
        assert_eq!(w.len(), 2);
        assert_eq!(w[0].1, t.width, "scale-down must start at natural width");
        assert_eq!(w[1].1, 0.0, "scale-down must end at zero, got {}", w[1].1);
        assert_ne!(w[0].1, w[1].1, "scale-down is a no-op: both width keyframes equal");

        let h = values_for(&resolved, "transform.height");
        assert_eq!(h[0].1, t.height);
        assert_eq!(h[1].1, 0.0, "scale-down must end at zero height");
        assert_ne!(h[0].1, h[1].1, "scale-down is a no-op on height");
    }

    #[test]
    fn test_scale_effects_track_object_size() {
        // Two differently sized objects must get different resolved sizes.
        let small = Transform { width: 50.0, height: 25.0, ..obj_transform() };
        let large = Transform { width: 640.0, height: 360.0, ..obj_transform() };
        let a = values_for(&apply("scale-up", &small), "transform.width");
        let b = values_for(&apply("scale-up", &large), "transform.width");
        assert_eq!(a[1].1, 50.0);
        assert_eq!(b[1].1, 640.0);
    }

    // ---- Relative motion for built-ins that already claimed it ----

    #[test]
    fn test_bounce_is_relative_to_object_position() {
        let t = obj_transform();
        let y = values_for(&apply("bounce", &t), "transform.y");
        assert_eq!(y[0].1, t.y, "bounce must start where the object is");
        assert_eq!(y.last().unwrap().1, t.y, "bounce must return to where it started");
        let peak = y.iter().map(|(_, v)| *v).fold(f64::INFINITY, f64::min);
        assert_eq!(peak, t.y - 40.0, "bounce peak should be 40px above the object");
    }

    #[test]
    fn test_float_is_relative_to_object_position() {
        let t = obj_transform();
        let y = values_for(&apply("float", &t), "transform.y");
        assert_eq!(y[0].1, t.y);
        assert_eq!(y.last().unwrap().1, t.y);
        assert_eq!(y[1].1, t.y - 20.0);
    }

    #[test]
    fn test_slide_in_left_starts_off_stage_and_lands_in_place() {
        let t = obj_transform();
        let x = values_for(&apply("slide-in-left", &t), "transform.x");
        assert_eq!(x[0].1, t.x - 1920.0, "must start one stage width to the left");
        assert_eq!(x[1].1, t.x, "must land at the object's authored x");
    }

    // ---- Bug 4: the Offset / Scale value model ----

    #[test]
    fn test_offset_resolves_against_each_transform_property() {
        let t = obj_transform();
        let cases = [
            ("transform.x", -8.0, t.x - 8.0),
            ("transform.y", 25.0, t.y + 25.0),
            ("transform.rotation", 15.0, t.rotation + 15.0),
            ("transform.width", 10.0, t.width + 10.0),
            ("transform.height", -5.0, t.height - 5.0),
        ];
        for (prop, offset, expected) in cases {
            let got = resolve_template_value(
                &KeyframeValue::Offset(offset), prop, "custom-x", &t, 1920.0, 1080.0,
            );
            assert_eq!(got, KeyframeValue::Number(expected), "offset on {}", prop);
        }
    }

    #[test]
    fn test_scale_resolves_as_a_multiplier() {
        let t = obj_transform();
        let got = resolve_template_value(
            &KeyframeValue::Scale(1.3), "transform.width", "custom-x", &t, 1920.0, 1080.0,
        );
        // 200 * 1.3 — not 1.3 pixels, which is what shipped.
        assert_eq!(got, KeyframeValue::Number(260.0));
    }

    #[test]
    fn test_offset_and_scale_fall_back_for_properties_with_no_base() {
        let t = obj_transform();
        // _typewriter_progress has no transform base; must not resolve to 0.
        let got = resolve_template_value(
            &KeyframeValue::Offset(0.5), "_typewriter_progress", "custom-x", &t, 1920.0, 1080.0,
        );
        assert_eq!(got, KeyframeValue::Number(0.5));
        let got = resolve_template_value(
            &KeyframeValue::Scale(0.5), "_typewriter_progress", "custom-x", &t, 1920.0, 1080.0,
        );
        assert_eq!(got, KeyframeValue::Number(0.5));
    }

    #[test]
    fn test_colours_pass_through_untouched() {
        let t = obj_transform();
        let c = KeyframeValue::Color("#ef4444".to_string());
        let got = resolve_template_value(&c, "style.fill", "custom-color-flash", &t, 1920.0, 1080.0);
        assert_eq!(got, c);
    }

    #[test]
    fn test_gradients_pass_through_untouched() {
        // Gradient is a concrete runtime value, not a template kind: there is
        // nothing about the target object to resolve it against, so it must
        // survive `effect_apply` byte for byte.
        use crate::model::{Gradient, GradientStop, GradientType};
        let t = obj_transform();
        let g = KeyframeValue::Gradient(Gradient {
            gradient_type: GradientType::Linear,
            angle: 45.0,
            stops: vec![
                GradientStop { offset: 0.0, color: "#ff0000".into() },
                GradientStop { offset: 1.0, color: "#0000ff80".into() },
            ],
        });
        let got = resolve_template_value(&g, "style.fill_gradient", "custom-x", &t, 1920.0, 1080.0);
        assert_eq!(got, g);
    }

    // ---- The resolved output must be runtime-safe ----

    #[test]
    fn test_every_builtin_resolves_to_runtime_safe_values() {
        // The JS runtime understands Number, Color, Bool and Gradient. No
        // built-in may leak a template-only Offset or Scale onto an object's
        // keyframes -- those exist to be resolved away, right here.
        let t = obj_transform();
        for e in build_effects_library() {
            for kf in &e.keyframes {
                let got = resolve_template_value(&kf.value, &kf.property, &e.id, &t, 1920.0, 1080.0);
                assert!(
                    !matches!(got, KeyframeValue::Offset(_) | KeyframeValue::Scale(_)),
                    "effect '{}' property '{}' resolved to a template-only value: {:?}",
                    e.id, kf.property, got
                );
            }
        }
    }

    // ---- Spin and Pulse were absolute, so they discarded the object's own
    //      rotation and opacity before animating ----

    #[test]
    fn test_spin_turns_from_the_objects_current_rotation() {
        let mut t = obj_transform();
        t.rotation = 45.0;
        let r = values_for(&apply("spin", &t), "transform.rotation");

        assert_eq!(r.len(), 2, "expected two rotation keyframes, got {:?}", r);
        assert_eq!(
            r[0].1, 45.0,
            "spin must start where the object already points, not snap to 0 (got {})",
            r[0].1
        );
        assert_eq!(
            r[1].1, 405.0,
            "spin must turn a full 360 from 45 degrees, not end at 360 (got {})",
            r[1].1
        );
    }

    #[test]
    fn test_spin_on_an_unrotated_object_is_unchanged() {
        // The common case must still behave exactly as before the conversion.
        let mut t = obj_transform();
        t.rotation = 0.0;
        let r = values_for(&apply("spin", &t), "transform.rotation");
        assert_eq!(r[0].1, 0.0);
        assert_eq!(r[1].1, 360.0);
    }

    #[test]
    fn test_pulse_returns_to_the_objects_own_opacity() {
        let mut t = obj_transform();
        t.opacity = 0.4;
        let o = values_for(&apply("pulse", &t), "transform.opacity");

        assert_eq!(o.len(), 3, "expected three opacity keyframes, got {:?}", o);
        assert!(
            (o[0].1 - 0.4).abs() < 1e-9,
            "pulse must start at the object's own opacity, not snap to 1.0 (got {})",
            o[0].1
        );
        assert!(
            (o[2].1 - 0.4).abs() < 1e-9,
            "pulse must return to the object's own opacity (got {})",
            o[2].1
        );
        assert!(
            o[1].1 < o[0].1,
            "pulse must dip below its starting opacity ({} -> {})",
            o[0].1,
            o[1].1
        );
    }

    #[test]
    fn test_pulse_never_leaves_the_legal_opacity_range() {
        // Scale keeps the result inside 0..1 for any base in 0..1, which an
        // Offset would not: 0.9 + 0.5 would render as an ignored globalAlpha.
        for base in [0.0, 0.05, 0.4, 0.9, 1.0] {
            let mut t = obj_transform();
            t.opacity = base;
            for (_, v) in values_for(&apply("pulse", &t), "transform.opacity") {
                assert!(
                    (0.0..=1.0).contains(&v),
                    "pulse on an object at opacity {} produced {}, outside 0..1",
                    base,
                    v
                );
            }
        }
    }

    #[test]
    fn test_pulse_on_a_fully_opaque_object_is_unchanged() {
        let mut t = obj_transform();
        t.opacity = 1.0;
        let o = values_for(&apply("pulse", &t), "transform.opacity");
        assert_eq!(o[0].1, 1.0);
        assert!((o[1].1 - 0.5).abs() < 1e-9, "got {}", o[1].1);
        assert_eq!(o[2].1, 1.0);
    }

    #[test]
    fn test_no_builtin_effect_respects_only_the_origin() {
        // Generalises the two bugs above: applying an effect to an object that
        // sits away from the origin, is already rotated and is translucent must
        // not produce values that ignore those. Checked per property against the
        // object's own base, so a future absolute regression is caught here.
        let mut t = obj_transform();
        t.rotation = 45.0;
        t.opacity = 0.4;

        for e in build_effects_library() {
            let resolved = apply(&e.id, &t);

            // Rotation: nothing should resolve to a bare 0 or 360 when the
            // object is at 45 degrees.
            for (time, v) in values_for(&resolved, "transform.rotation") {
                assert!(
                    v != 0.0 && v != 360.0,
                    "effect '{}' keyframe at {}ms resolved rotation to {}, \
                     ignoring the object's own 45 degrees",
                    e.id,
                    time,
                    v
                );
            }
        }
    }

    #[test]
    fn test_no_builtin_effect_is_a_no_op() {
        // Every effect must produce at least one property whose value actually
        // changes over time. This is the check that scale-up and scale-down
        // both failed.
        let t = obj_transform();
        for e in build_effects_library() {
            let resolved = apply(&e.id, &t);
            let mut props: Vec<String> =
                resolved.iter().map(|(_, p, _)| p.clone()).collect();
            props.sort();
            props.dedup();

            let any_changes = props.iter().any(|p| {
                let vals = values_for(&resolved, p);
                vals.len() > 1 && vals.iter().any(|(_, v)| *v != vals[0].1)
            });
            assert!(
                any_changes,
                "effect '{}' is a no-op: no property changes value. Resolved: {:?}",
                e.id, resolved
            );
        }
    }

    // ---- Serde: new variants round-trip, old files still load ----

    #[test]
    fn test_offset_and_scale_serde_roundtrip() {
        for v in [KeyframeValue::Offset(-8.0), KeyframeValue::Scale(1.3)] {
            let json = serde_json::to_string(&v).unwrap();
            let back: KeyframeValue = serde_json::from_str(&json).unwrap();
            assert_eq!(v, back, "round-trip failed for {}", json);
        }
        assert_eq!(
            serde_json::to_string(&KeyframeValue::Offset(-8.0)).unwrap(),
            r#"{"type":"Offset","value":-8.0}"#
        );
    }

    #[test]
    fn test_existing_value_kinds_still_deserialise() {
        // Projects written before Offset/Scale existed must keep loading.
        let cases = [
            (r#"{"type":"Number","value":42.0}"#, KeyframeValue::Number(42.0)),
            (r##"{"type":"Color","value":"#ff0000"}"##, KeyframeValue::Color("#ff0000".into())),
            (r#"{"type":"Bool","value":true}"#, KeyframeValue::Bool(true)),
        ];
        for (json, expected) in cases {
            let got: KeyframeValue = serde_json::from_str(json).unwrap();
            assert_eq!(got, expected, "failed to parse {}", json);
        }
    }

    // ---- Plugin files ----

    fn plugin_dir() -> PathBuf {
        // tests run with CWD = src-tauri
        PathBuf::from("../effects/custom")
    }

    #[test]
    fn test_all_shipped_plugins_parse() {
        let dir = plugin_dir();
        let mut count = 0;
        for entry in fs::read_dir(&dir).expect("effects/custom missing").flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let content = fs::read_to_string(&path).unwrap();
            let parsed: Result<EffectPreset, _> = serde_json::from_str(&content);
            assert!(
                parsed.is_ok(),
                "plugin {:?} does not parse: {:?}",
                path.file_name(),
                parsed.err()
            );
            count += 1;
        }
        assert!(count >= 5, "expected at least 5 plugins, found {}", count);
    }

    #[test]
    fn test_plugins_do_not_teleport_the_object() {
        // A positional or rotational plugin applied to an object at x=800 must
        // keep it near x=800. shake.json used to snap it to the stage origin.
        let t = obj_transform();
        let dir = plugin_dir();
        for entry in fs::read_dir(&dir).unwrap().flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let effect: EffectPreset =
                serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
            let name = path.file_name().unwrap().to_string_lossy().to_string();

            for kf in &effect.keyframes {
                let base = match base_value(&kf.property, &t) {
                    Some(b) => b,
                    None => continue,
                };
                if let KeyframeValue::Number(v) =
                    resolve_template_value(&kf.value, &kf.property, &effect.id, &t, 1920.0, 1080.0)
                {
                    let drift = (v - base).abs();
                    let allowed = (base.abs() * 0.5).max(60.0);
                    assert!(
                        drift <= allowed,
                        "plugin {} moves {} from {} to {} (drift {:.1}) — looks absolute, not relative",
                        name, kf.property, base, v, drift
                    );
                }
            }
        }
    }

    #[test]
    fn test_zoom_plugin_scales_rather_than_setting_pixels() {
        let t = obj_transform();
        let content = fs::read_to_string(plugin_dir().join("zoom-in-out.json")).unwrap();
        let effect: EffectPreset = serde_json::from_str(&content).unwrap();

        let widths: Vec<f64> = effect
            .keyframes
            .iter()
            .filter(|k| k.property == "transform.width")
            .filter_map(|k| {
                match resolve_template_value(&k.value, &k.property, &effect.id, &t, 1920.0, 1080.0) {
                    KeyframeValue::Number(v) => Some(v),
                    _ => None,
                }
            })
            .collect();

        assert_eq!(widths.len(), 3);
        assert_eq!(widths[0], t.width, "zoom must start at natural size");
        assert_eq!(widths[1], t.width * 1.3, "zoom peak must be 1.3x natural size");
        assert_eq!(widths[2], t.width, "zoom must return to natural size");
        // The shipped bug: object became 1.3 pixels wide.
        assert!(widths[1] > 2.0, "zoom resolved to {} px — treating scale as pixels", widths[1]);
    }

    #[test]
    fn test_every_listed_effect_can_actually_be_applied() {
        // effects_list() advertised plugins that effect_apply could not find,
        // so choosing any custom effect in the UI failed with "not found".
        // Both must draw from the same library.
        let listed = full_effects_library();
        let plugin_ids: Vec<&str> = listed
            .iter()
            .filter(|e| e.id.starts_with("custom-"))
            .map(|e| e.id.as_str())
            .collect();
        assert!(
            plugin_ids.len() >= 5,
            "expected the shipped plugins to be listed, got {:?}",
            plugin_ids
        );
        for id in &plugin_ids {
            assert!(
                listed.iter().any(|e| &e.id == id),
                "effect '{}' is listed but not resolvable from the apply library",
                id
            );
        }
    }

    #[test]
    fn test_plugin_effects_also_resolve_to_runtime_safe_values() {
        // Same guarantee as the built-ins: nothing template-only may reach an
        // object's keyframes.
        let t = obj_transform();
        for e in full_effects_library() {
            for kf in &e.keyframes {
                let got = resolve_template_value(&kf.value, &kf.property, &e.id, &t, 1920.0, 1080.0);
                assert!(
                    !matches!(got, KeyframeValue::Offset(_) | KeyframeValue::Scale(_)),
                    "effect '{}' property '{}' resolved to {:?}, which the runtime cannot read",
                    e.id, kf.property, got
                );
            }
        }
    }
}
