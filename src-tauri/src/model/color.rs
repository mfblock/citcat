//! Alpha-aware colour parsing, formatting and interpolation.
//!
//! Colours are stored as `String` throughout the model (see D7 §1), so nothing
//! about the wire format changes. What changes is that the maths now carries a
//! fourth channel: `#rrggbbaa` parses, alpha interpolates, and a result is
//! emitted as `#rrggbb` when it is fully opaque so existing projects keep
//! producing byte-identical output.
//!
//! Before this, `lerp_color` read exactly six digits and wrote exactly six, so
//! interpolating `#ff000080` silently dropped the alpha and produced an opaque
//! colour.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rgba {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
}

impl Rgba {
    pub fn is_opaque(&self) -> bool {
        self.a == 255
    }
}

/// Parses `#rgb`, `#rrggbb` and `#rrggbbaa`, with or without the leading `#`.
///
/// Returns `None` for anything else — including the CSS keyword `transparent`,
/// which the Hotspot default uses as a fill. Callers must decide what to do
/// with an unparseable colour rather than being handed a silent black.
pub fn parse_color(s: &str) -> Option<Rgba> {
    let hex = s.trim().trim_start_matches('#');
    if !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }

    let byte = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).ok();
    // "f" -> "ff": shorthand nibbles are doubled, not zero-padded.
    let nibble = |i: usize| {
        u8::from_str_radix(&hex[i..i + 1], 16)
            .ok()
            .map(|v| v * 17)
    };

    match hex.len() {
        3 => Some(Rgba {
            r: nibble(0)?,
            g: nibble(1)?,
            b: nibble(2)?,
            a: 255,
        }),
        6 => Some(Rgba {
            r: byte(0)?,
            g: byte(2)?,
            b: byte(4)?,
            a: 255,
        }),
        8 => Some(Rgba {
            r: byte(0)?,
            g: byte(2)?,
            b: byte(4)?,
            a: byte(6)?,
        }),
        _ => None,
    }
}

/// `#rrggbb` when fully opaque, `#rrggbbaa` otherwise.
///
/// The opaque case matters: it keeps every existing project emitting the same
/// six-digit colours it emits today.
pub fn format_color(c: Rgba) -> String {
    if c.is_opaque() {
        format!("#{:02x}{:02x}{:02x}", c.r, c.g, c.b)
    } else {
        format!("#{:02x}{:02x}{:02x}{:02x}", c.r, c.g, c.b, c.a)
    }
}

fn lerp_u8(a: u8, b: u8, t: f64) -> u8 {
    (a as f64 + (b as f64 - a as f64) * t).round().clamp(0.0, 255.0) as u8
}

/// Blends two colours, alpha included.
///
/// If either side is not a hex colour — `transparent`, a CSS keyword, a typo —
/// there is nothing sensible to blend, so this holds `c1`. Combined with
/// `interpolate`'s existing "return the last keyframe's value at or past its
/// time" rule, that reads as a snap at the later keyframe rather than a fade
/// through black, which is what the old code produced.
pub fn lerp_color(c1: &str, c2: &str, t: f64) -> String {
    match (parse_color(c1), parse_color(c2)) {
        (Some(a), Some(b)) => format_color(Rgba {
            r: lerp_u8(a.r, b.r, t),
            g: lerp_u8(a.g, b.g, t),
            b: lerp_u8(a.b, b.b, t),
            a: lerp_u8(a.a, b.a, t),
        }),
        _ => c1.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_six_digit() {
        assert_eq!(
            parse_color("#ff8000"),
            Some(Rgba { r: 255, g: 128, b: 0, a: 255 })
        );
    }

    #[test]
    fn parses_without_hash() {
        assert_eq!(parse_color("ff8000"), parse_color("#ff8000"));
    }

    #[test]
    fn parses_three_digit_shorthand() {
        // #f80 is #ff8800, not #f08000 -- nibbles double.
        assert_eq!(
            parse_color("#f80"),
            Some(Rgba { r: 255, g: 136, b: 0, a: 255 })
        );
        assert_eq!(parse_color("#fff"), parse_color("#ffffff"));
        assert_eq!(parse_color("#000"), parse_color("#000000"));
    }

    #[test]
    fn parses_eight_digit_with_alpha() {
        assert_eq!(
            parse_color("#ff000080"),
            Some(Rgba { r: 255, g: 0, b: 0, a: 128 })
        );
        assert_eq!(
            parse_color("#00000000"),
            Some(Rgba { r: 0, g: 0, b: 0, a: 0 })
        );
    }

    #[test]
    fn six_digit_forms_are_opaque() {
        assert!(parse_color("#123456").unwrap().is_opaque());
        assert!(parse_color("#abc").unwrap().is_opaque());
    }

    #[test]
    fn rejects_non_hex() {
        // The Hotspot default fill is literally this. The old parser turned it
        // into black without complaint.
        assert_eq!(parse_color("transparent"), None);
        assert_eq!(parse_color("red"), None);
        assert_eq!(parse_color(""), None);
        assert_eq!(parse_color("#12345"), None, "5 digits is not a colour");
        assert_eq!(parse_color("#zzzzzz"), None);
    }

    #[test]
    fn formats_opaque_as_six_digits() {
        assert_eq!(
            format_color(Rgba { r: 255, g: 128, b: 0, a: 255 }),
            "#ff8000"
        );
    }

    #[test]
    fn formats_translucent_as_eight_digits() {
        assert_eq!(
            format_color(Rgba { r: 255, g: 0, b: 0, a: 128 }),
            "#ff000080"
        );
    }

    #[test]
    fn round_trips() {
        for s in ["#ff8000", "#ff000080", "#00000000", "#ffffff"] {
            assert_eq!(format_color(parse_color(s).unwrap()), s);
        }
    }

    #[test]
    fn lerps_rgb_at_midpoint() {
        let got = lerp_color("#000000", "#ffffff", 0.5);
        let c = parse_color(&got).unwrap();
        assert!((c.r as i32 - 128).abs() <= 1, "got {}", got);
        assert!(c.is_opaque(), "opaque endpoints must stay opaque: {}", got);
    }

    #[test]
    fn lerps_alpha_at_midpoint() {
        // The headline case: this produced "#ff0000" before, dropping alpha.
        let got = lerp_color("#ff0000ff", "#ff000000", 0.5);
        let c = parse_color(&got).unwrap();
        assert!((c.a as i32 - 128).abs() <= 1, "alpha not blended: {}", got);
        assert_eq!(c.r, 255);
        assert_eq!(got.len(), 9, "translucent result must carry alpha: {}", got);
    }

    #[test]
    fn lerps_between_mixed_length_forms() {
        // Six-digit is implicitly opaque, so this fades out.
        let got = lerp_color("#ff0000", "#ff000000", 0.5);
        let c = parse_color(&got).unwrap();
        assert!((c.a as i32 - 128).abs() <= 1, "got {}", got);
    }

    #[test]
    fn lerp_endpoints_are_exact() {
        assert_eq!(lerp_color("#000000", "#ffffff", 0.0), "#000000");
        assert_eq!(lerp_color("#000000", "#ffffff", 1.0), "#ffffff");
        assert_eq!(lerp_color("#ff0000ff", "#ff000000", 1.0), "#ff000000");
    }

    #[test]
    fn lerp_holds_when_a_side_is_unparseable() {
        assert_eq!(lerp_color("transparent", "#ff0000", 0.5), "transparent");
        assert_eq!(lerp_color("#ff0000", "transparent", 0.5), "#ff0000");
    }
}
