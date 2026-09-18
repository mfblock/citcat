use std::fs;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

use crate::model::Project;
use crate::state::AppState;

#[tauri::command]
pub fn project_new(
    state: State<'_, AppState>,
    name: String,
    width: u32,
    height: u32,
    fps: u8,
) -> Result<Project, String> {
    let project = Project::new(&name, width, height, fps);
    let mut current = state.project.lock().map_err(|e| e.to_string())?;
    *current = project.clone();
    Ok(project)
}

#[tauri::command]
pub fn project_get(state: State<'_, AppState>) -> Result<Project, String> {
    let project = state.project.lock().map_err(|e| e.to_string())?;
    Ok(project.clone())
}

#[tauri::command]
pub fn project_save(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    project.touch();
    let json = serde_json::to_string_pretty(&*project).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("Failed to save: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn project_open(state: State<'_, AppState>, path: String) -> Result<Project, String> {
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to open: {}", e))?;
    let project: Project =
        serde_json::from_str(&content).map_err(|e| format!("Invalid project file: {}", e))?;
    let mut current = state.project.lock().map_err(|e| e.to_string())?;
    *current = project.clone();
    Ok(project)
}

fn pick_file_blocking(app: &tauri::AppHandle, name: &str, extensions: &[&str]) -> Option<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let name = name.to_string();
    let extensions: Vec<String> = extensions.iter().map(|e| e.to_string()).collect();
    let ext_refs: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
    app.dialog()
        .file()
        .add_filter(&name, &ext_refs)
        .pick_file(move |path| {
            let _ = tx.send(path.map(|p| p.to_string()));
        });
    rx.recv().ok().flatten()
}

fn save_file_blocking(app: &tauri::AppHandle, name: &str, extensions: &[&str]) -> Option<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let name = name.to_string();
    let extensions: Vec<String> = extensions.iter().map(|e| e.to_string()).collect();
    let ext_refs: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
    app.dialog()
        .file()
        .add_filter(&name, &ext_refs)
        .save_file(move |path| {
            let _ = tx.send(path.map(|p| p.to_string()));
        });
    rx.recv().ok().flatten()
}

#[tauri::command(async)]
pub fn dialog_save_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(save_file_blocking(&app, "CitCat Project", &["citcat"]))
}

#[tauri::command(async)]
pub fn dialog_open_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(pick_file_blocking(&app, "CitCat Project", &["citcat"]))
}

#[tauri::command(async)]
pub fn dialog_open_image(app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(pick_file_blocking(
        &app,
        "Images",
        &["png", "jpg", "jpeg", "gif", "svg", "webp"],
    ))
}

#[tauri::command(async)]
pub fn dialog_open_audio(app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(pick_file_blocking(
        &app,
        "Audio",
        &["mp3", "wav", "ogg", "m4a", "aac", "flac"],
    ))
}

#[tauri::command(async)]
pub fn dialog_open_video(app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(pick_file_blocking(
        &app,
        "Video",
        &["mp4", "webm", "mov", "avi", "mkv"],
    ))
}

#[tauri::command(async)]
pub fn dialog_open_svg(app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(pick_file_blocking(&app, "SVG", &["svg"]))
}

#[tauri::command]
pub fn read_svg_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read SVG: {}", e))
}
