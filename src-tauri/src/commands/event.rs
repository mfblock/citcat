use tauri::State;

use crate::model::{EventAction, EventBinding, EventTrigger};
use crate::state::AppState;

#[tauri::command]
pub fn event_add(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
    trigger: EventTrigger,
    action: EventAction,
) -> Result<EventBinding, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let obj = scene
        .objects
        .iter_mut()
        .find(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?;

    let binding = EventBinding::new(trigger, action);
    let result = binding.clone();
    obj.events.push(binding);
    project.touch();
    Ok(result)
}

#[tauri::command]
pub fn event_update(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
    event_id: String,
    trigger: Option<EventTrigger>,
    action: Option<EventAction>,
) -> Result<EventBinding, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let obj = scene
        .objects
        .iter_mut()
        .find(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?;
    let ev = obj
        .events
        .iter_mut()
        .find(|e| e.id == event_id)
        .ok_or_else(|| format!("Event '{}' not found", event_id))?;

    if let Some(t) = trigger {
        ev.trigger = t;
    }
    if let Some(a) = action {
        ev.action = a;
    }

    let result = ev.clone();
    project.touch();
    Ok(result)
}

#[tauri::command]
pub fn event_delete(
    state: State<'_, AppState>,
    scene_id: String,
    object_id: String,
    event_id: String,
) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let obj = scene
        .objects
        .iter_mut()
        .find(|o| o.id == object_id)
        .ok_or_else(|| format!("Object '{}' not found", object_id))?;

    let len_before = obj.events.len();
    obj.events.retain(|e| e.id != event_id);
    if obj.events.len() == len_before {
        return Err(format!("Event '{}' not found", event_id));
    }
    project.touch();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{EventAction, EventBinding, EventTrigger, ObjectType, Project};

    #[test]
    fn test_event_binding_roundtrip() {
        let binding = EventBinding::new(
            EventTrigger::Click,
            EventAction::GotoScene {
                scene_id: "scene-1".to_string(),
            },
        );
        let json = serde_json::to_string(&binding).expect("serialize");
        let back: EventBinding = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(binding, back);
    }

    #[test]
    fn test_event_binding_timer_roundtrip() {
        let binding = EventBinding::new(
            EventTrigger::Timer { delay_ms: 2000 },
            EventAction::ToggleVisible {
                object_id: "obj-1".to_string(),
            },
        );
        let json = serde_json::to_string(&binding).expect("serialize");
        let back: EventBinding = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(binding, back);
    }

    #[test]
    fn test_event_on_object() {
        let mut project = Project::new("Test", 1920, 1080, 30);
        let mut obj = crate::model::SceneObject::new(
            ObjectType::Button,
            "Test Button",
            1920,
            1080,
        );
        let ev = EventBinding::new(
            EventTrigger::Click,
            EventAction::GotoScene {
                scene_id: "scene-2".to_string(),
            },
        );
        obj.events.push(ev);
        assert_eq!(obj.events.len(), 1);
        project.scenes[0].objects.push(obj);

        let json = serde_json::to_string(&project).expect("serialize");
        let back: Project = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back.scenes[0].objects[0].events.len(), 1);
        match &back.scenes[0].objects[0].events[0].trigger {
            EventTrigger::Click => {}
            _ => panic!("Expected Click trigger"),
        }
    }
}
