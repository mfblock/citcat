use tauri::State;

use crate::model::{Easing, Keyframe, KeyframeValue};
use crate::state::AppState;

#[tauri::command]
pub fn keyframe_add(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
    time_ms: u32,
    property: String,
    value: KeyframeValue,
    easing: Easing,
) -> Result<Keyframe, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let obj = scene
        .objects
        .iter_mut()
        .find(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?;

    obj.keyframes
        .retain(|k| !(k.property == property && k.time_ms == time_ms));

    let kf = Keyframe::new(time_ms, &property, value, easing);
    let result = kf.clone();
    obj.keyframes.push(kf);
    obj.keyframes.sort_by_key(|k| k.time_ms);
    project.touch();
    Ok(result)
}

#[tauri::command]
pub fn keyframe_update(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
    keyframe_id: String,
    time_ms: Option<u32>,
    value: Option<KeyframeValue>,
    easing: Option<Easing>,
) -> Result<Keyframe, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let obj = scene
        .objects
        .iter_mut()
        .find(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?;
    let kf = obj
        .keyframes
        .iter_mut()
        .find(|k| k.id == keyframe_id)
        .ok_or_else(|| format!("Keyframe '{}' not found", keyframe_id))?;

    if let Some(t) = time_ms {
        kf.time_ms = t;
    }
    if let Some(v) = value {
        kf.value = v;
    }
    if let Some(e) = easing {
        kf.easing = e;
    }

    let result = kf.clone();
    obj.keyframes.sort_by_key(|k| k.time_ms);
    project.touch();
    Ok(result)
}

#[tauri::command]
pub fn keyframe_delete(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
    keyframe_id: String,
) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let obj = scene
        .objects
        .iter_mut()
        .find(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?;

    let len_before = obj.keyframes.len();
    obj.keyframes.retain(|k| k.id != keyframe_id);
    if obj.keyframes.len() == len_before {
        return Err(format!("Keyframe '{}' not found", keyframe_id));
    }
    project.touch();
    Ok(())
}
