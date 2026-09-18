use std::fs;
use std::path::{Path, PathBuf};

use crate::model::Project;

const RUNTIME_JS: &str = include_str!("../../../src/js/runtime.js");

fn collect_asset_paths(project: &Project) -> Vec<String> {
    let mut paths = Vec::new();
    for scene in &project.scenes {
        for obj in &scene.objects {
            let is_asset = matches!(obj.object_type, crate::model::ObjectType::Image | crate::model::ObjectType::Video | crate::model::ObjectType::Audio | crate::model::ObjectType::Svg);
            if is_asset && !obj.content.is_empty() {
                if !paths.contains(&obj.content) {
                    paths.push(obj.content.clone());
                }
            }
        }
    }
    paths
}

fn encode_file_base64(path: &str) -> Option<String> {
    let data = fs::read(path).ok()?;
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "mkv" => "video/x-matroska",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "flac" => "audio/flac",
        _ => "application/octet-stream",
    };
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    Some(format!("data:{};base64,{}", mime, b64))
}

pub fn export_single_file(
    project: &Project,
    output_path: &str,
    autoplay: bool,
    loop_playback: bool,
) -> Result<(), String> {
    let mut project_clone = project.clone();
    project_clone.export_settings.autoplay = autoplay;
    project_clone.export_settings.loop_playback = loop_playback;

    let project_json =
        serde_json::to_string(&project_clone).map_err(|e| format!("JSON error: {}", e))?;

    let asset_paths = collect_asset_paths(&project_clone);
    let mut assets_json_entries = Vec::new();
    for path in &asset_paths {
        if let Some(data_uri) = encode_file_base64(path) {
            let escaped_path = path.replace('\\', "\\\\").replace('"', "\\\"");
            let escaped_uri = data_uri.replace('\\', "\\\\").replace('"', "\\\"");
            assets_json_entries.push(format!("\"{}\":\"{}\"", escaped_path, escaped_uri));
        }
    }
    let assets_json = format!("{{{}}}", assets_json_entries.join(","));

    let boot_line = if autoplay {
        "engine.play();".to_string()
    } else {
        "canvas.addEventListener('click', function() { engine.play(); }, { once: true });".to_string()
    };

    let html = format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; overflow: hidden; }}
    canvas {{ max-width: 100%; max-height: 100vh; cursor: pointer; }}
    .click-hint {{ position: absolute; bottom: 20px; color: #666; font-family: system-ui; font-size: 14px; pointer-events: none; }}
  </style>
</head>
<body>
  <canvas id="stage" width="{width}" height="{height}"></canvas>
  {hint}
  <script>
{runtime}
  </script>
  <script>
    var PROJECT = {project_json};
    var ASSETS = {assets_json};
    var canvas = document.getElementById('stage');
    var engine = new CitCatRuntime(canvas, PROJECT, ASSETS);
    {boot}
  </script>
</body>
</html>"#,
        title = project_clone.meta.name,
        width = project_clone.meta.width,
        height = project_clone.meta.height,
        runtime = RUNTIME_JS,
        project_json = project_json,
        assets_json = assets_json,
        boot = boot_line,
        hint = if autoplay { "" } else { "<div class=\"click-hint\">Click to start</div>" },
    );

    fs::write(output_path, html).map_err(|e| format!("Failed to write: {}", e))?;
    Ok(())
}

pub fn export_folder(
    project: &Project,
    output_dir: &str,
    autoplay: bool,
    loop_playback: bool,
) -> Result<(), String> {
    let dir = PathBuf::from(output_dir);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;

    let assets_dir = dir.join("assets");
    let _ = fs::create_dir_all(&assets_dir);

    let mut project_clone = project.clone();
    project_clone.export_settings.autoplay = autoplay;
    project_clone.export_settings.loop_playback = loop_playback;

    let asset_paths = collect_asset_paths(&project_clone);
    for path in &asset_paths {
        let src = Path::new(path);
        if src.exists() {
            if let Some(filename) = src.file_name() {
                let dest = assets_dir.join(filename);
                let _ = fs::copy(src, &dest);
                for scene in &mut project_clone.scenes {
                    for obj in &mut scene.objects {
                        if obj.content == *path {
                            obj.content = format!("assets/{}", filename.to_string_lossy());
                        }
                    }
                }
            }
        }
    }

    let project_json = serde_json::to_string_pretty(&project_clone)
        .map_err(|e| format!("JSON error: {}", e))?;
    fs::write(dir.join("project.json"), &project_json)
        .map_err(|e| format!("Failed to write project.json: {}", e))?;

    fs::write(dir.join("runtime.js"), RUNTIME_JS)
        .map_err(|e| format!("Failed to write runtime.js: {}", e))?;

    let boot_line = if autoplay {
        "engine.play();".to_string()
    } else {
        "canvas.addEventListener('click', function() { engine.play(); }, { once: true });".to_string()
    };

    let index_html = format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; overflow: hidden; }}
    canvas {{ max-width: 100%; max-height: 100vh; cursor: pointer; }}
    .click-hint {{ position: absolute; bottom: 20px; color: #666; font-family: system-ui; font-size: 14px; pointer-events: none; }}
  </style>
</head>
<body>
  <canvas id="stage" width="{width}" height="{height}"></canvas>
  {hint}
  <script src="runtime.js"></script>
  <script>
    fetch('project.json')
      .then(function(r) {{ return r.json(); }})
      .then(function(project) {{
        var canvas = document.getElementById('stage');
        var engine = new CitCatRuntime(canvas, project, null);
        {boot}
      }});
  </script>
</body>
</html>"#,
        title = project_clone.meta.name,
        width = project_clone.meta.width,
        height = project_clone.meta.height,
        boot = boot_line,
        hint = if autoplay { "" } else { "<div class=\"click-hint\">Click to start</div>" },
    );

    fs::write(dir.join("index.html"), index_html)
        .map_err(|e| format!("Failed to write index.html: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Project;

    #[test]
    fn test_export_single_file() {
        let project = Project::new("Test Export", 1920, 1080, 30);
        let dir = std::env::temp_dir();
        let path = dir.join("citcat_test_export.html");
        let path_str = path.to_string_lossy().to_string();

        let result = export_single_file(&project, &path_str, false, false);
        assert!(result.is_ok(), "Export failed: {:?}", result);

        let content = fs::read_to_string(&path).expect("read exported file");
        assert!(content.contains("<!DOCTYPE html>"));
        assert!(content.contains("CitCatRuntime"));
        assert!(content.contains("Test Export"));
        assert!(content.contains("1920"));

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn test_export_folder() {
        let project = Project::new("Folder Test", 1920, 1080, 30);
        let dir = std::env::temp_dir().join("citcat_test_folder_export");
        let dir_str = dir.to_string_lossy().to_string();

        let result = export_folder(&project, &dir_str, true, false);
        assert!(result.is_ok(), "Export failed: {:?}", result);

        assert!(dir.join("index.html").exists());
        assert!(dir.join("runtime.js").exists());
        assert!(dir.join("project.json").exists());

        let index = fs::read_to_string(dir.join("index.html")).unwrap();
        assert!(index.contains("Folder Test"));
        assert!(index.contains("engine.play()"));

        let _ = fs::remove_dir_all(&dir);
    }
}
