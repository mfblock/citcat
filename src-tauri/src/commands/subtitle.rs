use std::fs;
use tauri::State;

use crate::model::{SubtitleEntry, SubtitleTrack};
use crate::state::AppState;
use crate::subtitle;

#[tauri::command]
pub fn subtitle_import(
    state: State<'_, AppState>,
    scene_id: String,
    path: String,
) -> Result<SubtitleTrack, String> {
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;

    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let track = match ext.as_str() {
        "vtt" => subtitle::parse_vtt(&content),
        _ => subtitle::parse_srt(&content),
    };

    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let result = track.clone();
    scene.subtitle_track = Some(track);
    project.touch();
    Ok(result)
}

#[tauri::command]
pub fn subtitle_export(
    state: State<'_, AppState>,
    scene_id: String,
    path: String,
    format: String,
) -> Result<(), String> {
    let project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene(&scene_id)?;
    let track = scene
        .subtitle_track
        .as_ref()
        .ok_or_else(|| "No subtitle track".to_string())?;

    let content = match format.as_str() {
        "vtt" => {
            let mut out = "WEBVTT\n\n".to_string();
            out.push_str(&subtitle::export_srt(track).replace(',', "."));
            out
        }
        _ => subtitle::export_srt(track),
    };

    fs::write(&path, content).map_err(|e| format!("Failed to write: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn subtitle_add_entry(
    state: State<'_, AppState>,
    scene_id: String,
    start_ms: u32,
    end_ms: u32,
    text: String,
) -> Result<SubtitleEntry, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;

    if scene.subtitle_track.is_none() {
        scene.subtitle_track = Some(SubtitleTrack::new());
    }

    let track = scene.subtitle_track.as_mut().unwrap();
    let entry = SubtitleEntry::new(start_ms, end_ms, &text);
    let result = entry.clone();
    track.entries.push(entry);
    track
        .entries
        .sort_by_key(|e| e.start_ms);
    project.touch();
    Ok(result)
}

#[tauri::command]
pub fn subtitle_update_entry(
    state: State<'_, AppState>,
    scene_id: String,
    entry_id: String,
    start_ms: Option<u32>,
    end_ms: Option<u32>,
    text: Option<String>,
) -> Result<SubtitleEntry, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let track = scene
        .subtitle_track
        .as_mut()
        .ok_or_else(|| "No subtitle track".to_string())?;

    let entry = track
        .entries
        .iter_mut()
        .find(|e| e.id == entry_id)
        .ok_or_else(|| format!("Entry '{}' not found", entry_id))?;

    if let Some(s) = start_ms {
        entry.start_ms = s;
    }
    if let Some(e) = end_ms {
        entry.end_ms = e;
    }
    if let Some(t) = text {
        entry.text = t;
    }

    let result = entry.clone();
    track
        .entries
        .sort_by_key(|e| e.start_ms);
    project.touch();
    Ok(result)
}

#[tauri::command]
pub fn subtitle_delete_entry(
    state: State<'_, AppState>,
    scene_id: String,
    entry_id: String,
) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let track = scene
        .subtitle_track
        .as_mut()
        .ok_or_else(|| "No subtitle track".to_string())?;

    track.entries.retain(|e| e.id != entry_id);
    project.touch();
    Ok(())
}

#[tauri::command]
pub fn subtitle_clear(
    state: State<'_, AppState>,
    scene_id: String,
) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    scene.subtitle_track = None;
    project.touch();
    Ok(())
}
