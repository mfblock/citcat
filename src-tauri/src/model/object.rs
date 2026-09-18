use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{DataBinding, EventBinding, Keyframe, MotionPath, VisibilityCondition};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SceneObject {
    pub id: String,
    pub name: String,
    pub object_type: ObjectType,
    pub transform: Transform,
    pub style: Style,
    pub content: String,
    pub z_index: i32,
    pub visible: bool,
    pub locked: bool,
    pub keyframes: Vec<Keyframe>,
    pub events: Vec<EventBinding>,
    pub data_bindings: Vec<DataBinding>,
    pub condition: Option<VisibilityCondition>,
    pub motion_path: Option<MotionPath>,
    #[serde(default)]
    pub video_trim_start_ms: Option<u32>,
    #[serde(default)]
    pub video_trim_end_ms: Option<u32>,
    #[serde(default)]
    pub video_muted: Option<bool>,
    #[serde(default)]
    pub audio_volume: Option<f64>,
    #[serde(default)]
    pub audio_loop: Option<bool>,
    #[serde(default)]
    pub text_wrap: Option<bool>,
    #[serde(default)]
    pub appear_at_ms: Option<u32>,
    #[serde(default)]
    pub disappear_at_ms: Option<u32>,
    #[serde(default)]
    pub filters: Option<ObjectFilters>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum ObjectType {
    Text,
    Rect,
    Ellipse,
    Image,
    Video,
    Audio,
    Button,
    Hotspot,
    Svg,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct ObjectFilters {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blur: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub drop_shadow: Option<DropShadow>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub brightness: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contrast: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub saturate: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hue_rotate: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grayscale: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sepia: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DropShadow {
    pub offset_x: f64,
    pub offset_y: f64,
    pub blur: f64,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Transform {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub opacity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Style {
    pub fill: String,
    pub stroke: String,
    pub stroke_width: f64,
    pub font_family: String,
    pub font_size: f64,
    pub font_weight: u16,
    pub text_align: TextAlign,
    pub line_height: f64,
    pub border_radius: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TextAlign {
    Left,
    Center,
    Right,
}

impl Default for Transform {
    fn default() -> Self {
        Self {
            x: 100.0,
            y: 100.0,
            width: 200.0,
            height: 100.0,
            rotation: 0.0,
            opacity: 1.0,
        }
    }
}

impl Default for Style {
    fn default() -> Self {
        Self {
            fill: "#3b82f6".to_string(),
            stroke: "#000000".to_string(),
            stroke_width: 0.0,
            font_family: "system-ui".to_string(),
            font_size: 24.0,
            font_weight: 400,
            text_align: TextAlign::Left,
            line_height: 1.4,
            border_radius: 0.0,
        }
    }
}

impl SceneObject {
    pub fn new(object_type: ObjectType, name: &str, stage_width: u32, stage_height: u32) -> Self {
        let (content, style, transform) = match &object_type {
            ObjectType::Text => (
                "Text".to_string(),
                Style::default(),
                Transform {
                    x: (stage_width as f64 / 2.0) - 100.0,
                    y: (stage_height as f64 / 2.0) - 50.0,
                    ..Default::default()
                },
            ),
            ObjectType::Rect => (
                String::new(),
                Style {
                    fill: "#3b82f6".to_string(),
                    ..Default::default()
                },
                Transform {
                    x: (stage_width as f64 / 2.0) - 100.0,
                    y: (stage_height as f64 / 2.0) - 50.0,
                    ..Default::default()
                },
            ),
            ObjectType::Ellipse => (
                String::new(),
                Style {
                    fill: "#8b5cf6".to_string(),
                    ..Default::default()
                },
                Transform {
                    x: (stage_width as f64 / 2.0) - 75.0,
                    y: (stage_height as f64 / 2.0) - 75.0,
                    width: 150.0,
                    height: 150.0,
                    ..Default::default()
                },
            ),
            ObjectType::Image => (
                String::new(),
                Style::default(),
                Transform {
                    x: (stage_width as f64 / 2.0) - 150.0,
                    y: (stage_height as f64 / 2.0) - 100.0,
                    width: 300.0,
                    height: 200.0,
                    ..Default::default()
                },
            ),
            ObjectType::Button => (
                "Click me".to_string(),
                Style {
                    fill: "#10b981".to_string(),
                    font_size: 18.0,
                    font_weight: 600,
                    border_radius: 8.0,
                    ..Default::default()
                },
                Transform {
                    x: (stage_width as f64 / 2.0) - 80.0,
                    y: (stage_height as f64 / 2.0) - 25.0,
                    width: 160.0,
                    height: 50.0,
                    ..Default::default()
                },
            ),
            ObjectType::Video => (
                String::new(),
                Style::default(),
                Transform {
                    x: (stage_width as f64 / 2.0) - 160.0,
                    y: (stage_height as f64 / 2.0) - 90.0,
                    width: 320.0,
                    height: 180.0,
                    ..Default::default()
                },
            ),
            ObjectType::Audio => (
                String::new(),
                Style {
                    fill: "#22c55e".to_string(),
                    ..Default::default()
                },
                Transform {
                    x: (stage_width as f64 / 2.0) - 80.0,
                    y: (stage_height as f64 / 2.0) - 20.0,
                    width: 160.0,
                    height: 40.0,
                    opacity: 0.6,
                    ..Default::default()
                },
            ),
            ObjectType::Svg => (
                String::new(),
                Style::default(),
                Transform {
                    x: (stage_width as f64 / 2.0) - 100.0,
                    y: (stage_height as f64 / 2.0) - 100.0,
                    width: 200.0,
                    height: 200.0,
                    ..Default::default()
                },
            ),
            ObjectType::Hotspot => (
                String::new(),
                Style {
                    fill: "transparent".to_string(),
                    stroke: "#ff6b6b".to_string(),
                    stroke_width: 2.0,
                    ..Default::default()
                },
                Transform {
                    x: (stage_width as f64 / 2.0) - 75.0,
                    y: (stage_height as f64 / 2.0) - 50.0,
                    width: 150.0,
                    height: 100.0,
                    ..Default::default()
                },
            ),
        };

        Self {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            object_type,
            transform,
            style,
            content,
            z_index: 0,
            visible: true,
            locked: false,
            keyframes: Vec::new(),
            events: Vec::new(),
            data_bindings: Vec::new(),
            condition: None,
            motion_path: None,
            video_trim_start_ms: if matches!(object_type, ObjectType::Video | ObjectType::Audio) { Some(0) } else { None },
            video_trim_end_ms: None,
            video_muted: if matches!(object_type, ObjectType::Video) { Some(true) } else { None },
            audio_volume: if matches!(object_type, ObjectType::Audio) { Some(1.0) } else { None },
            audio_loop: if matches!(object_type, ObjectType::Audio) { Some(false) } else { None },
            text_wrap: if matches!(object_type, ObjectType::Text) { Some(false) } else { None },
            appear_at_ms: None,
            disappear_at_ms: None,
            filters: None,
        }
    }
}
