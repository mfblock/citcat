use tauri::State;

use crate::model::{MotionPath, PathPoint};
use crate::state::AppState;

#[tauri::command]
pub fn path_set(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
    motion_path: Option<MotionPath>,
) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let obj = scene
        .objects
        .iter_mut()
        .find(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?;
    obj.motion_path = motion_path;
    project.touch();
    Ok(())
}

#[tauri::command]
pub fn path_add_point(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
    point_index: usize,
    point: PathPoint,
) -> Result<MotionPath, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let obj = scene
        .objects
        .iter_mut()
        .find(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?;

    let path = obj
        .motion_path
        .get_or_insert_with(MotionPath::new);

    let idx = point_index.min(path.points.len());
    path.points.insert(idx, point);
    let result = path.clone();
    project.touch();
    Ok(result)
}

#[tauri::command]
pub fn path_update_point(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
    point_index: usize,
    point: PathPoint,
) -> Result<MotionPath, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let obj = scene
        .objects
        .iter_mut()
        .find(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?;

    let path = obj
        .motion_path
        .as_mut()
        .ok_or("Object has no motion path")?;

    if point_index >= path.points.len() {
        return Err(format!("Point index {} out of range", point_index));
    }
    path.points[point_index] = point;
    let result = path.clone();
    project.touch();
    Ok(result)
}

#[tauri::command]
pub fn path_delete_point(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
    point_index: usize,
) -> Result<Option<MotionPath>, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let obj = scene
        .objects
        .iter_mut()
        .find(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?;

    let path = obj
        .motion_path
        .as_mut()
        .ok_or("Object has no motion path")?;

    if point_index >= path.points.len() {
        return Err(format!("Point index {} out of range", point_index));
    }
    path.points.remove(point_index);

    if path.points.is_empty() {
        obj.motion_path = None;
        project.touch();
        return Ok(None);
    }

    let result = Some(path.clone());
    project.touch();
    Ok(result)
}
