use tauri::State;

use uuid::Uuid;
use crate::model::{EventAction, EventBinding, EventTrigger, ObjectFilters, ObjectType, SceneObject, Style, Transform};
use crate::state::AppState;

#[tauri::command]
pub fn object_add(
    state: State<'_, AppState>,
    scene_id: String,
    object_type: ObjectType,
) -> Result<SceneObject, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let (width, height) = (project.meta.width, project.meta.height);

    let scene_idx = project
        .scenes
        .iter()
        .position(|s| s.id == scene_id)
        .ok_or_else(|| format!("Scene '{}' not found", scene_id))?;

    let count = project.scenes[scene_idx].objects.len();
    let type_name = match &object_type {
        ObjectType::Text => "Text",
        ObjectType::Rect => "Rectangle",
        ObjectType::Ellipse => "Ellipse",
        ObjectType::Image => "Image",
        ObjectType::Video => "Video",
        ObjectType::Audio => "Audio",
        ObjectType::Svg => "SVG",
        ObjectType::Button => "Button",
        ObjectType::Hotspot => "Hotspot",
    };
    let name = format!("{} {}", type_name, count + 1);

    let needs_default_event = matches!(object_type, ObjectType::Button | ObjectType::Hotspot);
    let mut obj = SceneObject::new(object_type, &name, width, height);
    obj.z_index = count as i32;

    if needs_default_event {
        let next_scene_id = project
            .scenes
            .get(scene_idx + 1)
            .map(|s| s.id.clone())
            .unwrap_or_else(|| project.scenes[0].id.clone());

        obj.events.push(EventBinding::new(
            EventTrigger::Click,
            EventAction::GotoScene {
                scene_id: next_scene_id,
            },
        ));
    }

    let result = obj.clone();
    project.scenes[scene_idx].objects.push(obj);
    project.touch();
    Ok(result)
}

#[tauri::command]
pub fn object_update(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
    name: Option<String>,
    transform: Option<Transform>,
    style: Option<Style>,
    content: Option<String>,
    visible: Option<bool>,
    locked: Option<bool>,
    video_trim_start_ms: Option<u32>,
    video_trim_end_ms: Option<Option<u32>>,
    video_muted: Option<bool>,
    audio_volume: Option<f64>,
    audio_loop: Option<bool>,
    text_wrap: Option<bool>,
    appear_at_ms: Option<Option<u32>>,
    disappear_at_ms: Option<Option<u32>>,
    filters: Option<Option<ObjectFilters>>,
) -> Result<SceneObject, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let obj = scene
        .objects
        .iter_mut()
        .find(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?;

    if let Some(n) = name {
        obj.name = n;
    }
    if let Some(t) = transform {
        obj.transform = t;
    }
    if let Some(s) = style {
        obj.style = s;
    }
    if let Some(c) = content {
        obj.content = c;
    }
    if let Some(v) = visible {
        obj.visible = v;
    }
    if let Some(l) = locked {
        obj.locked = l;
    }
    if let Some(vts) = video_trim_start_ms {
        obj.video_trim_start_ms = Some(vts);
    }
    if let Some(vte) = video_trim_end_ms {
        obj.video_trim_end_ms = vte;
    }
    if let Some(vm) = video_muted {
        obj.video_muted = Some(vm);
    }
    if let Some(av) = audio_volume {
        obj.audio_volume = Some(av);
    }
    if let Some(al) = audio_loop {
        obj.audio_loop = Some(al);
    }
    if let Some(tw) = text_wrap {
        obj.text_wrap = Some(tw);
    }
    if let Some(aat) = appear_at_ms {
        obj.appear_at_ms = aat;
    }
    if let Some(dat) = disappear_at_ms {
        obj.disappear_at_ms = dat;
    }
    if let Some(f) = filters {
        obj.filters = f;
    }

    let result = obj.clone();
    project.touch();
    Ok(result)
}

#[tauri::command]
pub fn object_duplicate(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
) -> Result<SceneObject, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let src = scene
        .objects
        .iter()
        .find(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?
        .clone();

    let mut dup = src;
    dup.id = Uuid::new_v4().to_string();
    dup.name = format!("{} copy", dup.name);
    dup.transform.x += 20.0;
    dup.transform.y += 20.0;
    for kf in &mut dup.keyframes {
        kf.id = Uuid::new_v4().to_string();
    }
    for ev in &mut dup.events {
        ev.id = Uuid::new_v4().to_string();
    }
    for db in &mut dup.data_bindings {
        db.id = Uuid::new_v4().to_string();
    }
    dup.z_index = scene.objects.len() as i32;

    let result = dup.clone();
    scene.objects.push(dup);
    project.touch();
    Ok(result)
}

#[tauri::command]
pub fn object_delete(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let idx = scene
        .objects
        .iter()
        .position(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?;
    scene.objects.remove(idx);
    project.touch();
    Ok(())
}

#[tauri::command]
pub fn object_reorder(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
    z_index: i32,
) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;

    let obj = scene
        .objects
        .iter_mut()
        .find(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?;
    obj.z_index = z_index;

    scene.objects.sort_by_key(|o| o.z_index);
    for (i, obj) in scene.objects.iter_mut().enumerate() {
        obj.z_index = i as i32;
    }
    project.touch();
    Ok(())
}
