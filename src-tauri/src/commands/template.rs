use std::fs;
use std::path::PathBuf;

use tauri::State;

use crate::model::Project;
use crate::state::AppState;

fn templates_dir() -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_default();
    let base = exe.parent().unwrap_or(std::path::Path::new("."));
    let dir = base.join("templates");
    if !dir.exists() {
        let alt = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../templates");
        if alt.exists() {
            return alt;
        }
    }
    dir
}

#[tauri::command]
pub fn template_list() -> Result<Vec<String>, String> {
    let dir = templates_dir();
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut names = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("citcat") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                names.push(stem.to_string());
            }
        }
    }
    names.sort();
    Ok(names)
}

#[tauri::command]
pub fn template_save(state: State<'_, AppState>, name: String) -> Result<(), String> {
    let project = state.project.lock().map_err(|e| e.to_string())?;
    let mut template = project.clone();
    template.data_source = None;
    for scene in &mut template.scenes {
        for obj in &mut scene.objects {
            obj.data_bindings.clear();
            obj.condition = None;
        }
    }
    let json = serde_json::to_string_pretty(&template).map_err(|e| e.to_string())?;
    let dir = templates_dir();
    let _ = fs::create_dir_all(&dir);
    let path = dir.join(format!("{}.citcat", name));
    fs::write(path, json).map_err(|e| format!("Failed to save template: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn template_load(state: State<'_, AppState>, name: String) -> Result<Project, String> {
    let dir = templates_dir();
    let path = dir.join(format!("{}.citcat", name));
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Template not found: {}", e))?;
    let project: Project =
        serde_json::from_str(&content).map_err(|e| format!("Invalid template: {}", e))?;
    let mut current = state.project.lock().map_err(|e| e.to_string())?;
    *current = project.clone();
    Ok(project)
}
