use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MotionPath {
    pub id: String,
    pub points: Vec<PathPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PathPoint {
    pub x: f64,
    pub y: f64,
    pub control_in: Option<ControlPoint>,
    pub control_out: Option<ControlPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ControlPoint {
    pub x: f64,
    pub y: f64,
}

impl MotionPath {
    pub fn new() -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            points: Vec::new(),
        }
    }

    pub fn with_points(points: Vec<PathPoint>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            points,
        }
    }
}

fn cubic_bezier(p0: f64, p1: f64, p2: f64, p3: f64, t: f64) -> f64 {
    let u = 1.0 - t;
    u * u * u * p0 + 3.0 * u * u * t * p1 + 3.0 * u * t * t * p2 + t * t * t * p3
}

fn segment_length_approx(
    ax: f64, ay: f64,
    c1x: f64, c1y: f64,
    c2x: f64, c2y: f64,
    bx: f64, by: f64,
    steps: usize,
) -> f64 {
    let mut length = 0.0;
    let mut px = ax;
    let mut py = ay;
    for i in 1..=steps {
        let t = i as f64 / steps as f64;
        let nx = cubic_bezier(ax, c1x, c2x, bx, t);
        let ny = cubic_bezier(ay, c1y, c2y, by, t);
        let dx = nx - px;
        let dy = ny - py;
        length += (dx * dx + dy * dy).sqrt();
        px = nx;
        py = ny;
    }
    length
}

pub fn evaluate_path(path: &MotionPath, progress: f64) -> Option<(f64, f64)> {
    if path.points.is_empty() {
        return None;
    }
    if path.points.len() == 1 {
        return Some((path.points[0].x, path.points[0].y));
    }

    let progress = progress.clamp(0.0, 1.0);
    let n = path.points.len() - 1;

    let steps_per_seg = 20;
    let mut seg_lengths = Vec::with_capacity(n);
    let mut total_length = 0.0;

    for i in 0..n {
        let a = &path.points[i];
        let b = &path.points[i + 1];
        let c1x = a.control_out.as_ref().map_or(a.x, |c| c.x);
        let c1y = a.control_out.as_ref().map_or(a.y, |c| c.y);
        let c2x = b.control_in.as_ref().map_or(b.x, |c| c.x);
        let c2y = b.control_in.as_ref().map_or(b.y, |c| c.y);
        let len = segment_length_approx(a.x, a.y, c1x, c1y, c2x, c2y, b.x, b.y, steps_per_seg);
        seg_lengths.push(len);
        total_length += len;
    }

    if total_length == 0.0 {
        return Some((path.points[0].x, path.points[0].y));
    }

    let target_dist = progress * total_length;
    let mut accumulated = 0.0;

    for i in 0..n {
        let seg_len = seg_lengths[i];
        if accumulated + seg_len >= target_dist || i == n - 1 {
            let local_t = if seg_len > 0.0 {
                ((target_dist - accumulated) / seg_len).clamp(0.0, 1.0)
            } else {
                0.0
            };

            let a = &path.points[i];
            let b = &path.points[i + 1];
            let c1x = a.control_out.as_ref().map_or(a.x, |c| c.x);
            let c1y = a.control_out.as_ref().map_or(a.y, |c| c.y);
            let c2x = b.control_in.as_ref().map_or(b.x, |c| c.x);
            let c2y = b.control_in.as_ref().map_or(b.y, |c| c.y);

            let x = cubic_bezier(a.x, c1x, c2x, b.x, local_t);
            let y = cubic_bezier(a.y, c1y, c2y, b.y, local_t);
            return Some((x, y));
        }
        accumulated += seg_len;
    }

    let last = &path.points[n];
    Some((last.x, last.y))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evaluate_path_at_start() {
        let path = MotionPath::with_points(vec![
            PathPoint { x: 0.0, y: 0.0, control_in: None, control_out: None },
            PathPoint { x: 100.0, y: 100.0, control_in: None, control_out: None },
        ]);
        let (x, y) = evaluate_path(&path, 0.0).unwrap();
        assert!((x - 0.0).abs() < 0.1);
        assert!((y - 0.0).abs() < 0.1);
    }

    #[test]
    fn test_evaluate_path_at_end() {
        let path = MotionPath::with_points(vec![
            PathPoint { x: 0.0, y: 0.0, control_in: None, control_out: None },
            PathPoint { x: 100.0, y: 100.0, control_in: None, control_out: None },
        ]);
        let (x, y) = evaluate_path(&path, 1.0).unwrap();
        assert!((x - 100.0).abs() < 0.1);
        assert!((y - 100.0).abs() < 0.1);
    }

    #[test]
    fn test_evaluate_straight_line_midpoint() {
        let path = MotionPath::with_points(vec![
            PathPoint { x: 0.0, y: 0.0, control_in: None, control_out: None },
            PathPoint { x: 100.0, y: 0.0, control_in: None, control_out: None },
        ]);
        let (x, y) = evaluate_path(&path, 0.5).unwrap();
        assert!((x - 50.0).abs() < 1.0, "got x={}", x);
        assert!((y - 0.0).abs() < 1.0);
    }

    #[test]
    fn test_evaluate_path_with_curve() {
        let path = MotionPath::with_points(vec![
            PathPoint {
                x: 0.0, y: 0.0,
                control_in: None,
                control_out: Some(ControlPoint { x: 50.0, y: -100.0 }),
            },
            PathPoint {
                x: 100.0, y: 0.0,
                control_in: Some(ControlPoint { x: 50.0, y: -100.0 }),
                control_out: None,
            },
        ]);
        let (x, y) = evaluate_path(&path, 0.5).unwrap();
        assert!(y < -10.0, "curve should go above the line, y={}", y);
        assert!((x - 50.0).abs() < 10.0);
    }

    #[test]
    fn test_evaluate_empty_path() {
        let path = MotionPath::with_points(vec![]);
        assert!(evaluate_path(&path, 0.5).is_none());
    }

    #[test]
    fn test_evaluate_single_point() {
        let path = MotionPath::with_points(vec![
            PathPoint { x: 42.0, y: 99.0, control_in: None, control_out: None },
        ]);
        let (x, y) = evaluate_path(&path, 0.5).unwrap();
        assert!((x - 42.0).abs() < 0.01);
        assert!((y - 99.0).abs() < 0.01);
    }

    #[test]
    fn test_serialization_roundtrip() {
        let path = MotionPath::with_points(vec![
            PathPoint {
                x: 10.0, y: 20.0,
                control_in: None,
                control_out: Some(ControlPoint { x: 30.0, y: 40.0 }),
            },
            PathPoint {
                x: 100.0, y: 200.0,
                control_in: Some(ControlPoint { x: 80.0, y: 180.0 }),
                control_out: None,
            },
        ]);
        let json = serde_json::to_string(&path).unwrap();
        let back: MotionPath = serde_json::from_str(&json).unwrap();
        assert_eq!(path, back);
    }
}
