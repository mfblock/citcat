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
                Keyframe::new(0, "transform.width", KeyframeValue::Number(0.0), Easing::EaseOut),
                Keyframe::new(0, "transform.height", KeyframeValue::Number(0.0), Easing::EaseOut),
                Keyframe::new(500, "transform.width", KeyframeValue::Number(0.0), Easing::EaseOut),
                Keyframe::new(500, "transform.height", KeyframeValue::Number(0.0), Easing::EaseOut),
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
                Keyframe::new(0, "transform.width", KeyframeValue::Number(0.0), Easing::EaseIn),
                Keyframe::new(0, "transform.height", KeyframeValue::Number(0.0), Easing::EaseIn),
                Keyframe::new(500, "transform.width", KeyframeValue::Number(0.0), Easing::EaseIn),
                Keyframe::new(500, "transform.height", KeyframeValue::Number(0.0), Easing::EaseIn),
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
            keyframes: vec![
                Keyframe::new(0, "transform.opacity", KeyframeValue::Number(1.0), Easing::EaseInOut),
                Keyframe::new(400, "transform.opacity", KeyframeValue::Number(0.5), Easing::EaseInOut),
                Keyframe::new(800, "transform.opacity", KeyframeValue::Number(1.0), Easing::EaseInOut),
            ],
            applies_to: all_types(),
        },
        EffectPreset {
            id: "bounce".to_string(),
            name: "Bounce".to_string(),
            category: EffectCategory::Emphasis,
            duration_ms: 1000,
            keyframes: vec![
                Keyframe::new(0, "transform.y", KeyframeValue::Number(0.0), Easing::EaseOut),
                Keyframe::new(250, "transform.y", KeyframeValue::Number(-40.0), Easing::EaseOut),
                Keyframe::new(500, "transform.y", KeyframeValue::Number(0.0), Easing::EaseIn),
                Keyframe::new(700, "transform.y", KeyframeValue::Number(-15.0), Easing::EaseOut),
                Keyframe::new(1000, "transform.y", KeyframeValue::Number(0.0), Easing::EaseIn),
            ],
            applies_to: all_types(),
        },
        EffectPreset {
            id: "spin".to_string(),
            name: "Spin".to_string(),
            category: EffectCategory::Motion,
            duration_ms: 1000,
            keyframes: vec![
                Keyframe::new(0, "transform.rotation", KeyframeValue::Number(0.0), Easing::Linear),
                Keyframe::new(1000, "transform.rotation", KeyframeValue::Number(360.0), Easing::Linear),
            ],
            applies_to: all_types(),
        },
        EffectPreset {
            id: "float".to_string(),
            name: "Float".to_string(),
            category: EffectCategory::Motion,
            duration_ms: 2000,
            keyframes: vec![
                Keyframe::new(0, "transform.y", KeyframeValue::Number(0.0), Easing::EaseInOut),
                Keyframe::new(1000, "transform.y", KeyframeValue::Number(-20.0), Easing::EaseInOut),
                Keyframe::new(2000, "transform.y", KeyframeValue::Number(0.0), Easing::EaseInOut),
            ],
            applies_to: all_types(),
        },
    ]
}

fn load_plugin_effects() -> Vec<EffectPreset> {
    let mut plugins = Vec::new();
    let dirs_to_scan: Vec<PathBuf> = vec![
        PathBuf::from("effects"),
        PathBuf::from("effects/custom"),
    ];
    for dir in dirs_to_scan {
        if !dir.exists() {
            continue;
        }
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("json") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(effect) = serde_json::from_str::<EffectPreset>(&content) {
                            plugins.push(effect);
                        }
                    }
                }
            }
        }
    }
    plugins
}

#[tauri::command]
pub fn effects_list() -> Vec<EffectPreset> {
    let mut all = build_effects_library();
    all.extend(load_plugin_effects());
    all
}

#[tauri::command]
pub fn effects_reload() -> Vec<EffectPreset> {
    let mut all = build_effects_library();
    all.extend(load_plugin_effects());
    all
}

#[tauri::command]
pub fn effect_apply(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
    effect_id: String,
    time_ms: u32,
) -> Result<Vec<Keyframe>, String> {
    let library = build_effects_library();
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

    let obj_x = obj.transform.x;
    let obj_y = obj.transform.y;
    let obj_w = obj.transform.width;
    let obj_h = obj.transform.height;

    let mut new_keyframes = Vec::new();
    for template_kf in &effect.keyframes {
        let resolved_value = match &template_kf.value {
            KeyframeValue::Number(v) => {
                let resolved = resolve_effect_value(
                    *v,
                    &template_kf.property,
                    &effect.id,
                    obj_x,
                    obj_y,
                    obj_w,
                    obj_h,
                    stage_width,
                    stage_height,
                );
                KeyframeValue::Number(resolved)
            }
            other => other.clone(),
        };

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

fn resolve_effect_value(
    template_val: f64,
    property: &str,
    effect_id: &str,
    obj_x: f64,
    obj_y: f64,
    obj_w: f64,
    obj_h: f64,
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
        "scale-up" if property == "transform.width" && template_val == 0.0 => 0.0,
        "scale-up" if property == "transform.height" && template_val == 0.0 => 0.0,
        "scale-up" if property == "transform.width" => obj_w,
        "scale-up" if property == "transform.height" => obj_h,
        "scale-down" if property == "transform.width" && template_val == 0.0 => {
            if template_val == 0.0 { obj_w } else { 0.0 }
        }
        "scale-down" if property == "transform.height" && template_val == 0.0 => {
            if template_val == 0.0 { obj_h } else { 0.0 }
        }
        "bounce" if property == "transform.y" => obj_y + template_val,
        "float" if property == "transform.y" => obj_y + template_val,
        _ => template_val,
    }
}
