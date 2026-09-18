use tauri::State;

use crate::model::{ResumeCondition, WaitPoint};
use crate::state::AppState;

#[tauri::command]
pub fn waitpoint_add(
    state: State<'_, AppState>,
    scene_id: String,
    time_ms: u32,
    resume_on: ResumeCondition,
) -> Result<WaitPoint, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;

    let wp = WaitPoint::new(time_ms, resume_on);
    let result = wp.clone();
    scene.wait_points.push(wp);
    scene.wait_points.sort_by_key(|w| w.time_ms);
    project.touch();
    Ok(result)
}

#[tauri::command]
pub fn waitpoint_update(
    state: State<'_, AppState>,
    scene_id: String,
    waitpoint_id: String,
    time_ms: Option<u32>,
    resume_on: Option<ResumeCondition>,
) -> Result<WaitPoint, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;
    let wp = scene
        .wait_points
        .iter_mut()
        .find(|w| w.id == waitpoint_id)
        .ok_or_else(|| format!("WaitPoint '{}' not found", waitpoint_id))?;

    if let Some(t) = time_ms {
        wp.time_ms = t;
    }
    if let Some(r) = resume_on {
        wp.resume_on = r;
    }

    let result = wp.clone();
    scene.wait_points.sort_by_key(|w| w.time_ms);
    project.touch();
    Ok(result)
}

#[tauri::command]
pub fn waitpoint_delete(
    state: State<'_, AppState>,
    scene_id: String,
    waitpoint_id: String,
) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let scene = project.find_scene_mut(&scene_id)?;

    let len_before = scene.wait_points.len();
    scene.wait_points.retain(|w| w.id != waitpoint_id);
    if scene.wait_points.len() == len_before {
        return Err(format!("WaitPoint '{}' not found", waitpoint_id));
    }
    project.touch();
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::model::{Project, ResumeCondition, WaitPoint};

    #[test]
    fn test_waitpoint_add_to_scene() {
        let mut project = Project::new("Test", 1920, 1080, 30);
        let wp = WaitPoint::new(2000, ResumeCondition::AnyClick);
        project.scenes[0].wait_points.push(wp);
        assert_eq!(project.scenes[0].wait_points.len(), 1);
        assert_eq!(project.scenes[0].wait_points[0].time_ms, 2000);

        let json = serde_json::to_string(&project).expect("serialize");
        let back: Project = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back.scenes[0].wait_points.len(), 1);
    }

    #[test]
    fn test_waitpoint_delete_from_scene() {
        let mut project = Project::new("Test", 1920, 1080, 30);
        let wp1 = WaitPoint::new(1000, ResumeCondition::AnyClick);
        let wp2 = WaitPoint::new(3000, ResumeCondition::Timer { delay_ms: 5000 });
        let wp2_id = wp2.id.clone();
        project.scenes[0].wait_points.push(wp1);
        project.scenes[0].wait_points.push(wp2);
        assert_eq!(project.scenes[0].wait_points.len(), 2);

        project.scenes[0].wait_points.retain(|w| w.id != wp2_id);
        assert_eq!(project.scenes[0].wait_points.len(), 1);
        assert_eq!(project.scenes[0].wait_points[0].time_ms, 1000);
    }
}
