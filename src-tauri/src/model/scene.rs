use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{SceneObject, SubtitleTrack, WaitPoint};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Scene {
    pub id: String,
    pub name: String,
    pub duration_ms: u32,
    pub background: Background,
    pub objects: Vec<SceneObject>,
    pub transition_in: Option<Transition>,
    pub transition_out: Option<Transition>,
    pub sort_order: i32,
    #[serde(default)]
    pub wait_points: Vec<WaitPoint>,
    #[serde(default)]
    pub subtitle_track: Option<SubtitleTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Background {
    pub fill: String,
    #[serde(default)]
    pub gradient: Option<Gradient>,
    #[serde(default)]
    pub image: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Gradient {
    pub gradient_type: GradientType,
    pub stops: Vec<GradientStop>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum GradientType {
    Linear,
    Radial,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GradientStop {
    pub offset: f64,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Transition {
    pub kind: TransitionKind,
    pub duration_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TransitionKind {
    Cut,
    Crossfade,
    WipeLeft,
    WipeRight,
    WipeUp,
    WipeDown,
    SlideLeft,
    SlideRight,
}

impl Scene {
    pub fn new(name: &str, sort_order: i32) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            duration_ms: 5000,
            background: Background::default(),
            objects: Vec::new(),
            transition_in: None,
            transition_out: None,
            sort_order,
            wait_points: Vec::new(),
            subtitle_track: None,
        }
    }
}

impl Default for Background {
    fn default() -> Self {
        Self {
            fill: "#ffffff".to_string(),
            gradient: None,
            image: None,
        }
    }
}
