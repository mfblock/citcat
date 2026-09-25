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

/// Samples per segment used to build the arc-length table. A cubic Bézier's
/// parameter `t` advances at a wildly varying rate along the curve, so mapping
/// distance to `t` needs a lookup table; 64 keeps a sharply curved segment
/// within a fraction of a pixel of true constant speed.
const SAMPLES_PER_SEGMENT: usize = 64;

/// Maps arc length to curve parameter for one cubic Bézier segment.
///
/// `ts[i]` and `dists[i]` are parallel: `dists[i]` is the distance travelled
/// along the curve from its start up to parameter `ts[i]`.
struct SegmentTable {
    ts: Vec<f64>,
    dists: Vec<f64>,
    length: f64,
}

fn build_segment_table(
    ax: f64, ay: f64,
    c1x: f64, c1y: f64,
    c2x: f64, c2y: f64,
    bx: f64, by: f64,
    samples: usize,
) -> SegmentTable {
    let mut ts = Vec::with_capacity(samples + 1);
    let mut dists = Vec::with_capacity(samples + 1);
    ts.push(0.0);
    dists.push(0.0);

    let mut px = ax;
    let mut py = ay;
    let mut acc = 0.0;
    for i in 1..=samples {
        let t = i as f64 / samples as f64;
        let nx = cubic_bezier(ax, c1x, c2x, bx, t);
        let ny = cubic_bezier(ay, c1y, c2y, by, t);
        let dx = nx - px;
        let dy = ny - py;
        acc += (dx * dx + dy * dy).sqrt();
        ts.push(t);
        dists.push(acc);
        px = nx;
        py = ny;
    }

    SegmentTable { ts, dists, length: acc }
}

/// Inverts the arc-length table: given a distance along the segment, returns the
/// curve parameter `t` that lands there. Binary search for the bracketing pair,
/// then linear interpolation between them.
fn t_for_distance(table: &SegmentTable, dist: f64) -> f64 {
    if table.length <= 0.0 {
        return 0.0;
    }
    let d = dist.clamp(0.0, table.length);

    let mut lo = 0usize;
    let mut hi = table.dists.len() - 1;
    while lo < hi {
        let mid = (lo + hi) / 2;
        if table.dists[mid] < d {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    if lo == 0 {
        return table.ts[0];
    }

    let d0 = table.dists[lo - 1];
    let d1 = table.dists[lo];
    let span = d1 - d0;
    let frac = if span > 0.0 { (d - d0) / span } else { 0.0 };
    table.ts[lo - 1] + (table.ts[lo] - table.ts[lo - 1]) * frac
}

fn control_points(a: &PathPoint, b: &PathPoint) -> (f64, f64, f64, f64) {
    (
        a.control_out.as_ref().map_or(a.x, |c| c.x),
        a.control_out.as_ref().map_or(a.y, |c| c.y),
        b.control_in.as_ref().map_or(b.x, |c| c.x),
        b.control_in.as_ref().map_or(b.y, |c| c.y),
    )
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

    let mut tables = Vec::with_capacity(n);
    let mut total_length = 0.0;

    for i in 0..n {
        let a = &path.points[i];
        let b = &path.points[i + 1];
        let (c1x, c1y, c2x, c2y) = control_points(a, b);
        let table = build_segment_table(
            a.x, a.y, c1x, c1y, c2x, c2y, b.x, b.y, SAMPLES_PER_SEGMENT,
        );
        total_length += table.length;
        tables.push(table);
    }

    if total_length == 0.0 {
        return Some((path.points[0].x, path.points[0].y));
    }

    let target_dist = progress * total_length;
    let mut accumulated = 0.0;

    for i in 0..n {
        let table = &tables[i];
        if accumulated + table.length >= target_dist || i == n - 1 {
            // Distance into this segment, converted to a curve parameter through
            // the arc-length table. Using the distance fraction directly as `t`
            // is what made objects crawl at the ends and race through the middle.
            let local_t = t_for_distance(table, target_dist - accumulated);

            let a = &path.points[i];
            let b = &path.points[i + 1];
            let (c1x, c1y, c2x, c2y) = control_points(a, b);

            let x = cubic_bezier(a.x, c1x, c2x, b.x, local_t);
            let y = cubic_bezier(a.y, c1y, c2y, b.y, local_t);
            return Some((x, y));
        }
        accumulated += table.length;
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

    /// Samples `steps` evenly spaced progress values and returns the distance
    /// travelled between each consecutive pair.
    fn step_distances(path: &MotionPath, steps: usize) -> Vec<f64> {
        let mut out = Vec::with_capacity(steps);
        let mut prev = evaluate_path(path, 0.0).unwrap();
        for i in 1..=steps {
            let p = evaluate_path(path, i as f64 / steps as f64).unwrap();
            let (dx, dy) = (p.0 - prev.0, p.1 - prev.1);
            out.push((dx * dx + dy * dy).sqrt());
            prev = p;
        }
        out
    }

    #[test]
    fn test_straight_line_has_constant_speed() {
        // The bug this catches: feeding the arc-length fraction into the Bezier
        // as its parameter gave ~5.8px steps at the ends and ~59.8px in the
        // middle of this exact path. The old midpoint-only test passed anyway
        // because the error is symmetric and cancels at t=0.5.
        let path = MotionPath::with_points(vec![
            PathPoint { x: 0.0, y: 0.0, control_in: None, control_out: None },
            PathPoint { x: 800.0, y: 0.0, control_in: None, control_out: None },
        ]);
        let steps = step_distances(&path, 20);
        let expected = 800.0 / 20.0;
        for (i, d) in steps.iter().enumerate() {
            assert!(
                (d - expected).abs() < 0.5,
                "step {} was {:.2}px, expected {:.2}px (all steps: {:?})",
                i, d, expected, steps
            );
        }
    }

    #[test]
    fn test_straight_line_off_midpoint_positions() {
        let path = MotionPath::with_points(vec![
            PathPoint { x: 0.0, y: 0.0, control_in: None, control_out: None },
            PathPoint { x: 100.0, y: 0.0, control_in: None, control_out: None },
        ]);
        for (progress, expected) in [(0.1, 10.0), (0.25, 25.0), (0.75, 75.0), (0.9, 90.0)] {
            let (x, _) = evaluate_path(&path, progress).unwrap();
            assert!(
                (x - expected).abs() < 0.5,
                "progress {} gave x={:.2}, expected {:.2}",
                progress, x, expected
            );
        }
    }

    #[test]
    fn test_curved_path_has_even_speed() {
        // A strongly curved segment: parameter-space motion here is very uneven,
        // so this fails hard without arc-length reparameterisation.
        let path = MotionPath::with_points(vec![
            PathPoint {
                x: 0.0, y: 0.0,
                control_in: None,
                control_out: Some(ControlPoint { x: 0.0, y: -300.0 }),
            },
            PathPoint {
                x: 400.0, y: 0.0,
                control_in: Some(ControlPoint { x: 400.0, y: -300.0 }),
                control_out: None,
            },
        ]);
        let steps = step_distances(&path, 20);
        let min = steps.iter().cloned().fold(f64::INFINITY, f64::min);
        let max = steps.iter().cloned().fold(0.0, f64::max);
        assert!(
            max / min < 1.15,
            "speed varied by {:.2}x across the curve (min {:.2}, max {:.2}): {:?}",
            max / min, min, max, steps
        );
    }

    #[test]
    fn test_multi_segment_no_stutter_at_waypoint() {
        // Three collinear, evenly spaced points: crossing the middle waypoint
        // must not change speed. Per-segment parameterisation stuttered here.
        let path = MotionPath::with_points(vec![
            PathPoint { x: 0.0, y: 0.0, control_in: None, control_out: None },
            PathPoint { x: 300.0, y: 0.0, control_in: None, control_out: None },
            PathPoint { x: 600.0, y: 0.0, control_in: None, control_out: None },
        ]);
        let steps = step_distances(&path, 30);
        let expected = 600.0 / 30.0;
        for (i, d) in steps.iter().enumerate() {
            assert!(
                (d - expected).abs() < 0.5,
                "step {} across the waypoint was {:.2}px, expected {:.2}px",
                i, d, expected
            );
        }
    }

    #[test]
    fn test_progress_is_monotonic_along_curve() {
        let path = MotionPath::with_points(vec![
            PathPoint {
                x: 0.0, y: 0.0,
                control_in: None,
                control_out: Some(ControlPoint { x: 200.0, y: -150.0 }),
            },
            PathPoint {
                x: 500.0, y: 100.0,
                control_in: Some(ControlPoint { x: 300.0, y: 250.0 }),
                control_out: None,
            },
        ]);
        let mut prev_x = f64::NEG_INFINITY;
        for i in 0..=50 {
            let (x, _) = evaluate_path(&path, i as f64 / 50.0).unwrap();
            assert!(x >= prev_x - 0.001, "x went backwards at step {}: {} -> {}", i, prev_x, x);
            prev_x = x;
        }
    }

    #[test]
    fn test_progress_clamps_outside_range() {
        let path = MotionPath::with_points(vec![
            PathPoint { x: 10.0, y: 10.0, control_in: None, control_out: None },
            PathPoint { x: 90.0, y: 10.0, control_in: None, control_out: None },
        ]);
        let (x, _) = evaluate_path(&path, -0.5).unwrap();
        assert!((x - 10.0).abs() < 0.1, "negative progress should clamp to start");
        let (x, _) = evaluate_path(&path, 1.5).unwrap();
        assert!((x - 90.0).abs() < 0.1, "progress past 1 should clamp to end");
    }

    #[test]
    fn test_zero_length_path_returns_first_point() {
        let path = MotionPath::with_points(vec![
            PathPoint { x: 50.0, y: 50.0, control_in: None, control_out: None },
            PathPoint { x: 50.0, y: 50.0, control_in: None, control_out: None },
        ]);
        let (x, y) = evaluate_path(&path, 0.5).unwrap();
        assert!((x - 50.0).abs() < 0.01 && (y - 50.0).abs() < 0.01);
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
