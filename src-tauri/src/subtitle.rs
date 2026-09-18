use crate::model::{SubtitleEntry, SubtitleTrack};

pub fn parse_srt(content: &str) -> SubtitleTrack {
    let mut track = SubtitleTrack::new();
    let blocks: Vec<&str> = content.split("\n\n").collect();

    for block in blocks {
        let lines: Vec<&str> = block.trim().lines().collect();
        if lines.len() < 3 {
            continue;
        }

        // Line 0: sequence number (ignored)
        // Line 1: timestamps "00:00:01,500 --> 00:00:04,000"
        // Line 2+: text
        let timestamps = lines[1];
        let parts: Vec<&str> = timestamps.split("-->").collect();
        if parts.len() != 2 {
            continue;
        }

        let start_ms = parse_srt_time(parts[0].trim());
        let end_ms = parse_srt_time(parts[1].trim());

        if start_ms.is_none() || end_ms.is_none() {
            continue;
        }

        let text = lines[2..].join("\n");
        track
            .entries
            .push(SubtitleEntry::new(start_ms.unwrap(), end_ms.unwrap(), &text));
    }

    track
}

fn parse_srt_time(s: &str) -> Option<u32> {
    // Format: HH:MM:SS,mmm or HH:MM:SS.mmm
    let s = s.replace(',', ".");
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let hours: u32 = parts[0].parse().ok()?;
    let minutes: u32 = parts[1].parse().ok()?;
    let sec_parts: Vec<&str> = parts[2].split('.').collect();
    let seconds: u32 = sec_parts[0].parse().ok()?;
    let millis: u32 = if sec_parts.len() > 1 {
        let ms_str = sec_parts[1];
        let padded = format!("{:0<3}", &ms_str[..ms_str.len().min(3)]);
        padded.parse().unwrap_or(0)
    } else {
        0
    };
    Some(hours * 3600000 + minutes * 60000 + seconds * 1000 + millis)
}

pub fn export_srt(track: &SubtitleTrack) -> String {
    let mut out = String::new();
    for (i, entry) in track.entries.iter().enumerate() {
        out.push_str(&format!("{}\n", i + 1));
        out.push_str(&format!(
            "{} --> {}\n",
            format_srt_time(entry.start_ms),
            format_srt_time(entry.end_ms)
        ));
        out.push_str(&entry.text);
        out.push_str("\n\n");
    }
    out
}

fn format_srt_time(ms: u32) -> String {
    let hours = ms / 3600000;
    let minutes = (ms % 3600000) / 60000;
    let seconds = (ms % 60000) / 1000;
    let millis = ms % 1000;
    format!("{:02}:{:02}:{:02},{:03}", hours, minutes, seconds, millis)
}

pub fn parse_vtt(content: &str) -> SubtitleTrack {
    let mut track = SubtitleTrack::new();

    // Skip WEBVTT header
    let content = if content.starts_with("WEBVTT") {
        content
            .splitn(2, "\n\n")
            .nth(1)
            .unwrap_or("")
    } else {
        content
    };

    let blocks: Vec<&str> = content.split("\n\n").collect();

    for block in blocks {
        let lines: Vec<&str> = block.trim().lines().collect();
        if lines.is_empty() {
            continue;
        }

        // Find the timestamp line (contains " --> ")
        let mut ts_idx = None;
        for (i, line) in lines.iter().enumerate() {
            if line.contains("-->") {
                ts_idx = Some(i);
                break;
            }
        }

        let ts_idx = match ts_idx {
            Some(i) => i,
            None => continue,
        };

        let parts: Vec<&str> = lines[ts_idx].split("-->").collect();
        if parts.len() != 2 {
            continue;
        }

        let start_ms = parse_vtt_time(parts[0].trim());
        let end_ms = parse_vtt_time(parts[1].trim());

        if start_ms.is_none() || end_ms.is_none() {
            continue;
        }

        let text_lines = &lines[(ts_idx + 1)..];
        if text_lines.is_empty() {
            continue;
        }
        let text = text_lines.join("\n");
        track
            .entries
            .push(SubtitleEntry::new(start_ms.unwrap(), end_ms.unwrap(), &text));
    }

    track
}

fn parse_vtt_time(s: &str) -> Option<u32> {
    // Format: MM:SS.mmm or HH:MM:SS.mmm
    let parts: Vec<&str> = s.split(':').collect();
    match parts.len() {
        2 => {
            let minutes: u32 = parts[0].parse().ok()?;
            let sec_parts: Vec<&str> = parts[1].split('.').collect();
            let seconds: u32 = sec_parts[0].parse().ok()?;
            let millis: u32 = if sec_parts.len() > 1 {
                let ms_str = sec_parts[1];
                let padded = format!("{:0<3}", &ms_str[..ms_str.len().min(3)]);
                padded.parse().unwrap_or(0)
            } else {
                0
            };
            Some(minutes * 60000 + seconds * 1000 + millis)
        }
        3 => {
            let hours: u32 = parts[0].parse().ok()?;
            let minutes: u32 = parts[1].parse().ok()?;
            let sec_parts: Vec<&str> = parts[2].split('.').collect();
            let seconds: u32 = sec_parts[0].parse().ok()?;
            let millis: u32 = if sec_parts.len() > 1 {
                let ms_str = sec_parts[1];
                let padded = format!("{:0<3}", &ms_str[..ms_str.len().min(3)]);
                padded.parse().unwrap_or(0)
            } else {
                0
            };
            Some(hours * 3600000 + minutes * 60000 + seconds * 1000 + millis)
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_srt() {
        let srt = "1\n00:00:01,500 --> 00:00:04,000\nHello World\n\n2\n00:00:05,000 --> 00:00:08,500\nSecond subtitle\nwith two lines\n\n";
        let track = parse_srt(srt);
        assert_eq!(track.entries.len(), 2);
        assert_eq!(track.entries[0].start_ms, 1500);
        assert_eq!(track.entries[0].end_ms, 4000);
        assert_eq!(track.entries[0].text, "Hello World");
        assert_eq!(track.entries[1].start_ms, 5000);
        assert_eq!(track.entries[1].end_ms, 8500);
        assert_eq!(track.entries[1].text, "Second subtitle\nwith two lines");
    }

    #[test]
    fn test_parse_vtt() {
        let vtt = "WEBVTT\n\n00:01.500 --> 00:04.000\nHello VTT\n\n00:05.000 --> 00:08.500\nSecond cue\n\n";
        let track = parse_vtt(vtt);
        assert_eq!(track.entries.len(), 2);
        assert_eq!(track.entries[0].start_ms, 1500);
        assert_eq!(track.entries[0].end_ms, 4000);
        assert_eq!(track.entries[0].text, "Hello VTT");
    }

    #[test]
    fn test_srt_roundtrip() {
        let srt = "1\n00:00:01,500 --> 00:00:04,000\nHello World\n\n2\n00:00:05,000 --> 00:00:08,500\nSecond line\n\n";
        let track = parse_srt(srt);
        let exported = export_srt(&track);
        let reparsed = parse_srt(&exported);
        assert_eq!(track.entries.len(), reparsed.entries.len());
        for i in 0..track.entries.len() {
            assert_eq!(track.entries[i].start_ms, reparsed.entries[i].start_ms);
            assert_eq!(track.entries[i].end_ms, reparsed.entries[i].end_ms);
            assert_eq!(track.entries[i].text, reparsed.entries[i].text);
        }
    }

    #[test]
    fn test_parse_vtt_with_hours() {
        let vtt = "WEBVTT\n\n00:01:30.000 --> 00:02:00.500\nWith hours\n\n";
        let track = parse_vtt(vtt);
        assert_eq!(track.entries.len(), 1);
        assert_eq!(track.entries[0].start_ms, 90000);
        assert_eq!(track.entries[0].end_ms, 120500);
    }
}
