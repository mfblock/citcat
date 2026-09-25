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
    /// Degrees, clockwise, 0 = top to bottom.
    ///
    /// Zero is what both renderers hardcoded before this field existed, so the
    /// serde default preserves every existing project's appearance. Ignored by
    /// `Radial`.
    #[serde(default)]
    pub angle: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum GradientType {
    Linear,
    Radial,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GradientStop {
    pub offset: f64,
    pub color: String,
}

impl Gradient {
    /// A gradient needs two stops to paint anything. With fewer, renderers fall
    /// back to the flat `fill` (D7 §3).
    ///
    /// This is deliberately *not* enforced when a gradient is stored: the editor
    /// builds one stop at a time, and rejecting a half-built gradient would make
    /// it unsaveable mid-edit.
    pub fn is_paintable(&self) -> bool {
        self.stops.len() >= 2
    }

    /// Stops sorted by offset and clamped to 0..1, ready to hand to a canvas.
    ///
    /// Both matter for the renderer's safety, not just its looks: the canvas
    /// `addColorStop` throws on an offset outside 0..1, and the visual result of
    /// out-of-order stops is undefined. Sorting here means no renderer has to
    /// remember to.
    pub fn paintable_stops(&self) -> Vec<GradientStop> {
        let mut stops: Vec<GradientStop> = self
            .stops
            .iter()
            .map(|s| GradientStop {
                offset: s.offset.clamp(0.0, 1.0),
                color: s.color.clone(),
            })
            .collect();
        stops.sort_by(|a, b| a.offset.partial_cmp(&b.offset).unwrap_or(std::cmp::Ordering::Equal));
        stops
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn g(kind: GradientType, stops: &[(f64, &str)]) -> Gradient {
        Gradient {
            gradient_type: kind,
            angle: 0.0,
            stops: stops
                .iter()
                .map(|(o, c)| GradientStop { offset: *o, color: (*c).into() })
                .collect(),
        }
    }

    // ---- Paintability (D7 §3) ----
    //
    // A half-built gradient is stored, not rejected: the editor adds stops one
    // at a time and must be able to save mid-edit. Renderers ask instead.

    #[test]
    fn two_stops_is_paintable() {
        assert!(g(GradientType::Linear, &[(0.0, "#000"), (1.0, "#fff")]).is_paintable());
    }

    #[test]
    fn fewer_than_two_stops_is_not_paintable() {
        assert!(!g(GradientType::Linear, &[]).is_paintable());
        assert!(!g(GradientType::Linear, &[(0.0, "#000")]).is_paintable());
    }

    // ---- Stop preparation ----

    #[test]
    fn paintable_stops_are_sorted_by_offset() {
        // Canvas addColorStop is order-dependent; an unsorted file would render
        // undefined rather than wrong-but-stable.
        let grad = g(
            GradientType::Linear,
            &[(1.0, "#ffffff"), (0.0, "#000000"), (0.5, "#ff0000")],
        );
        let offsets: Vec<f64> = grad.paintable_stops().iter().map(|s| s.offset).collect();
        assert_eq!(offsets, vec![0.0, 0.5, 1.0]);
    }

    #[test]
    fn paintable_stops_clamp_out_of_range_offsets() {
        // addColorStop *throws* outside 0..1, so this is a crash guard, not
        // cosmetics.
        let grad = g(GradientType::Linear, &[(-0.5, "#000000"), (1.7, "#ffffff")]);
        let offsets: Vec<f64> = grad.paintable_stops().iter().map(|s| s.offset).collect();
        assert_eq!(offsets, vec![0.0, 1.0]);
    }

    #[test]
    fn paintable_stops_does_not_mutate_the_gradient() {
        let grad = g(GradientType::Linear, &[(1.0, "#ffffff"), (0.0, "#000000")]);
        let _ = grad.paintable_stops();
        assert_eq!(grad.stops[0].offset, 1.0, "source order must be preserved");
    }

    #[test]
    fn stop_colours_survive_preparation_including_alpha() {
        let grad = g(GradientType::Linear, &[(0.0, "#ff000080"), (1.0, "#0000ff")]);
        let prepared = grad.paintable_stops();
        assert_eq!(prepared[0].color, "#ff000080");
        assert_eq!(prepared[1].color, "#0000ff");
    }

    // ---- Back-compat ----

    #[test]
    fn background_without_angle_deserialises() {
        let json = r##"{"fill":"#ffffff","gradient":{"gradient_type":"Linear",
            "stops":[{"offset":0.0,"color":"#000000"},{"offset":1.0,"color":"#ffffff"}]}}"##;
        let bg: Background = serde_json::from_str(json).expect("legacy background must load");
        let grad = bg.gradient.expect("gradient present");
        assert_eq!(grad.angle, 0.0, "default must match the old hardcoded top-to-bottom");
    }

    #[test]
    fn gradient_round_trips_with_angle() {
        let mut grad = g(GradientType::Radial, &[(0.0, "#000"), (1.0, "#fff")]);
        grad.angle = 137.5;
        let back: Gradient = serde_json::from_str(&serde_json::to_string(&grad).unwrap()).unwrap();
        assert_eq!(grad, back);
    }
}
