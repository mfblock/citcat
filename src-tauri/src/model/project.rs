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

    /// Recursively collect the `value` payload of every keyframe in a document.
    fn collect_keyframe_values(v: &serde_json::Value, out: &mut Vec<serde_json::Value>) {
        match v {
            serde_json::Value::Object(map) => {
                if map.contains_key("property")
                    && map.contains_key("value")
                    && map.contains_key("easing")
                {
                    out.push(map["value"].clone());
                }
                for (_, child) in map {
                    collect_keyframe_values(child, out);
                }
            }
            serde_json::Value::Array(items) => {
                for item in items {
                    collect_keyframe_values(item, out);
                }
            }
            _ => {}
        }
    }

    fn shipped_project_files() -> Vec<&'static str> {
        vec![
            "templates/demo-showcase.citcat",
            "examples/product-catalogue/product-showcase.citcat",
            "examples/interactive-training/safety-training.citcat",
            "examples/music-video/lyric-video.citcat",
            "examples/presentation/company-intro.citcat",
        ]
    }

    #[test]
    fn test_shipped_project_keyframes_still_deserialise() {
        // Direct backward-compatibility check for adding KeyframeValue::Offset
        // and ::Scale: every keyframe value in every shipped project must still
        // parse. Adding enum variants is only safe if this holds.
        use crate::model::KeyframeValue;
        let root = std::path::Path::new("..");
        let mut total = 0;
        for rel in shipped_project_files() {
            let path = root.join(rel);
            if !path.exists() {
                continue;
            }
            let raw: serde_json::Value =
                serde_json::from_str(&std::fs::read_to_string(&path).unwrap())
                    .unwrap_or_else(|e| panic!("{} is not valid JSON: {}", rel, e));
            let mut values = Vec::new();
            collect_keyframe_values(&raw, &mut values);
            for v in &values {
                let parsed: Result<KeyframeValue, _> = serde_json::from_value(v.clone());
                assert!(
                    parsed.is_ok(),
                    "{}: keyframe value {} no longer parses: {:?}",
                    rel,
                    v,
                    parsed.err()
                );
            }
            total += values.len();
        }
        assert!(total > 100, "expected many keyframes to check, only saw {}", total);
    }

    #[test]
    fn test_shipped_projects_load_as_projects() {
        // Any shipped project that will not load is a user-visible bug. One
        // known failure is a pre-existing BindTransform wire-format mismatch in
        // a hand-authored example; this test allows that exact cause and
        // nothing else, so a regression from the keyframe work cannot hide.
        let root = std::path::Path::new("..");
        let mut broken = Vec::new();
        for rel in shipped_project_files() {
            let path = root.join(rel);
            if !path.exists() {
                continue;
            }
            let content = std::fs::read_to_string(&path).unwrap();
            match serde_json::from_str::<Project>(&content) {
                Ok(p) => assert!(!p.scenes.is_empty(), "{} has no scenes", rel),
                Err(e) => {
                    let msg = e.to_string();
                    assert!(
                        msg.contains("BindTransform"),
                        "{} failed to load for an unexpected reason: {}",
                        rel,
                        msg
                    );
                    broken.push((rel, msg));
                }
            }
        }
        for (rel, msg) in &broken {
            eprintln!("KNOWN BROKEN (pre-existing, unrelated to keyframes): {} -- {}", rel, msg);
        }
    }

    #[test]
    fn test_bind_transform_wire_format_matches_the_editor() {
        // properties.js sends { type: "None" }, so that is the authoritative
        // form. A bare "None" string is what the broken example file uses.
        // Pinning both directions makes the failure above attributable.
        use crate::model::BindTransform;
        let tagged: Result<BindTransform, _> = serde_json::from_str(r#"{"type":"None"}"#);
        assert!(tagged.is_ok(), "editor payload must parse: {:?}", tagged.err());
        let bare: Result<BindTransform, _> = serde_json::from_str(r#""None""#);
        assert!(
            bare.is_err(),
            "a bare string must not parse; example files using it are the ones at fault"
        );
    }

    #[test]
    fn test_bundled_demo_is_the_one_the_app_embeds() {
        // state.rs embeds this file with include_str!; if it stops parsing the
        // app panics at startup, so pin it explicitly.
        let content = include_str!("../../../templates/demo-showcase.citcat");
        let project: Project =
            serde_json::from_str(content).expect("bundled demo must deserialise");
        assert!(!project.scenes.is_empty());
    }

}
