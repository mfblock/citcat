use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::color::lerp_color;
use super::{Gradient, GradientStop};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Keyframe {
    pub id: String,
    pub time_ms: u32,
    pub property: String,
    pub value: KeyframeValue,
    pub easing: Easing,
}

/// A keyframe's value.
///
/// `Number`, `Color`, `Bool` and `Gradient` are concrete values and are what
/// reaches the playback runtime. They are meaningful in a saved `.citcat`
/// project and every one of them must be understood by the JS engine.
///
/// `Offset` and `Scale` are **effect-template only**. They let a preset say
/// "8px left of wherever this object is" or "1.3x its natural size" without
/// knowing the object in advance. `effect_apply` resolves them against the
/// target object's transform and writes plain `Number`s onto the object, so
/// the JS runtime never encounters them. They are not meaningful in a saved
/// `.citcat` project and `interpolate` does not blend them.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "value")]
pub enum KeyframeValue {
    Number(f64),
    Color(String),
    Bool(bool),
    /// A whole gradient. Animatable on `style.fill_gradient` and
    /// `style.stroke_gradient`.
    Gradient(Gradient),
    /// Added to the object's current value for this property.
    Offset(f64),
    /// Multiplied by the object's current value for this property.
    Scale(f64),
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

/// Blends two gradients stop by stop.
///
/// Only when both sides agree on `gradient_type` and stop count. Otherwise the
/// earlier value is held for the whole segment, which — together with
/// `interpolate` returning the last keyframe's value at or past its time —
/// reads as a snap at the later keyframe (D7 §4).
///
/// Resampling a 3-stop gradient onto a 5-stop one has no single right answer,
/// and a silent guess would be worse than a visible cut.
fn lerp_gradient(g1: &Gradient, g2: &Gradient, t: f64) -> Gradient {
    if g1.gradient_type != g2.gradient_type || g1.stops.len() != g2.stops.len() {
        return g1.clone();
    }
    Gradient {
        gradient_type: g1.gradient_type,
        angle: g1.angle + (g2.angle - g1.angle) * t,
        stops: g1
            .stops
            .iter()
            .zip(g2.stops.iter())
            .map(|(s1, s2)| GradientStop {
                offset: s1.offset + (s2.offset - s1.offset) * t,
                color: lerp_color(&s1.color, &s2.color, t),
            })
            .collect(),
    }
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
        (KeyframeValue::Gradient(g1), KeyframeValue::Gradient(g2)) => {
            Some(KeyframeValue::Gradient(lerp_gradient(g1, g2, t)))
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
    use crate::model::GradientType;

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

    // ---- Alpha (D7 §1) ----
    //
    // The old lerp_color read six hex digits and wrote six, so any alpha in a
    // colour was discarded the moment it was animated.

    fn colour_kfs(c1: &str, c2: &str) -> Vec<Keyframe> {
        vec![
            Keyframe::new(0, "style.fill", KeyframeValue::Color(c1.into()), Easing::Linear),
            Keyframe::new(1000, "style.fill", KeyframeValue::Color(c2.into()), Easing::Linear),
        ]
    }

    fn fill_at(kfs: &[Keyframe], t: u32) -> String {
        match interpolate(kfs, "style.fill", t) {
            Some(KeyframeValue::Color(c)) => c,
            other => panic!("expected Color, got {:?}", other),
        }
    }

    #[test]
    fn test_interpolate_colour_carries_alpha() {
        let kfs = colour_kfs("#ff0000ff", "#ff000000");
        let mid = fill_at(&kfs, 500);
        let c = crate::model::color::parse_color(&mid).expect("parseable");
        assert!(
            (c.a as i32 - 128).abs() <= 1,
            "alpha must blend, got {} from {}",
            c.a, mid
        );
    }

    #[test]
    fn test_interpolate_opaque_colours_stay_six_digits() {
        // Back-compat: every existing project animates opaque colours and must
        // keep producing the exact strings it produces today.
        let kfs = colour_kfs("#000000", "#ffffff");
        let mid = fill_at(&kfs, 500);
        assert_eq!(mid.len(), 7, "expected #rrggbb, got {}", mid);
    }

    #[test]
    fn test_interpolate_shorthand_colour() {
        let kfs = colour_kfs("#f00", "#00f");
        let mid = fill_at(&kfs, 500);
        let c = crate::model::color::parse_color(&mid).expect("parseable");
        assert!(c.r > 100 && c.b > 100, "expected a blend of red and blue, got {}", mid);
    }

    // ---- Gradient keyframes (D7 §4) ----

    fn grad(kind: GradientType, angle: f64, stops: &[(f64, &str)]) -> Gradient {
        Gradient {
            gradient_type: kind,
            angle,
            stops: stops
                .iter()
                .map(|(o, c)| GradientStop { offset: *o, color: (*c).into() })
                .collect(),
        }
    }

    fn gradient_kfs(g1: Gradient, g2: Gradient) -> Vec<Keyframe> {
        vec![
            Keyframe::new(0, "style.fill_gradient", KeyframeValue::Gradient(g1), Easing::Linear),
            Keyframe::new(1000, "style.fill_gradient", KeyframeValue::Gradient(g2), Easing::Linear),
        ]
    }

    fn gradient_at(kfs: &[Keyframe], t: u32) -> Gradient {
        match interpolate(kfs, "style.fill_gradient", t) {
            Some(KeyframeValue::Gradient(g)) => g,
            other => panic!("expected Gradient, got {:?}", other),
        }
    }

    #[test]
    fn test_gradient_interpolates_stop_by_stop() {
        let kfs = gradient_kfs(
            grad(GradientType::Linear, 0.0, &[(0.0, "#000000"), (1.0, "#ff0000")]),
            grad(GradientType::Linear, 0.0, &[(0.0, "#ffffff"), (1.0, "#0000ff")]),
        );
        let mid = gradient_at(&kfs, 500);
        assert_eq!(mid.stops.len(), 2);

        let s0 = crate::model::color::parse_color(&mid.stops[0].color).unwrap();
        assert!((s0.r as i32 - 128).abs() <= 1, "first stop should be mid grey");

        let s1 = crate::model::color::parse_color(&mid.stops[1].color).unwrap();
        assert!(s1.r > 100 && s1.b > 100, "second stop should blend red into blue");
    }

    #[test]
    fn test_gradient_interpolates_offsets_and_angle() {
        let kfs = gradient_kfs(
            grad(GradientType::Linear, 0.0, &[(0.0, "#000000"), (0.5, "#ffffff")]),
            grad(GradientType::Linear, 90.0, &[(0.0, "#000000"), (1.0, "#ffffff")]),
        );
        let mid = gradient_at(&kfs, 500);
        assert!((mid.angle - 45.0).abs() < 0.01, "angle should blend, got {}", mid.angle);
        assert!(
            (mid.stops[1].offset - 0.75).abs() < 0.01,
            "offset should blend, got {}",
            mid.stops[1].offset
        );
    }

    #[test]
    fn test_gradient_alpha_blends_in_stops() {
        // The headline use: a gradient that fades to transparent.
        let kfs = gradient_kfs(
            grad(GradientType::Linear, 0.0, &[(0.0, "#ff0000ff"), (1.0, "#ff0000ff")]),
            grad(GradientType::Linear, 0.0, &[(0.0, "#ff0000ff"), (1.0, "#ff000000")]),
        );
        let mid = gradient_at(&kfs, 500);
        let last = crate::model::color::parse_color(&mid.stops[1].color).unwrap();
        assert!(
            (last.a as i32 - 128).abs() <= 1,
            "gradient stop alpha must blend, got {}",
            mid.stops[1].color
        );
    }

    #[test]
    fn test_gradient_snaps_on_stop_count_mismatch() {
        let a = grad(GradientType::Linear, 0.0, &[(0.0, "#000000"), (1.0, "#ffffff")]);
        let b = grad(
            GradientType::Linear,
            0.0,
            &[(0.0, "#000000"), (0.5, "#ff0000"), (1.0, "#ffffff")],
        );
        let kfs = gradient_kfs(a.clone(), b.clone());

        // Mid-segment holds the earlier gradient rather than inventing a blend.
        assert_eq!(gradient_at(&kfs, 500), a);
        // And snaps to the later one at its keyframe.
        assert_eq!(gradient_at(&kfs, 1000), b);
    }

    #[test]
    fn test_gradient_snaps_on_type_mismatch() {
        // The stops and angle differ too, so a blend would be visibly distinct
        // from a snap. With identical stops on both sides this test would pass
        // even if the type guard were removed.
        let a = grad(GradientType::Linear, 0.0, &[(0.0, "#000000"), (1.0, "#ffffff")]);
        let b = grad(GradientType::Radial, 90.0, &[(0.0, "#ff0000"), (1.0, "#0000ff")]);
        let kfs = gradient_kfs(a.clone(), b.clone());
        assert_eq!(gradient_at(&kfs, 500), a, "a linear must not morph into a radial");
        assert_eq!(gradient_at(&kfs, 1000), b);
    }

    #[test]
    fn test_gradient_keyframe_survives_serde_round_trip() {
        let g = grad(GradientType::Radial, 33.0, &[(0.0, "#ff000080"), (1.0, "#0000ff")]);
        let kf = Keyframe::new(
            250,
            "style.fill_gradient",
            KeyframeValue::Gradient(g),
            Easing::EaseInOut,
        );
        let json = serde_json::to_string(&kf).unwrap();
        let back: Keyframe = serde_json::from_str(&json).unwrap();
        assert_eq!(kf, back);
        assert!(json.contains(r#""type":"Gradient""#), "wire tag missing: {}", json);
    }

    #[test]
    fn test_gradient_angle_defaults_to_zero_when_absent() {
        // Every gradient written before `angle` existed must deserialise, and
        // must keep its old top-to-bottom appearance.
        let json = r##"{"gradient_type":"Linear","stops":[
            {"offset":0.0,"color":"#000000"},{"offset":1.0,"color":"#ffffff"}]}"##;
        let g: Gradient = serde_json::from_str(json).unwrap();
        assert_eq!(g.angle, 0.0);
        assert!(g.is_paintable());
    }
}
