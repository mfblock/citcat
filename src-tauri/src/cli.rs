use std::fs;
use std::path::PathBuf;
use std::process;

use clap::{Parser, Subcommand};

use citcat_lib::data::{self, DataConnector};
use citcat_lib::export::{self, html};
use citcat_lib::model::{
    BindTransform, DataBinding, ObjectType, Project, Scene, SceneObject,
};

#[derive(Parser)]
#[command(name = "citcat-cli")]
#[command(about = "CitCat — data-driven visual content engine (CLI)")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Create a new empty project file
    New {
        /// Project name
        name: String,
        /// Stage width in pixels
        #[arg(long, default_value_t = 1920)]
        width: u32,
        /// Stage height in pixels
        #[arg(long, default_value_t = 1080)]
        height: u32,
        /// Frames per second
        #[arg(long, default_value_t = 30)]
        fps: u8,
        /// Output file path
        #[arg(short, long, default_value = "project.citcat")]
        output: String,
    },
    /// Print project info
    Info {
        /// Path to .citcat project file
        project: String,
    },
    /// Export project
    Export {
        #[command(subcommand)]
        format: ExportFormat,
    },
    /// Batch export one HTML per database row
    Batch {
        /// Path to .citcat project file
        project: String,
        /// Output directory
        output_dir: String,
        /// Database connection (path to .sqlite/.csv or postgres://...)
        #[arg(long)]
        db: String,
        /// Table name (auto-detected for CSV)
        #[arg(long)]
        table: Option<String>,
        /// Export as single HTML files
        #[arg(long)]
        single_file: bool,
        /// Column to use for output filenames
        #[arg(long)]
        name_column: Option<String>,
        /// Auto-play exported content
        #[arg(long)]
        autoplay: bool,
    },
    /// Add an object to a scene
    AddObject {
        /// Path to .citcat project file
        project: String,
        /// Scene index (0-based) or name
        #[arg(long)]
        scene: String,
        /// Object type: text, rect, ellipse, image, button, svg
        #[arg(long = "type")]
        object_type: String,
        /// Text content or image path
        #[arg(long)]
        content: Option<String>,
        /// X position
        #[arg(long, default_value_t = 100.0)]
        x: f64,
        /// Y position
        #[arg(long, default_value_t = 100.0)]
        y: f64,
        /// Width
        #[arg(long, default_value_t = 200.0)]
        width: f64,
        /// Height
        #[arg(long, default_value_t = 100.0)]
        height: f64,
        /// Fill colour
        #[arg(long, default_value = "#3b82f6")]
        fill: String,
        /// Font size (for text/button)
        #[arg(long, default_value_t = 24.0)]
        font_size: f64,
    },
    /// Add a scene to the project
    AddScene {
        /// Path to .citcat project file
        project: String,
        /// Scene name
        #[arg(long)]
        name: String,
        /// Duration in milliseconds
        #[arg(long, default_value_t = 5000)]
        duration: u32,
    },
    /// Bind an object property to a database column
    Bind {
        /// Path to .citcat project file
        project: String,
        /// Scene index or name
        #[arg(long)]
        scene: String,
        /// Object name or index
        #[arg(long)]
        object: String,
        /// Property to bind (content, style.fill, style.stroke, visible)
        #[arg(long)]
        property: String,
        /// Database column name
        #[arg(long)]
        column: String,
        /// Transform: none, uppercase, lowercase
        #[arg(long, default_value = "none")]
        transform: String,
    },
    /// Manage templates
    Template {
        #[command(subcommand)]
        action: TemplateAction,
    },
}

#[derive(Subcommand)]
enum ExportFormat {
    /// Export as HTML5
    Html {
        /// Path to .citcat project file
        project: String,
        /// Output path (file for single-file, directory for folder)
        output: String,
        /// Export as a single HTML file
        #[arg(long)]
        single_file: bool,
        /// Auto-play on load
        #[arg(long)]
        autoplay: bool,
        /// Loop playback
        #[arg(long, name = "loop")]
        loop_playback: bool,
    },
    /// Export as MP4 video
    Mp4 {
        /// Path to .citcat project file
        project: String,
        /// Output file path
        output: String,
    },
}

#[derive(Subcommand)]
enum TemplateAction {
    /// List available templates
    List,
    /// Create a project from a template
    Create {
        /// Template name
        name: String,
        /// Output file path
        #[arg(default_value = "project.citcat")]
        output: String,
    },
}

fn load_project(path: &str) -> Project {
    let content = fs::read_to_string(path).unwrap_or_else(|e| {
        eprintln!("Error reading {}: {}", path, e);
        process::exit(1);
    });
    serde_json::from_str(&content).unwrap_or_else(|e| {
        eprintln!("Error parsing {}: {}", path, e);
        process::exit(1);
    })
}

fn save_project(project: &Project, path: &str) {
    let json = serde_json::to_string_pretty(project).unwrap_or_else(|e| {
        eprintln!("Error serializing project: {}", e);
        process::exit(1);
    });
    fs::write(path, json).unwrap_or_else(|e| {
        eprintln!("Error writing {}: {}", path, e);
        process::exit(1);
    });
}

fn find_scene_index(project: &Project, scene_ref: &str) -> usize {
    if let Ok(idx) = scene_ref.parse::<usize>() {
        if idx < project.scenes.len() {
            return idx;
        }
    }
    project
        .scenes
        .iter()
        .position(|s| s.name.eq_ignore_ascii_case(scene_ref))
        .unwrap_or_else(|| {
            eprintln!("Scene '{}' not found", scene_ref);
            process::exit(1);
        })
}

fn find_object_index(scene: &Scene, obj_ref: &str) -> usize {
    if let Ok(idx) = obj_ref.parse::<usize>() {
        if idx < scene.objects.len() {
            return idx;
        }
    }
    scene
        .objects
        .iter()
        .position(|o| o.name.eq_ignore_ascii_case(obj_ref))
        .unwrap_or_else(|| {
            eprintln!("Object '{}' not found in scene '{}'", obj_ref, scene.name);
            process::exit(1);
        })
}

fn connect_db(db_path: &str) -> Box<dyn DataConnector> {
    if db_path.starts_with("postgres://") || db_path.starts_with("postgresql://") {
        Box::new(data::postgres::PostgresConnector::new(db_path).unwrap_or_else(|e| {
            eprintln!("Postgres connection failed: {}", e);
            process::exit(1);
        }))
    } else if db_path.ends_with(".csv") || db_path.ends_with(".tsv") {
        Box::new(data::csv_source::CsvConnector::new(db_path).unwrap_or_else(|e| {
            eprintln!("CSV connection failed: {}", e);
            process::exit(1);
        }))
    } else {
        Box::new(data::sqlite::SqliteConnector::new(db_path).unwrap_or_else(|e| {
            eprintln!("SQLite connection failed: {}", e);
            process::exit(1);
        }))
    }
}

fn parse_object_type(s: &str) -> ObjectType {
    match s.to_lowercase().as_str() {
        "text" => ObjectType::Text,
        "rect" | "rectangle" => ObjectType::Rect,
        "ellipse" | "circle" => ObjectType::Ellipse,
        "image" | "img" => ObjectType::Image,
        "button" | "btn" => ObjectType::Button,
        "hotspot" => ObjectType::Hotspot,
        "video" => ObjectType::Video,
        "audio" => ObjectType::Audio,
        "svg" => ObjectType::Svg,
        _ => {
            eprintln!("Unknown object type: {}. Use: text, rect, ellipse, image, button, hotspot, video, audio, svg", s);
            process::exit(1);
        }
    }
}

fn templates_dir() -> PathBuf {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));
    let candidates = [
        PathBuf::from("templates"),
        exe_dir.join("templates"),
        exe_dir.join("../templates"),
    ];
    for c in &candidates {
        if c.exists() {
            return c.clone();
        }
    }
    PathBuf::from("templates")
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::New {
            name,
            width,
            height,
            fps,
            output,
        } => {
            let project = Project::new(&name, width, height, fps);
            save_project(&project, &output);
            println!("Created project '{}' ({}x{} @{}fps) → {}", name, width, height, fps, output);
        }

        Commands::Info { project: path } => {
            let p = load_project(&path);
            println!("Project: {}", p.meta.name);
            println!("Size:    {}x{} @{}fps", p.meta.width, p.meta.height, p.meta.fps);
            println!("Version: {}", p.version);
            println!("Scenes:  {}", p.scenes.len());
            let total_objects: usize = p.scenes.iter().map(|s| s.objects.len()).sum();
            println!("Objects: {}", total_objects);
            let total_kf: usize = p
                .scenes
                .iter()
                .flat_map(|s| &s.objects)
                .map(|o| o.keyframes.len())
                .sum();
            println!("Keyframes: {}", total_kf);
            if let Some(ref ds) = p.data_source {
                println!(
                    "Data:    {:?} → {} (table: {})",
                    ds.source_type, ds.connection, ds.table
                );
            }
            for (i, scene) in p.scenes.iter().enumerate() {
                println!(
                    "  Scene {}: '{}' ({}ms, {} objects)",
                    i,
                    scene.name,
                    scene.duration_ms,
                    scene.objects.len()
                );
            }
        }

        Commands::Export { format } => match format {
            ExportFormat::Html {
                project: path,
                output,
                single_file,
                autoplay,
                loop_playback,
            } => {
                let p = load_project(&path);
                let result = if single_file {
                    html::export_single_file(&p, &output, autoplay, loop_playback)
                } else {
                    html::export_folder(&p, &output, autoplay, loop_playback)
                };
                match result {
                    Ok(()) => println!("Exported HTML → {}", output),
                    Err(e) => {
                        eprintln!("Export failed: {}", e);
                        process::exit(1);
                    }
                }
            }
            ExportFormat::Mp4 { project: _, output: _ } => {
                eprintln!("MP4 export requires the GUI or a headless browser.");
                eprintln!("Use `citcat-cli export html` and convert with ffmpeg:");
                eprintln!("  citcat-cli export html project.citcat output/ --autoplay");
                eprintln!("  # Then use a headless browser to record the page");
                process::exit(1);
            }
        },

        Commands::Batch {
            project: path,
            output_dir,
            db,
            table,
            single_file,
            name_column,
            autoplay,
        } => {
            let p = load_project(&path);
            let connector = connect_db(&db);

            let table_name = if let Some(t) = table {
                t
            } else if let Some(ref ds) = p.data_source {
                ds.table.clone()
            } else {
                let tables = connector.tables().unwrap_or_else(|e| {
                    eprintln!("Failed to list tables: {}", e);
                    process::exit(1);
                });
                if tables.len() == 1 {
                    tables[0].clone()
                } else {
                    eprintln!(
                        "Multiple tables found. Use --table to specify: {}",
                        tables.join(", ")
                    );
                    process::exit(1);
                }
            };

            let total = connector.row_count(&table_name).unwrap_or_else(|e| {
                eprintln!("Failed to count rows: {}", e);
                process::exit(1);
            });

            fs::create_dir_all(&output_dir).unwrap_or_else(|e| {
                eprintln!("Failed to create output dir: {}", e);
                process::exit(1);
            });

            eprintln!("Exporting {} rows from table '{}'...", total, table_name);

            let batch_size = 50u32;
            let mut exported = 0u32;
            let mut offset = 0u32;

            while offset < total {
                let result = connector.rows(&table_name, offset, batch_size).unwrap_or_else(|e| {
                    eprintln!("Failed to fetch rows: {}", e);
                    process::exit(1);
                });

                for (i, row) in result.rows.iter().enumerate() {
                    let resolved = export::resolve_bindings(&p, row);
                    let row_idx = offset + i as u32;

                    let filename = if let Some(ref col) = name_column {
                        let name_val = row
                            .get(col)
                            .map(|v| match v {
                                serde_json::Value::String(s) => s.clone(),
                                _ => v.to_string().trim_matches('"').to_string(),
                            })
                            .unwrap_or_else(|| format!("row_{:04}", row_idx));
                        export::sanitize_filename(&name_val)
                    } else {
                        format!("row_{:04}", row_idx)
                    };

                    let dir = PathBuf::from(&output_dir);
                    let export_result = if single_file {
                        let file_path = dir.join(format!("{}.html", filename));
                        html::export_single_file(&resolved, &file_path.to_string_lossy(), autoplay, false)
                    } else {
                        let subdir = dir.join(&filename);
                        html::export_folder(&resolved, &subdir.to_string_lossy(), autoplay, false)
                    };

                    if let Err(e) = export_result {
                        eprintln!("Warning: failed to export row {}: {}", row_idx, e);
                    } else {
                        exported += 1;
                    }

                    eprint!("\r  Exported {}/{}", exported, total);
                }
                offset += batch_size;
            }
            eprintln!();
            println!("Batch export complete: {} files → {}", exported, output_dir);
        }

        Commands::AddObject {
            project: path,
            scene,
            object_type,
            content,
            x,
            y,
            width,
            height,
            fill,
            font_size,
        } => {
            let mut p = load_project(&path);
            let scene_idx = find_scene_index(&p, &scene);
            let obj_type = parse_object_type(&object_type);

            let stage_w = p.meta.width;
            let stage_h = p.meta.height;
            let mut obj = SceneObject::new(obj_type, &object_type, stage_w, stage_h);
            obj.transform.x = x;
            obj.transform.y = y;
            obj.transform.width = width;
            obj.transform.height = height;
            obj.style.fill = fill;
            obj.style.font_size = font_size;
            if let Some(c) = content {
                obj.content = c;
            }

            let obj_name = obj.name.clone();
            let obj_id = obj.id.clone();
            p.scenes[scene_idx].objects.push(obj);
            p.touch();
            save_project(&p, &path);
            println!(
                "Added {} '{}' (id: {}) to scene '{}'",
                object_type, obj_name, obj_id, p.scenes[scene_idx].name
            );
        }

        Commands::AddScene {
            project: path,
            name,
            duration,
        } => {
            let mut p = load_project(&path);
            let sort_order = p.scenes.len() as i32;
            let mut scene = Scene::new(&name, sort_order);
            scene.duration_ms = duration;
            let scene_id = scene.id.clone();
            p.scenes.push(scene);
            p.touch();
            save_project(&p, &path);
            println!("Added scene '{}' (id: {}, {}ms)", name, scene_id, duration);
        }

        Commands::Bind {
            project: path,
            scene,
            object,
            property,
            column,
            transform,
        } => {
            let mut p = load_project(&path);
            let scene_idx = find_scene_index(&p, &scene);
            let obj_idx = find_object_index(&p.scenes[scene_idx], &object);

            let bind_transform = match transform.to_lowercase().as_str() {
                "uppercase" => BindTransform::Uppercase,
                "lowercase" => BindTransform::Lowercase,
                _ => BindTransform::None,
            };

            let binding = DataBinding::new(&property, &column, bind_transform);
            p.scenes[scene_idx].objects[obj_idx].data_bindings.push(binding);
            let obj_name = p.scenes[scene_idx].objects[obj_idx].name.clone();
            p.touch();
            save_project(&p, &path);
            println!("Bound {}.{} ← column '{}'", obj_name, property, column);
        }

        Commands::Template { action } => match action {
            TemplateAction::List => {
                let dir = templates_dir();
                if !dir.exists() {
                    println!("No templates directory found.");
                    return;
                }
                let mut found = false;
                if let Ok(entries) = fs::read_dir(&dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().and_then(|e| e.to_str()) == Some("citcat") {
                            let name = path
                                .file_stem()
                                .and_then(|n| n.to_str())
                                .unwrap_or("unknown");
                            if let Ok(content) = fs::read_to_string(&path) {
                                if let Ok(p) = serde_json::from_str::<Project>(&content) {
                                    println!(
                                        "  {} — {} ({}x{}, {} scenes)",
                                        name,
                                        p.meta.name,
                                        p.meta.width,
                                        p.meta.height,
                                        p.scenes.len()
                                    );
                                    found = true;
                                }
                            }
                        }
                    }
                }
                if !found {
                    println!("No templates found in {}", dir.display());
                }
            }
            TemplateAction::Create { name, output } => {
                let dir = templates_dir();
                let path = dir.join(format!("{}.citcat", name));
                if !path.exists() {
                    eprintln!("Template '{}' not found at {}", name, path.display());
                    process::exit(1);
                }
                let project = load_project(&path.to_string_lossy());
                save_project(&project, &output);
                println!("Created project from template '{}' → {}", name, output);
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_reload_project() {
        let dir = std::env::temp_dir();
        let path = dir.join("citcat_cli_test.citcat");
        let path_str = path.to_string_lossy().to_string();

        let project = Project::new("CLI Test", 1280, 720, 24);
        save_project(&project, &path_str);

        let loaded = load_project(&path_str);
        assert_eq!(loaded.meta.name, "CLI Test");
        assert_eq!(loaded.meta.width, 1280);
        assert_eq!(loaded.meta.height, 720);
        assert_eq!(loaded.meta.fps, 24);
        assert_eq!(loaded.scenes.len(), 1);

        let _ = fs::remove_file(&path);
    }
}
