use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::KeyframeValue;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EventBinding {
    pub id: String,
    pub trigger: EventTrigger,
    pub action: EventAction,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum EventTrigger {
    Click,
    HoverEnter,
    HoverLeave,
    Timer { delay_ms: u32 },
    SceneEnd,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum EventAction {
    GotoScene { scene_id: String },
    PlayAnimation { object_id: String },
    PauseAnimation { object_id: String },
    ToggleVisible { object_id: String },
    SetProperty {
        object_id: String,
        property: String,
        value: KeyframeValue,
    },
}

impl EventBinding {
    pub fn new(trigger: EventTrigger, action: EventAction) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            trigger,
            action,
        }
    }
}
