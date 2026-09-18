use serde::{Deserialize, Serialize};

use super::{Keyframe, ObjectType};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EffectPreset {
    pub id: String,
    pub name: String,
    pub category: EffectCategory,
    pub duration_ms: u32,
    pub keyframes: Vec<Keyframe>,
    pub applies_to: Vec<ObjectType>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum EffectCategory {
    Entrance,
    Exit,
    Emphasis,
    Motion,
}
