use std::path::PathBuf;

use tauri::State;
use tauri_plugin_dialog::DialogExt;

use crate::export::{self, html, video};
use crate::model::Project;
use crate::state::AppState;

#[tauri::command]
pub fn export_html(
    state: State<'_, AppState>,
    path: String,
    single_file: bool,
    autoplay: bool,
    loop_playback: bool,
) -> Result<(), String> {
    let project = state.project.lock().map_err(|e| e.to_string())?;

    if single_file {
        html::export_single_file(&project, &path, autoplay, loop_playback)
    } else {
        html::export_folder(&project, &path, autoplay, loop_playback)
    }
}

fn resolve_bindings(project: &Project, row: &serde_json::Map<String, serde_json::Value>) -> Project {
    export::resolve_bindings(project, row)
}

#[tauri::command]
pub fn export_batch_html(
    state: State<'_, AppState>,
    output_dir: String,
    single_file: bool,
    autoplay: bool,
    loop_playback: bool,
    name_column: Option<String>,
) -> Result<u32, String> {
    let project = state.project.lock().map_err(|e| e.to_string())?;

    let table = project
        .data_source
        .as_ref()
        .map(|ds| ds.table.clone())
        .ok_or("No data source configured")?;

    drop(project);

    let conn = state.data_connection.lock().map_err(|e| e.to_string())?;
    let connector = conn.as_ref().ok_or("No data source connected")?;
    let total = connector.row_count(&table)?;

    let dir = PathBuf::from(&output_dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Create dir: {}", e))?;

    let batch_size = 50u32;
    let mut exported = 0u32;

    let mut offset = 0u32;
    while offset < total {
        let result = connector.rows(&table, offset, batch_size)?;
        for (i, row) in result.rows.iter().enumerate() {
            let project = state.project.lock().map_err(|e| e.to_string())?;
            let resolved = resolve_bindings(&project, row);
            drop(project);

            let row_idx = offset + i as u32;
            let filename = if let Some(ref col) = name_column {
                let name_val = row
                    .get(col)
                    .map(|v| match v {
                        serde_json::Value::String(s) => s.clone(),
                        _ => v.to_string().trim_matches('"').to_string(),
                    })
                    .unwrap_or_else(|| format!("row_{:04}", row_idx));
                sanitize_filename(&name_val)
            } else {
                format!("row_{:04}", row_idx)
            };

            if single_file {
                let path = dir.join(format!("{}.html", filename));
                html::export_single_file(
                    &resolved,
                    &path.to_string_lossy(),
                    autoplay,
                    loop_playback,
                )?;
            } else {
                let subdir = dir.join(&filename);
                html::export_folder(
                    &resolved,
                    &subdir.to_string_lossy(),
                    autoplay,
                    loop_playback,
                )?;
            }
            exported += 1;
        }
        offset += batch_size;
    }

    Ok(exported)
}

fn sanitize_filename(name: &str) -> String {
    export::sanitize_filename(name)
}

#[tauri::command(async)]
pub fn dialog_export_save(
    app: tauri::AppHandle,
    single_file: bool,
) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();

    if single_file {
        app.dialog()
            .file()
            .add_filter("HTML", &["html"])
            .save_file(move |path| {
                let _ = tx.send(path.map(|p| p.to_string()));
            });
    } else {
        app.dialog()
            .file()
            .pick_folder(move |path| {
                let _ = tx.send(path.map(|p| p.to_string()));
            });
    }

    rx.recv().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn check_ffmpeg() -> Result<String, String> {
    video::check_ffmpeg()
}

#[tauri::command]
pub fn mp4_create_temp_dir() -> Result<String, String> {
    let dir = video::create_temp_dir()?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn mp4_write_frame(temp_dir: String, frame_number: u32, data_url: String) -> Result<(), String> {
    video::write_frame(std::path::Path::new(&temp_dir), frame_number, &data_url)
}

#[tauri::command]
pub fn mp4_encode(
    state: State<'_, AppState>,
    temp_dir: String,
    output_path: String,
    fps: u8,
    crf: u8,
) -> Result<(), String> {
    let project = state.project.lock().map_err(|e| e.to_string())?;
    let audio_paths = video::collect_audio_paths(&project);
    drop(project);

    video::encode_mp4(
        std::path::Path::new(&temp_dir),
        &output_path,
        fps,
        crf,
        &audio_paths,
    )?;

    video::cleanup_temp_dir(std::path::Path::new(&temp_dir));
    Ok(())
}

#[tauri::command]
pub fn mp4_cleanup(temp_dir: String) -> Result<(), String> {
    video::cleanup_temp_dir(std::path::Path::new(&temp_dir));
    Ok(())
}

#[tauri::command(async)]
pub fn dialog_export_mp4(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .add_filter("MP4 Video", &["mp4"])
        .save_file(move |path| {
            let _ = tx.send(path.map(|p| p.to_string()));
        });
    rx.recv().map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn dialog_export_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .pick_folder(move |path| {
            let _ = tx.send(path.map(|p| p.to_string()));
        });
    rx.recv().map_err(|e| e.to_string())
}
