use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WaitPoint {
    pub id: String,
    pub time_ms: u32,
    pub resume_on: ResumeCondition,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum ResumeCondition {
    Click { object_id: String },
    AnyClick,
    Timer { delay_ms: u32 },
    ClickOrTimer {
        object_id: Option<String>,
        delay_ms: u32,
    },
}

impl WaitPoint {
    pub fn new(time_ms: u32, resume_on: ResumeCondition) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            time_ms,
            resume_on,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_waitpoint_serialization_roundtrip() {
        let wp = WaitPoint::new(3000, ResumeCondition::AnyClick);
        let json = serde_json::to_string(&wp).expect("serialize");
        let back: WaitPoint = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(wp, back);
    }

    #[test]
    fn test_waitpoint_click_roundtrip() {
        let wp = WaitPoint::new(
            1500,
            ResumeCondition::Click {
                object_id: "btn-1".to_string(),
            },
        );
        let json = serde_json::to_string(&wp).expect("serialize");
        let back: WaitPoint = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(wp, back);
    }

    #[test]
    fn test_waitpoint_click_or_timer_roundtrip() {
        let wp = WaitPoint::new(
            2000,
            ResumeCondition::ClickOrTimer {
                object_id: Some("btn-2".to_string()),
                delay_ms: 5000,
            },
        );
        let json = serde_json::to_string(&wp).expect("serialize");
        let back: WaitPoint = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(wp, back);
    }

    #[test]
    fn test_waitpoint_timer_roundtrip() {
        let wp = WaitPoint::new(4000, ResumeCondition::Timer { delay_ms: 10000 });
        let json = serde_json::to_string(&wp).expect("serialize");
        let back: WaitPoint = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(wp, back);
    }
}
