use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Keyframe {
    pub id: String,
    pub time_ms: u32,
    pub property: String,
    pub value: KeyframeValue,
    pub easing: Easing,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "value")]
pub enum KeyframeValue {
    Number(f64),
    Color(String),
    Bool(bool),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Easing {
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
}

impl Keyframe {
    pub fn new(time_ms: u32, property: &str, value: KeyframeValue, easing: Easing) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            time_ms,
            property: property.to_string(),
            value,
            easing,
        }
    }
}

#[allow(dead_code)]
fn apply_easing(t: f64, easing: &Easing) -> f64 {
    match easing {
        Easing::Linear => t,
        Easing::EaseIn => t * t * t,
        Easing::EaseOut => 1.0 - (1.0 - t).powi(3),
        Easing::EaseInOut => {
            if t < 0.5 {
                4.0 * t * t * t
            } else {
                1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
            }
        }
    }
}

#[allow(dead_code)]
fn lerp_color(c1: &str, c2: &str, t: f64) -> String {
    let parse_hex = |hex: &str| -> (u8, u8, u8) {
        let hex = hex.trim_start_matches('#');
        let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
        let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
        let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
        (r, g, b)
    };
    let (r1, g1, b1) = parse_hex(c1);
    let (r2, g2, b2) = parse_hex(c2);
    let r = (r1 as f64 + (r2 as f64 - r1 as f64) * t).round() as u8;
    let g = (g1 as f64 + (g2 as f64 - g1 as f64) * t).round() as u8;
    let b = (b1 as f64 + (b2 as f64 - b1 as f64) * t).round() as u8;
    format!("#{:02x}{:02x}{:02x}", r, g, b)
}

#[allow(dead_code)]
pub fn interpolate(keyframes: &[Keyframe], property: &str, time_ms: u32) -> Option<KeyframeValue> {
    let relevant: Vec<&Keyframe> = keyframes.iter().filter(|k| k.property == property).collect();
    if relevant.is_empty() {
        return None;
    }

    if relevant.len() == 1 {
        return Some(relevant[0].value.clone());
    }

    let first = relevant[0];
    let last = relevant[relevant.len() - 1];

    if time_ms <= first.time_ms {
        return Some(first.value.clone());
    }
    if time_ms >= last.time_ms {
        return Some(last.value.clone());
    }

    let mut before = first;
    let mut after = relevant[1];
    for i in 0..relevant.len() - 1 {
        if relevant[i].time_ms <= time_ms && relevant[i + 1].time_ms >= time_ms {
            before = relevant[i];
            after = relevant[i + 1];
            break;
        }
    }

    let duration = (after.time_ms - before.time_ms) as f64;
    if duration == 0.0 {
        return Some(after.value.clone());
    }
    let raw_t = (time_ms - before.time_ms) as f64 / duration;
    let t = apply_easing(raw_t, &after.easing);

    match (&before.value, &after.value) {
        (KeyframeValue::Number(v1), KeyframeValue::Number(v2)) => {
            Some(KeyframeValue::Number(v1 + (v2 - v1) * t))
        }
        (KeyframeValue::Color(c1), KeyframeValue::Color(c2)) => {
            Some(KeyframeValue::Color(lerp_color(c1, c2, t)))
        }
        (KeyframeValue::Bool(_), KeyframeValue::Bool(_)) => {
            if raw_t < 1.0 {
                Some(before.value.clone())
            } else {
                Some(after.value.clone())
            }
        }
        _ => Some(before.value.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_kf(time_ms: u32, val: f64, easing: Easing) -> Keyframe {
        Keyframe::new(time_ms, "transform.x", KeyframeValue::Number(val), easing)
    }

    #[test]
    fn test_interpolate_no_keyframes() {
        let kfs: Vec<Keyframe> = vec![];
        assert!(interpolate(&kfs, "transform.x", 500).is_none());
    }

    #[test]
    fn test_interpolate_single_keyframe() {
        let kfs = vec![make_kf(200, 100.0, Easing::Linear)];
        let result = interpolate(&kfs, "transform.x", 0);
        assert_eq!(result, Some(KeyframeValue::Number(100.0)));
        let result = interpolate(&kfs, "transform.x", 500);
        assert_eq!(result, Some(KeyframeValue::Number(100.0)));
    }

    #[test]
    fn test_interpolate_before_first() {
        let kfs = vec![
            make_kf(100, 0.0, Easing::Linear),
            make_kf(500, 200.0, Easing::Linear),
        ];
        let result = interpolate(&kfs, "transform.x", 50);
        assert_eq!(result, Some(KeyframeValue::Number(0.0)));
    }

    #[test]
    fn test_interpolate_after_last() {
        let kfs = vec![
            make_kf(100, 0.0, Easing::Linear),
            make_kf(500, 200.0, Easing::Linear),
        ];
        let result = interpolate(&kfs, "transform.x", 600);
        assert_eq!(result, Some(KeyframeValue::Number(200.0)));
    }

    #[test]
    fn test_interpolate_linear_midpoint() {
        let kfs = vec![
            make_kf(0, 0.0, Easing::Linear),
            make_kf(1000, 100.0, Easing::Linear),
        ];
        let result = interpolate(&kfs, "transform.x", 500);
        match result {
            Some(KeyframeValue::Number(v)) => assert!((v - 50.0).abs() < 0.01),
            _ => panic!("Expected Number"),
        }
    }

    #[test]
    fn test_interpolate_linear_quarter() {
        let kfs = vec![
            make_kf(0, 0.0, Easing::Linear),
            make_kf(1000, 100.0, Easing::Linear),
        ];
        let result = interpolate(&kfs, "transform.x", 250);
        match result {
            Some(KeyframeValue::Number(v)) => assert!((v - 25.0).abs() < 0.01),
            _ => panic!("Expected Number"),
        }
    }

    #[test]
    fn test_interpolate_ease_in() {
        let kfs = vec![
            make_kf(0, 0.0, Easing::Linear),
            make_kf(1000, 100.0, Easing::EaseIn),
        ];
        let result = interpolate(&kfs, "transform.x", 500);
        match result {
            Some(KeyframeValue::Number(v)) => {
                assert!(v < 50.0, "EaseIn at midpoint should be less than linear (got {})", v);
                assert!(v > 0.0);
            }
            _ => panic!("Expected Number"),
        }
    }

    #[test]
    fn test_interpolate_ease_out() {
        let kfs = vec![
            make_kf(0, 0.0, Easing::Linear),
            make_kf(1000, 100.0, Easing::EaseOut),
        ];
        let result = interpolate(&kfs, "transform.x", 500);
        match result {
            Some(KeyframeValue::Number(v)) => {
                assert!(v > 50.0, "EaseOut at midpoint should be more than linear (got {})", v);
                assert!(v < 100.0);
            }
            _ => panic!("Expected Number"),
        }
    }

    #[test]
    fn test_interpolate_three_keyframes() {
        let kfs = vec![
            make_kf(0, 0.0, Easing::Linear),
            make_kf(500, 100.0, Easing::Linear),
            make_kf(1000, 50.0, Easing::Linear),
        ];
        let result = interpolate(&kfs, "transform.x", 250);
        match result {
            Some(KeyframeValue::Number(v)) => assert!((v - 50.0).abs() < 0.01),
            _ => panic!("Expected Number"),
        }
        let result = interpolate(&kfs, "transform.x", 750);
        match result {
            Some(KeyframeValue::Number(v)) => assert!((v - 75.0).abs() < 0.01),
            _ => panic!("Expected Number"),
        }
    }

    #[test]
    fn test_interpolate_color() {
        let kfs = vec![
            Keyframe::new(0, "style.fill", KeyframeValue::Color("#000000".to_string()), Easing::Linear),
            Keyframe::new(1000, "style.fill", KeyframeValue::Color("#ffffff".to_string()), Easing::Linear),
        ];
        let result = interpolate(&kfs, "style.fill", 500);
        match result {
            Some(KeyframeValue::Color(c)) => {
                assert_eq!(c.len(), 7);
                assert!(c.starts_with('#'));
            }
            _ => panic!("Expected Color"),
        }
    }

    #[test]
    fn test_interpolate_bool_snaps() {
        let kfs = vec![
            Keyframe::new(0, "visible", KeyframeValue::Bool(true), Easing::Linear),
            Keyframe::new(1000, "visible", KeyframeValue::Bool(false), Easing::Linear),
        ];
        assert_eq!(
            interpolate(&kfs, "visible", 500),
            Some(KeyframeValue::Bool(true))
        );
        assert_eq!(
            interpolate(&kfs, "visible", 1000),
            Some(KeyframeValue::Bool(false))
        );
    }

    #[test]
    fn test_interpolate_wrong_property() {
        let kfs = vec![make_kf(0, 0.0, Easing::Linear)];
        assert!(interpolate(&kfs, "transform.y", 500).is_none());
    }
}
