use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use base64::Engine;

pub fn check_ffmpeg() -> Result<String, String> {
    let output = Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map_err(|_| "ffmpeg not found on PATH. Install ffmpeg to enable MP4 export.".to_string())?;

    let version_line = String::from_utf8_lossy(&output.stdout);
    let first_line = version_line.lines().next().unwrap_or("ffmpeg (unknown version)");
    Ok(first_line.to_string())
}

pub fn write_frame(temp_dir: &Path, frame_number: u32, data_url: &str) -> Result<(), String> {
    let b64_data = data_url
        .split(',')
        .nth(1)
        .ok_or("Invalid data URL format")?;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64_data)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    let filename = format!("frame_{:06}.png", frame_number);
    fs::write(temp_dir.join(filename), bytes)
        .map_err(|e| format!("Failed to write frame: {}", e))?;

    Ok(())
}

pub fn encode_mp4(
    temp_dir: &Path,
    output_path: &str,
    fps: u8,
    crf: u8,
    audio_paths: &[String],
) -> Result<(), String> {
    let frame_pattern = temp_dir.join("frame_%06d.png");

    let mut args = vec![
        "-y".to_string(),
        "-framerate".to_string(),
        fps.to_string(),
        "-i".to_string(),
        frame_pattern.to_string_lossy().to_string(),
    ];

    for audio_path in audio_paths {
        if Path::new(audio_path).exists() {
            args.push("-i".to_string());
            args.push(audio_path.clone());
        }
    }

    args.extend([
        "-c:v".to_string(),
        "libx264".to_string(),
        "-crf".to_string(),
        crf.to_string(),
        "-pix_fmt".to_string(),
        "yuv420p".to_string(),
        "-movflags".to_string(),
        "+faststart".to_string(),
    ]);

    if !audio_paths.is_empty() {
        args.extend(["-c:a".to_string(), "aac".to_string(), "-shortest".to_string()]);
    }

    args.push(output_path.to_string());

    let output = Command::new("ffmpeg")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg failed: {}", stderr.chars().take(500).collect::<String>()));
    }

    Ok(())
}

pub fn create_temp_dir() -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join(format!("citcat_mp4_{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;
    Ok(dir)
}

pub fn cleanup_temp_dir(dir: &Path) {
    let _ = fs::remove_dir_all(dir);
}

pub fn collect_audio_paths(project: &crate::model::Project) -> Vec<String> {
    let mut paths = Vec::new();
    for scene in &project.scenes {
        for obj in &scene.objects {
            if matches!(obj.object_type, crate::model::ObjectType::Audio) && !obj.content.is_empty() {
                if Path::new(&obj.content).exists() && !paths.contains(&obj.content) {
                    paths.push(obj.content.clone());
                }
            }
        }
    }
    paths
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_cleanup_temp_dir() {
        let dir = create_temp_dir().expect("create temp dir");
        assert!(dir.exists());
        cleanup_temp_dir(&dir);
        assert!(!dir.exists());
    }

    #[test]
    fn test_write_frame_invalid_data_url() {
        let dir = create_temp_dir().expect("create temp dir");
        let result = write_frame(&dir, 0, "not-a-data-url");
        assert!(result.is_err());
        cleanup_temp_dir(&dir);
    }
}
