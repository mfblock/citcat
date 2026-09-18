use tauri::State;

use crate::model::{Background, Scene, Transition};
use crate::state::AppState;

#[tauri::command]
pub fn scene_add(state: State<'_, AppState>, name: String) -> Result<Scene, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let sort_order = project.scenes.len() as i32;
    let scene = Scene::new(&name, sort_order);
    let result = scene.clone();
    project.scenes.push(scene);
    project.touch();
    Ok(result)
}

#[tauri::command]
pub fn scene_update(
    state: State<'_, AppState>,
    scene_id: String,
    name: Option<String>,
    duration_ms: Option<u32>,
    background: Option<Background>,
    transition_in: Option<Transition>,
    transition_out: Option<Transition>,
) -> Result<Scene, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;

    if let Some(n) = name {
        scene.name = n;
    }
    if let Some(d) = duration_ms {
        scene.duration_ms = d;
    }
    if let Some(bg) = background {
        scene.background = bg;
    }
    if transition_in.is_some() {
        scene.transition_in = transition_in;
    }
    if transition_out.is_some() {
        scene.transition_out = transition_out;
    }

    let result = scene.clone();
    project.touch();
    Ok(result)
}

#[tauri::command]
pub fn scene_delete(state: State<'_, AppState>, scene_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    if project.scenes.len() <= 1 {
        return Err("Cannot delete the last scene".to_string());
    }
    let idx = project
        .scenes
        .iter()
        .position(|s| s.id == scene_id)
        .ok_or_else(|| format!("Scene '{}' not found", scene_id))?;
    project.scenes.remove(idx);
    for (i, scene) in project.scenes.iter_mut().enumerate() {
        scene.sort_order = i as i32;
    }
    project.touch();
    Ok(())
}

#[tauri::command]
pub fn scene_reorder(state: State<'_, AppState>, scene_ids: Vec<String>) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    if scene_ids.len() != project.scenes.len() {
        return Err("Scene ID list length doesn't match".to_string());
    }
    let mut reordered = Vec::with_capacity(scene_ids.len());
    for (i, id) in scene_ids.iter().enumerate() {
        let idx = project
            .scenes
            .iter()
            .position(|s| &s.id == id)
            .ok_or_else(|| format!("Scene '{}' not found", id))?;
        let mut scene = project.scenes[idx].clone();
        scene.sort_order = i as i32;
        reordered.push(scene);
    }
    project.scenes = reordered;
    project.touch();
    Ok(())
}
