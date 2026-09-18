use tauri::State;

use crate::model::{BindTransform, DataBinding, VisibilityCondition};
use crate::state::AppState;

#[tauri::command]
pub fn binding_add(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
    property: String,
    column: String,
    transform: BindTransform,
) -> Result<DataBinding, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    if project.data_source.is_none() {
        return Err("No data source connected".to_string());
    }

    let scene = project.find_scene_mut(&scene_id)?;
    let obj = scene
        .objects
        .iter_mut()
        .find(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?;

    obj.data_bindings
        .retain(|b| b.property != property);

    let binding = DataBinding::new(&property, &column, transform);
    let result = binding.clone();
    obj.data_bindings.push(binding);
    project.touch();
    Ok(result)
}

#[tauri::command]
pub fn binding_delete(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
    binding_id: String,
) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let obj = scene
        .objects
        .iter_mut()
        .find(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?;

    let before = obj.data_bindings.len();
    obj.data_bindings.retain(|b| b.id != binding_id);
    if obj.data_bindings.len() == before {
        return Err(format!("Binding '{}' not found", binding_id));
    }
    project.touch();
    Ok(())
}

#[tauri::command]
pub fn condition_set(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
    condition: Option<VisibilityCondition>,
) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let obj = scene
        .objects
        .iter_mut()
        .find(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?;
    obj.condition = condition;
    project.touch();
    Ok(())
}
