use std::collections::HashMap;
use std::fs;
use std::io::{self, BufRead, Write};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use citcat_lib::data::{self, DataConnector};
use citcat_lib::export::{self, html};
use citcat_lib::model::{
    BindTransform, DataBinding, Easing, EventAction, EventBinding, EventTrigger, Keyframe,
    KeyframeValue, ObjectType, Project, Scene, SceneObject,
};

#[derive(Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}

struct McpState {
    project: Option<Project>,
    data_connection: Option<Box<dyn DataConnector>>,
}

impl McpState {
    fn new() -> Self {
        Self {
            project: None,
            data_connection: None,
        }
    }

    fn require_project(&self) -> Result<&Project, String> {
        self.project
            .as_ref()
            .ok_or_else(|| "No project loaded. Call project_new or project_open first.".to_string())
    }

    fn require_project_mut(&mut self) -> Result<&mut Project, String> {
        self.project
            .as_mut()
            .ok_or_else(|| "No project loaded. Call project_new or project_open first.".to_string())
    }

    fn require_data(&self) -> Result<&dyn DataConnector, String> {
        self.data_connection
            .as_deref()
            .ok_or_else(|| "No data source connected. Call data_connect first.".to_string())
    }
}

fn tool_definitions() -> Vec<Value> {
    vec![
        tool_def(
            "project_new",
            "Create a new project in memory",
            json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "Project name" },
                    "width": { "type": "integer", "description": "Stage width (default 1920)" },
                    "height": { "type": "integer", "description": "Stage height (default 1080)" },
                    "fps": { "type": "integer", "description": "Frames per second (default 30)" }
                },
                "required": ["name"]
            }),
        ),
        tool_def(
            "project_open",
            "Load a .citcat project file",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Path to .citcat file" }
                },
                "required": ["path"]
            }),
        ),
        tool_def(
            "project_save",
            "Save the current project to a file",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Output file path" }
                },
                "required": ["path"]
            }),
        ),
        tool_def(
            "project_info",
            "Get current project info (name, scenes, objects, dimensions)",
            json!({ "type": "object", "properties": {} }),
        ),
        tool_def(
            "scene_add",
            "Add a new scene to the project",
            json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "Scene name" },
                    "duration_ms": { "type": "integer", "description": "Duration in ms (default 5000)" }
                },
                "required": ["name"]
            }),
        ),
        tool_def(
            "scene_list",
            "List all scenes with IDs and names",
            json!({ "type": "object", "properties": {} }),
        ),
        tool_def(
            "object_add",
            "Add an object to a scene",
            json!({
                "type": "object",
                "properties": {
                    "scene_id": { "type": "string", "description": "Scene ID" },
                    "type": { "type": "string", "enum": ["text", "rect", "ellipse", "image", "button", "hotspot", "video", "audio", "svg"], "description": "Object type" },
                    "content": { "type": "string", "description": "Text content or file path" },
                    "x": { "type": "number", "description": "X position" },
                    "y": { "type": "number", "description": "Y position" },
                    "width": { "type": "number", "description": "Width" },
                    "height": { "type": "number", "description": "Height" },
                    "fill": { "type": "string", "description": "Fill colour (CSS)" },
                    "font_size": { "type": "number", "description": "Font size for text/button" }
                },
                "required": ["scene_id", "type"]
            }),
        ),
        tool_def(
            "object_list",
            "List objects in a scene",
            json!({
                "type": "object",
                "properties": {
                    "scene_id": { "type": "string", "description": "Scene ID" }
                },
                "required": ["scene_id"]
            }),
        ),
        tool_def(
            "object_update",
            "Update object properties",
            json!({
                "type": "object",
                "properties": {
                    "scene_id": { "type": "string" },
                    "object_id": { "type": "string" },
                    "content": { "type": "string" },
                    "x": { "type": "number" },
                    "y": { "type": "number" },
                    "width": { "type": "number" },
                    "height": { "type": "number" },
                    "fill": { "type": "string" },
                    "opacity": { "type": "number" },
                    "rotation": { "type": "number" },
                    "visible": { "type": "boolean" },
                    "font_size": { "type": "number" },
                    "font_family": { "type": "string" }
                },
                "required": ["scene_id", "object_id"]
            }),
        ),
        tool_def(
            "keyframe_add",
            "Add a keyframe to an object",
            json!({
                "type": "object",
                "properties": {
                    "scene_id": { "type": "string" },
                    "object_id": { "type": "string" },
                    "time_ms": { "type": "integer", "description": "Time position in ms" },
                    "property": { "type": "string", "description": "Property path (e.g. transform.x, transform.opacity, style.fill)" },
                    "value": { "description": "Keyframe value (number, string, or bool)" },
                    "easing": { "type": "string", "enum": ["Linear", "EaseIn", "EaseOut", "EaseInOut"], "description": "Easing (default Linear)" }
                },
                "required": ["scene_id", "object_id", "time_ms", "property", "value"]
            }),
        ),
        tool_def(
            "event_add",
            "Add an event binding to an object",
            json!({
                "type": "object",
                "properties": {
                    "scene_id": { "type": "string" },
                    "object_id": { "type": "string" },
                    "trigger": { "type": "string", "enum": ["Click", "HoverEnter", "HoverLeave", "SceneEnd"], "description": "Event trigger" },
                    "action": { "type": "string", "enum": ["GotoScene", "ToggleVisible", "SetProperty"], "description": "Action type" },
                    "target_scene_id": { "type": "string", "description": "For GotoScene: target scene ID" },
                    "target_object_id": { "type": "string", "description": "For ToggleVisible/SetProperty: target object ID" },
                    "target_property": { "type": "string", "description": "For SetProperty: property path" },
                    "target_value": { "description": "For SetProperty: new value" }
                },
                "required": ["scene_id", "object_id", "trigger", "action"]
            }),
        ),
        tool_def(
            "effect_apply",
            "Apply a built-in effect to an object by name",
            json!({
                "type": "object",
                "properties": {
                    "scene_id": { "type": "string" },
                    "object_id": { "type": "string" },
                    "effect_name": { "type": "string", "description": "Effect name (e.g. 'Fade In', 'Slide In Left', 'Bounce', 'Spin')" },
                    "time_ms": { "type": "integer", "description": "Time to apply at (default 0)" }
                },
                "required": ["scene_id", "object_id", "effect_name"]
            }),
        ),
        tool_def(
            "data_connect",
            "Connect to a data source (SQLite, CSV, or Postgres)",
            json!({
                "type": "object",
                "properties": {
                    "source_type": { "type": "string", "enum": ["sqlite", "csv", "postgres"] },
                    "connection": { "type": "string", "description": "File path or connection string" }
                },
                "required": ["source_type", "connection"]
            }),
        ),
        tool_def(
            "data_bind",
            "Bind an object property to a database column",
            json!({
                "type": "object",
                "properties": {
                    "scene_id": { "type": "string" },
                    "object_id": { "type": "string" },
                    "property": { "type": "string", "description": "Object property (content, style.fill, visible)" },
                    "column": { "type": "string", "description": "Database column name" },
                    "transform": { "type": "string", "enum": ["none", "uppercase", "lowercase"], "description": "Value transform" }
                },
                "required": ["scene_id", "object_id", "property", "column"]
            }),
        ),
        tool_def(
            "data_preview",
            "Preview data bindings for a specific row",
            json!({
                "type": "object",
                "properties": {
                    "row": { "type": "integer", "description": "Row index (0-based)" }
                },
                "required": ["row"]
            }),
        ),
        tool_def(
            "export_html",
            "Export the project as HTML5",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Output path" },
                    "single_file": { "type": "boolean", "description": "Single .html file (default true)" },
                    "autoplay": { "type": "boolean" },
                    "loop": { "type": "boolean" }
                },
                "required": ["path"]
            }),
        ),
        tool_def(
            "export_batch",
            "Batch export one HTML per database row",
            json!({
                "type": "object",
                "properties": {
                    "output_dir": { "type": "string" },
                    "single_file": { "type": "boolean" },
                    "name_column": { "type": "string", "description": "Column for filenames" }
                },
                "required": ["output_dir"]
            }),
        ),
        tool_def(
            "template_list",
            "List available project templates",
            json!({ "type": "object", "properties": {} }),
        ),
        tool_def(
            "template_load",
            "Load a template as the current project",
            json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "Template name (without .citcat extension)" }
                },
                "required": ["name"]
            }),
        ),
    ]
}

fn tool_def(name: &str, description: &str, input_schema: Value) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": input_schema
    })
}

fn handle_initialize(id: Value) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: Some(json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {}
            },
            "serverInfo": {
                "name": "citcat-mcp",
                "version": "0.1.0"
            }
        })),
        error: None,
    }
}

fn handle_tools_list(id: Value) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: Some(json!({ "tools": tool_definitions() })),
        error: None,
    }
}

fn parse_object_type(s: &str) -> Result<ObjectType, String> {
    match s.to_lowercase().as_str() {
        "text" => Ok(ObjectType::Text),
        "rect" | "rectangle" => Ok(ObjectType::Rect),
        "ellipse" | "circle" => Ok(ObjectType::Ellipse),
        "image" | "img" => Ok(ObjectType::Image),
        "button" | "btn" => Ok(ObjectType::Button),
        "hotspot" => Ok(ObjectType::Hotspot),
        "video" => Ok(ObjectType::Video),
        "audio" => Ok(ObjectType::Audio),
        "svg" => Ok(ObjectType::Svg),
        _ => Err(format!("Unknown object type: {}", s)),
    }
}

fn parse_easing(s: &str) -> Easing {
    match s {
        "EaseIn" => Easing::EaseIn,
        "EaseOut" => Easing::EaseOut,
        "EaseInOut" => Easing::EaseInOut,
        _ => Easing::Linear,
    }
}

fn parse_keyframe_value(v: &Value) -> KeyframeValue {
    // A fully tagged value wins: `{"type":"Gradient","value":{…}}` and friends
    // round-trip exactly. Without this, anything that is not a bare number,
    // bool or string collapsed to Number(0.0) -- so an agent could send a
    // gradient and silently get a zero.
    if let Ok(kv) = serde_json::from_value::<KeyframeValue>(v.clone()) {
        return kv;
    }
    // Shorthand, for agents writing the common cases by hand.
    match v {
        Value::Number(n) => KeyframeValue::Number(n.as_f64().unwrap_or(0.0)),
        Value::Bool(b) => KeyframeValue::Bool(*b),
        Value::String(s) => {
            if let Ok(n) = s.parse::<f64>() {
                KeyframeValue::Number(n)
            } else {
                KeyframeValue::Color(s.clone())
            }
        }
        _ => KeyframeValue::Number(0.0),
    }
}

fn handle_tool_call(state: &mut McpState, name: &str, args: &Value) -> Result<Value, String> {
    match name {
        "project_new" => {
            let name = args["name"].as_str().ok_or("name required")?;
            let width = args["width"].as_u64().unwrap_or(1920) as u32;
            let height = args["height"].as_u64().unwrap_or(1080) as u32;
            let fps = args["fps"].as_u64().unwrap_or(30) as u8;
            let project = Project::new(name, width, height, fps);
            let info = json!({
                "name": project.meta.name,
                "width": project.meta.width,
                "height": project.meta.height,
                "fps": project.meta.fps,
                "scenes": project.scenes.len()
            });
            state.project = Some(project);
            Ok(info)
        }

        "project_open" => {
            let path = args["path"].as_str().ok_or("path required")?;
            let content = fs::read_to_string(path).map_err(|e| format!("Read error: {}", e))?;
            let project: Project =
                serde_json::from_str(&content).map_err(|e| format!("Parse error: {}", e))?;
            let info = json!({
                "name": project.meta.name,
                "width": project.meta.width,
                "height": project.meta.height,
                "scenes": project.scenes.len()
            });
            state.project = Some(project);
            Ok(info)
        }

        "project_save" => {
            let project = state.require_project()?;
            let path = args["path"].as_str().ok_or("path required")?;
            let json = serde_json::to_string_pretty(project)
                .map_err(|e| format!("Serialize error: {}", e))?;
            fs::write(path, json).map_err(|e| format!("Write error: {}", e))?;
            Ok(json!({ "saved": path }))
        }

        "project_info" => {
            let p = state.require_project()?;
            let total_objects: usize = p.scenes.iter().map(|s| s.objects.len()).sum();
            let scenes: Vec<Value> = p
                .scenes
                .iter()
                .map(|s| {
                    json!({
                        "id": s.id,
                        "name": s.name,
                        "duration_ms": s.duration_ms,
                        "objects": s.objects.len()
                    })
                })
                .collect();
            Ok(json!({
                "name": p.meta.name,
                "width": p.meta.width,
                "height": p.meta.height,
                "fps": p.meta.fps,
                "total_scenes": p.scenes.len(),
                "total_objects": total_objects,
                "scenes": scenes
            }))
        }

        "scene_add" => {
            let p = state.require_project_mut()?;
            let name = args["name"].as_str().ok_or("name required")?;
            let duration = args["duration_ms"].as_u64().unwrap_or(5000) as u32;
            let sort_order = p.scenes.len() as i32;
            let mut scene = Scene::new(name, sort_order);
            scene.duration_ms = duration;
            let id = scene.id.clone();
            p.scenes.push(scene);
            p.touch();
            Ok(json!({ "id": id, "name": name }))
        }

        "scene_list" => {
            let p = state.require_project()?;
            let scenes: Vec<Value> = p
                .scenes
                .iter()
                .map(|s| {
                    json!({
                        "id": s.id,
                        "name": s.name,
                        "duration_ms": s.duration_ms,
                        "objects": s.objects.len()
                    })
                })
                .collect();
            Ok(json!({ "scenes": scenes }))
        }

        "object_add" => {
            let p = state.require_project_mut()?;
            let scene_id = args["scene_id"].as_str().ok_or("scene_id required")?;
            let type_str = args["type"].as_str().ok_or("type required")?;
            let obj_type = parse_object_type(type_str)?;

            let stage_w = p.meta.width;
            let stage_h = p.meta.height;
            let scene = p.find_scene_mut(scene_id)?;
            let mut obj = SceneObject::new(obj_type, type_str, stage_w, stage_h);

            if let Some(c) = args["content"].as_str() {
                obj.content = c.to_string();
            }
            if let Some(x) = args["x"].as_f64() {
                obj.transform.x = x;
            }
            if let Some(y) = args["y"].as_f64() {
                obj.transform.y = y;
            }
            if let Some(w) = args["width"].as_f64() {
                obj.transform.width = w;
            }
            if let Some(h) = args["height"].as_f64() {
                obj.transform.height = h;
            }
            if let Some(f) = args["fill"].as_str() {
                obj.style.fill = f.to_string();
            }
            if let Some(fs) = args["font_size"].as_f64() {
                obj.style.font_size = fs;
            }

            let result = json!({
                "id": obj.id,
                "name": obj.name,
                "type": type_str
            });
            scene.objects.push(obj);
            Ok(result)
        }

        "object_list" => {
            let p = state.require_project()?;
            let scene_id = args["scene_id"].as_str().ok_or("scene_id required")?;
            let scene = p.find_scene(scene_id)?;
            let objects: Vec<Value> = scene
                .objects
                .iter()
                .map(|o| {
                    json!({
                        "id": o.id,
                        "name": o.name,
                        "type": format!("{:?}", o.object_type),
                        "x": o.transform.x,
                        "y": o.transform.y,
                        "width": o.transform.width,
                        "height": o.transform.height,
                        "content": if o.content.len() > 50 { format!("{}...", &o.content[..50]) } else { o.content.clone() },
                        "keyframes": o.keyframes.len(),
                        "events": o.events.len(),
                        "bindings": o.data_bindings.len()
                    })
                })
                .collect();
            Ok(json!({ "objects": objects }))
        }

        "object_update" => {
            let p = state.require_project_mut()?;
            let scene_id = args["scene_id"].as_str().ok_or("scene_id required")?;
            let object_id = args["object_id"].as_str().ok_or("object_id required")?;
            let scene = p.find_scene_mut(scene_id)?;
            let obj = scene
                .objects
                .iter_mut()
                .find(|o| o.id == object_id)
                .ok_or_else(|| format!("Object '{}' not found", object_id))?;

            if let Some(c) = args["content"].as_str() {
                obj.content = c.to_string();
            }
            if let Some(x) = args["x"].as_f64() {
                obj.transform.x = x;
            }
            if let Some(y) = args["y"].as_f64() {
                obj.transform.y = y;
            }
            if let Some(w) = args["width"].as_f64() {
                obj.transform.width = w;
            }
            if let Some(h) = args["height"].as_f64() {
                obj.transform.height = h;
            }
            if let Some(f) = args["fill"].as_str() {
                obj.style.fill = f.to_string();
            }
            if let Some(o) = args["opacity"].as_f64() {
                obj.transform.opacity = o;
            }
            if let Some(r) = args["rotation"].as_f64() {
                obj.transform.rotation = r;
            }
            if let Some(v) = args["visible"].as_bool() {
                obj.visible = v;
            }
            if let Some(fs) = args["font_size"].as_f64() {
                obj.style.font_size = fs;
            }
            if let Some(ff) = args["font_family"].as_str() {
                obj.style.font_family = ff.to_string();
            }

            Ok(json!({ "updated": object_id }))
        }

        "keyframe_add" => {
            let p = state.require_project_mut()?;
            let scene_id = args["scene_id"].as_str().ok_or("scene_id required")?;
            let object_id = args["object_id"].as_str().ok_or("object_id required")?;
            let time_ms = args["time_ms"].as_u64().ok_or("time_ms required")? as u32;
            let property = args["property"].as_str().ok_or("property required")?;
            let value = parse_keyframe_value(&args["value"]);
            let easing = args["easing"]
                .as_str()
                .map(parse_easing)
                .unwrap_or(Easing::Linear);

            let scene = p.find_scene_mut(scene_id)?;
            let obj = scene
                .objects
                .iter_mut()
                .find(|o| o.id == object_id)
                .ok_or_else(|| format!("Object '{}' not found", object_id))?;

            obj.keyframes
                .retain(|k| !(k.property == property && k.time_ms == time_ms));

            let kf = Keyframe::new(time_ms, property, value, easing);
            let id = kf.id.clone();
            obj.keyframes.push(kf);
            obj.keyframes.sort_by_key(|k| k.time_ms);
            p.touch();
            Ok(json!({ "id": id, "time_ms": time_ms, "property": property }))
        }

        "event_add" => {
            let p = state.require_project_mut()?;
            let scene_id = args["scene_id"].as_str().ok_or("scene_id required")?;
            let object_id = args["object_id"].as_str().ok_or("object_id required")?;
            let trigger_str = args["trigger"].as_str().ok_or("trigger required")?;
            let action_str = args["action"].as_str().ok_or("action required")?;

            let trigger = match trigger_str {
                "Click" => EventTrigger::Click,
                "HoverEnter" => EventTrigger::HoverEnter,
                "HoverLeave" => EventTrigger::HoverLeave,
                "SceneEnd" => EventTrigger::SceneEnd,
                _ => return Err(format!("Unknown trigger: {}", trigger_str)),
            };

            let action = match action_str {
                "GotoScene" => {
                    let target = args["target_scene_id"]
                        .as_str()
                        .ok_or("target_scene_id required for GotoScene")?;
                    EventAction::GotoScene {
                        scene_id: target.to_string(),
                    }
                }
                "ToggleVisible" => {
                    let target = args["target_object_id"]
                        .as_str()
                        .ok_or("target_object_id required for ToggleVisible")?;
                    EventAction::ToggleVisible {
                        object_id: target.to_string(),
                    }
                }
                "SetProperty" => {
                    let target_obj = args["target_object_id"]
                        .as_str()
                        .ok_or("target_object_id required for SetProperty")?;
                    let prop = args["target_property"]
                        .as_str()
                        .ok_or("target_property required for SetProperty")?;
                    let val = parse_keyframe_value(&args["target_value"]);
                    EventAction::SetProperty {
                        object_id: target_obj.to_string(),
                        property: prop.to_string(),
                        value: val,
                    }
                }
                _ => return Err(format!("Unknown action: {}", action_str)),
            };

            let scene = p.find_scene_mut(scene_id)?;
            let obj = scene
                .objects
                .iter_mut()
                .find(|o| o.id == object_id)
                .ok_or_else(|| format!("Object '{}' not found", object_id))?;

            let binding = EventBinding::new(trigger, action);
            let id = binding.id.clone();
            obj.events.push(binding);
            p.touch();
            Ok(json!({ "id": id }))
        }

        "effect_apply" => {
            let effect_name = args["effect_name"].as_str().ok_or("effect_name required")?;
            let _time_ms = args["time_ms"].as_u64().unwrap_or(0) as u32;
            Ok(json!({
                "note": format!("Effect '{}' — apply via CLI or GUI. MCP effect application requires the built-in effects library integration.", effect_name)
            }))
        }

        "data_connect" => {
            let source_type = args["source_type"].as_str().ok_or("source_type required")?;
            let connection = args["connection"].as_str().ok_or("connection required")?;

            let connector: Box<dyn DataConnector> = match source_type {
                "sqlite" => Box::new(
                    data::sqlite::SqliteConnector::new(connection)
                        .map_err(|e| format!("SQLite: {}", e))?,
                ),
                "csv" => Box::new(
                    data::csv_source::CsvConnector::new(connection)
                        .map_err(|e| format!("CSV: {}", e))?,
                ),
                "postgres" => Box::new(
                    data::postgres::PostgresConnector::new(connection)
                        .map_err(|e| format!("Postgres: {}", e))?,
                ),
                _ => return Err(format!("Unknown source type: {}", source_type)),
            };

            let tables = connector.tables()?;
            state.data_connection = Some(connector);
            Ok(json!({ "connected": true, "tables": tables }))
        }

        "data_bind" => {
            let p = state.require_project_mut()?;
            let scene_id = args["scene_id"].as_str().ok_or("scene_id required")?;
            let object_id = args["object_id"].as_str().ok_or("object_id required")?;
            let property = args["property"].as_str().ok_or("property required")?;
            let column = args["column"].as_str().ok_or("column required")?;
            let transform = match args["transform"].as_str().unwrap_or("none") {
                "uppercase" => BindTransform::Uppercase,
                "lowercase" => BindTransform::Lowercase,
                _ => BindTransform::None,
            };

            let scene = p.find_scene_mut(scene_id)?;
            let obj = scene
                .objects
                .iter_mut()
                .find(|o| o.id == object_id)
                .ok_or_else(|| format!("Object '{}' not found", object_id))?;

            let binding = DataBinding::new(property, column, transform);
            let id = binding.id.clone();
            obj.data_bindings.push(binding);
            p.touch();
            Ok(json!({ "id": id, "property": property, "column": column }))
        }

        "data_preview" => {
            let p = state.require_project()?;
            let connector = state.require_data()?;
            let row_idx = args["row"].as_u64().ok_or("row required")? as u32;

            let table = p
                .data_source
                .as_ref()
                .map(|ds| ds.table.clone())
                .ok_or("No table configured in project")?;

            let result = connector.rows(&table, row_idx, 1)?;
            if result.rows.is_empty() {
                return Err(format!("Row {} not found", row_idx));
            }

            let resolved = export::resolve_bindings(p, &result.rows[0]);
            let preview: Vec<Value> = resolved
                .scenes
                .iter()
                .flat_map(|s| &s.objects)
                .filter(|o| !o.data_bindings.is_empty())
                .map(|o| {
                    json!({
                        "name": o.name,
                        "content": o.content,
                        "fill": o.style.fill,
                        "visible": o.visible
                    })
                })
                .collect();

            Ok(json!({ "row": row_idx, "data": result.rows[0], "resolved": preview }))
        }

        "export_html" => {
            let p = state.require_project()?;
            let path = args["path"].as_str().ok_or("path required")?;
            let single_file = args["single_file"].as_bool().unwrap_or(true);
            let autoplay = args["autoplay"].as_bool().unwrap_or(false);
            let loop_pb = args["loop"].as_bool().unwrap_or(false);

            if single_file {
                html::export_single_file(p, path, autoplay, loop_pb)?;
            } else {
                html::export_folder(p, path, autoplay, loop_pb)?;
            }
            Ok(json!({ "exported": path, "single_file": single_file }))
        }

        "export_batch" => {
            let p = state.require_project()?;
            let connector = state.require_data()?;
            let output_dir = args["output_dir"].as_str().ok_or("output_dir required")?;
            let single_file = args["single_file"].as_bool().unwrap_or(true);
            let name_column = args["name_column"].as_str();

            let table = p
                .data_source
                .as_ref()
                .map(|ds| ds.table.clone())
                .ok_or("No table configured")?;

            let total = connector.row_count(&table)?;
            fs::create_dir_all(output_dir).map_err(|e| format!("Dir error: {}", e))?;

            let mut exported = 0u32;
            let batch_size = 50u32;
            let mut offset = 0u32;

            while offset < total {
                let result = connector.rows(&table, offset, batch_size)?;
                for (i, row) in result.rows.iter().enumerate() {
                    let resolved = export::resolve_bindings(p, row);
                    let row_idx = offset + i as u32;

                    let filename = if let Some(col) = name_column {
                        let name_val = row
                            .get(col)
                            .map(|v| match v {
                                Value::String(s) => s.clone(),
                                _ => v.to_string().trim_matches('"').to_string(),
                            })
                            .unwrap_or_else(|| format!("row_{:04}", row_idx));
                        export::sanitize_filename(&name_val)
                    } else {
                        format!("row_{:04}", row_idx)
                    };

                    let dir = std::path::PathBuf::from(output_dir);
                    if single_file {
                        let file_path = dir.join(format!("{}.html", filename));
                        html::export_single_file(
                            &resolved,
                            &file_path.to_string_lossy(),
                            false,
                            false,
                        )?;
                    } else {
                        let subdir = dir.join(&filename);
                        html::export_folder(&resolved, &subdir.to_string_lossy(), false, false)?;
                    }
                    exported += 1;
                }
                offset += batch_size;
            }

            Ok(json!({ "exported": exported, "output_dir": output_dir }))
        }

        "template_list" => {
            let mut templates = Vec::new();
            let dir = std::path::PathBuf::from("templates");
            if dir.exists() {
                if let Ok(entries) = fs::read_dir(&dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().and_then(|e| e.to_str()) == Some("citcat") {
                            let name = path
                                .file_stem()
                                .and_then(|n| n.to_str())
                                .unwrap_or("unknown")
                                .to_string();
                            templates.push(json!({ "name": name, "path": path.to_string_lossy() }));
                        }
                    }
                }
            }
            Ok(json!({ "templates": templates }))
        }

        "template_load" => {
            let name = args["name"].as_str().ok_or("name required")?;
            let path = format!("templates/{}.citcat", name);
            let content = fs::read_to_string(&path)
                .map_err(|e| format!("Template '{}' not found: {}", name, e))?;
            let project: Project =
                serde_json::from_str(&content).map_err(|e| format!("Parse error: {}", e))?;
            let info = json!({
                "name": project.meta.name,
                "scenes": project.scenes.len()
            });
            state.project = Some(project);
            Ok(info)
        }

        _ => Err(format!("Unknown tool: {}", name)),
    }
}

fn make_response(id: Value, result: Result<Value, String>) -> JsonRpcResponse {
    match result {
        Ok(val) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(json!({
                "content": [{ "type": "text", "text": serde_json::to_string_pretty(&val).unwrap_or_default() }]
            })),
            error: None,
        },
        Err(msg) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(json!({
                "content": [{ "type": "text", "text": msg }],
                "isError": true
            })),
            error: None,
        },
    }
}

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let mut state = McpState::new();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        if line.trim().is_empty() {
            continue;
        }

        let request: JsonRpcRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                let err_resp = JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: Value::Null,
                    result: None,
                    error: Some(JsonRpcError {
                        code: -32700,
                        message: format!("Parse error: {}", e),
                    }),
                };
                let _ = writeln!(stdout, "{}", serde_json::to_string(&err_resp).unwrap());
                let _ = stdout.flush();
                continue;
            }
        };

        let id = request.id.clone().unwrap_or(Value::Null);

        let response = match request.method.as_str() {
            "initialize" => handle_initialize(id),
            "notifications/initialized" => continue,
            "tools/list" => handle_tools_list(id),
            "tools/call" => {
                let tool_name = request.params["name"].as_str().unwrap_or("");
                let args = &request.params["arguments"];
                let result = handle_tool_call(&mut state, tool_name, args);
                make_response(id, result)
            }
            _ => JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id,
                result: None,
                error: Some(JsonRpcError {
                    code: -32601,
                    message: format!("Method not found: {}", request.method),
                }),
            },
        };

        let json = serde_json::to_string(&response).unwrap();
        let _ = writeln!(stdout, "{}", json);
        let _ = stdout.flush();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_definitions_complete() {
        let tools = tool_definitions();
        assert!(tools.len() >= 17, "Expected at least 17 tools, got {}", tools.len());

        let names: Vec<&str> = tools
            .iter()
            .filter_map(|t| t["name"].as_str())
            .collect();

        assert!(names.contains(&"project_new"));
        assert!(names.contains(&"project_open"));
        assert!(names.contains(&"project_save"));
        assert!(names.contains(&"project_info"));
        assert!(names.contains(&"scene_add"));
        assert!(names.contains(&"object_add"));
        assert!(names.contains(&"keyframe_add"));
        assert!(names.contains(&"event_add"));
        assert!(names.contains(&"export_html"));
        assert!(names.contains(&"export_batch"));
        assert!(names.contains(&"data_connect"));
        assert!(names.contains(&"data_bind"));
    }

    #[test]
    fn test_project_roundtrip_via_tools() {
        let mut state = McpState::new();

        let result = handle_tool_call(&mut state, "project_new", &json!({ "name": "MCP Test", "width": 1280, "height": 720 }));
        assert!(result.is_ok());
        let info = result.unwrap();
        assert_eq!(info["name"], "MCP Test");
        assert_eq!(info["width"], 1280);

        let result = handle_tool_call(&mut state, "scene_add", &json!({ "name": "Scene 2", "duration_ms": 3000 }));
        assert!(result.is_ok());
        let scene_id = result.unwrap()["id"].as_str().unwrap().to_string();

        let result = handle_tool_call(&mut state, "object_add", &json!({
            "scene_id": scene_id,
            "type": "text",
            "content": "Hello MCP",
            "x": 50,
            "y": 50,
            "width": 300,
            "height": 60,
            "fill": "#ff0000"
        }));
        assert!(result.is_ok());
        let obj_id = result.unwrap()["id"].as_str().unwrap().to_string();

        let result = handle_tool_call(&mut state, "object_list", &json!({ "scene_id": scene_id }));
        assert!(result.is_ok());
        let objects = &result.unwrap()["objects"];
        assert_eq!(objects.as_array().unwrap().len(), 1);
        assert_eq!(objects[0]["content"], "Hello MCP");

        let dir = std::env::temp_dir();
        let save_path = dir.join("citcat_mcp_test.citcat");
        let result = handle_tool_call(&mut state, "project_save", &json!({ "path": save_path.to_string_lossy() }));
        assert!(result.is_ok());

        let mut state2 = McpState::new();
        let result = handle_tool_call(&mut state2, "project_open", &json!({ "path": save_path.to_string_lossy() }));
        assert!(result.is_ok());
        assert_eq!(result.unwrap()["name"], "MCP Test");

        let result = handle_tool_call(&mut state2, "project_info", &json!({}));
        assert!(result.is_ok());
        let info = result.unwrap();
        assert_eq!(info["total_scenes"], 2);

        let _ = fs::remove_file(&save_path);
    }

    #[test]
    fn test_keyframe_and_event_via_tools() {
        let mut state = McpState::new();

        handle_tool_call(&mut state, "project_new", &json!({ "name": "KF Test" })).unwrap();

        let info = handle_tool_call(&mut state, "project_info", &json!({})).unwrap();
        let scene_id = info["scenes"][0]["id"].as_str().unwrap().to_string();

        let obj = handle_tool_call(&mut state, "object_add", &json!({
            "scene_id": scene_id,
            "type": "rect",
            "content": ""
        })).unwrap();
        let obj_id = obj["id"].as_str().unwrap().to_string();

        let kf = handle_tool_call(&mut state, "keyframe_add", &json!({
            "scene_id": scene_id,
            "object_id": obj_id,
            "time_ms": 0,
            "property": "transform.x",
            "value": 100.0,
            "easing": "EaseOut"
        })).unwrap();
        assert_eq!(kf["time_ms"], 0);
        assert_eq!(kf["property"], "transform.x");

        let ev = handle_tool_call(&mut state, "event_add", &json!({
            "scene_id": scene_id,
            "object_id": obj_id,
            "trigger": "Click",
            "action": "ToggleVisible",
            "target_object_id": obj_id
        })).unwrap();
        assert!(ev["id"].as_str().is_some());
    }
}
