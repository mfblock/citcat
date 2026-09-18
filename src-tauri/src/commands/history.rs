use tauri::State;

use crate::model::Project;
use crate::state::AppState;

#[tauri::command]
pub fn history_push(state: State<'_, AppState>, description: String) -> Result<(), String> {
    let project = state.project.lock().map_err(|e| e.to_string())?;
    let mut history = state.history.lock().map_err(|e| e.to_string())?;
    history.push(&project, &description);
    Ok(())
}

#[tauri::command]
pub fn undo(state: State<'_, AppState>) -> Result<Option<Project>, String> {
    let mut history = state.history.lock().map_err(|e| e.to_string())?;
    match history.undo() {
        Some(project) => {
            let mut current = state.project.lock().map_err(|e| e.to_string())?;
            *current = project.clone();
            Ok(Some(project))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub fn redo(state: State<'_, AppState>) -> Result<Option<Project>, String> {
    let mut history = state.history.lock().map_err(|e| e.to_string())?;
    match history.redo() {
        Some(project) => {
            let mut current = state.project.lock().map_err(|e| e.to_string())?;
            *current = project.clone();
            Ok(Some(project))
        }
        None => Ok(None),
    }
}
