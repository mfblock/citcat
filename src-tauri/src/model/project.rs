use chrono::Utc;
use serde::{Deserialize, Serialize};

use super::{EffectPreset, Scene};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Project {
    pub version: String,
    pub meta: ProjectMeta,
    pub scenes: Vec<Scene>,
    pub effects_library: Vec<EffectPreset>,
    pub data_source: Option<DataSource>,
    pub export_settings: ExportSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProjectMeta {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub fps: u8,
    pub created: String,
    pub modified: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DataSource {
    pub source_type: DataSourceType,
    pub connection: String,
    pub table: String,
    pub preview_row: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DataSourceType {
    Sqlite,
    Csv,
    Postgres,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExportSettings {
    pub format: ExportFormat,
    pub single_file: bool,
    pub autoplay: bool,
    pub loop_playback: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ExportFormat {
    Html,
    Mp4,
}

impl Project {
    pub fn new(name: &str, width: u32, height: u32, fps: u8) -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            version: "1.0".to_string(),
            meta: ProjectMeta {
                name: name.to_string(),
                width,
                height,
                fps,
                created: now.clone(),
                modified: now,
            },
            scenes: vec![Scene::new("Scene 1", 0)],
            effects_library: Vec::new(),
            data_source: None,
            export_settings: ExportSettings {
                format: ExportFormat::Html,
                single_file: true,
                autoplay: false,
                loop_playback: false,
            },
        }
    }

    pub fn touch(&mut self) {
        self.meta.modified = Utc::now().to_rfc3339();
    }

    pub fn find_scene_mut(&mut self, scene_id: &str) -> Result<&mut Scene, String> {
        self.scenes
            .iter_mut()
            .find(|s| s.id == scene_id)
            .ok_or_else(|| format!("Scene '{}' not found", scene_id))
    }

    pub fn find_scene(&self, scene_id: &str) -> Result<&Scene, String> {
        self.scenes
            .iter()
            .find(|s| s.id == scene_id)
            .ok_or_else(|| format!("Scene '{}' not found", scene_id))
    }
}

impl Default for ExportSettings {
    fn default() -> Self {
        Self {
            format: ExportFormat::Html,
            single_file: true,
            autoplay: false,
            loop_playback: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_project_has_one_scene() {
        let project = Project::new("Test", 1920, 1080, 30);
        assert_eq!(project.scenes.len(), 1);
        assert_eq!(project.scenes[0].name, "Scene 1");
        assert_eq!(project.meta.width, 1920);
        assert_eq!(project.meta.height, 1080);
        assert_eq!(project.meta.fps, 30);
        assert_eq!(project.version, "1.0");
    }

    #[test]
    fn test_project_serialization_roundtrip() {
        let project = Project::new("Roundtrip Test", 1920, 1080, 30);
        let json = serde_json::to_string_pretty(&project).expect("serialize");
        let deserialized: Project = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(project, deserialized);
    }

    #[test]
    fn test_project_with_objects_roundtrip() {
        use super::super::{ObjectType, SceneObject};

        let mut project = Project::new("With Objects", 1920, 1080, 30);
        let obj = SceneObject::new(ObjectType::Text, "Title", 1920, 1080);
        project.scenes[0].objects.push(obj);

        let json = serde_json::to_string_pretty(&project).expect("serialize");
        let deserialized: Project = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(project, deserialized);
        assert_eq!(deserialized.scenes[0].objects.len(), 1);
        assert_eq!(deserialized.scenes[0].objects[0].name, "Title");
    }

    #[test]
    fn test_find_scene() {
        let project = Project::new("Find Test", 1920, 1080, 30);
        let scene_id = project.scenes[0].id.clone();
        assert!(project.find_scene(&scene_id).is_ok());
        assert!(project.find_scene("nonexistent").is_err());
    }
}
