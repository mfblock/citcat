use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SubtitleTrack {
    pub id: String,
    pub entries: Vec<SubtitleEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SubtitleEntry {
    pub id: String,
    pub start_ms: u32,
    pub end_ms: u32,
    pub text: String,
}

impl SubtitleTrack {
    pub fn new() -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            entries: Vec::new(),
        }
    }
}

impl SubtitleEntry {
    pub fn new(start_ms: u32, end_ms: u32, text: &str) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            start_ms,
            end_ms,
            text: text.to_string(),
        }
    }
}
