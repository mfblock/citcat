mod commands;
pub mod data;
pub mod export;
pub mod history;
pub mod model;
mod state;
pub mod subtitle;

use commands::{binding, data as data_cmd, effect, event, export as export_cmd, history as history_cmd, keyframe, object, path, project, scene, subtitle as subtitle_cmd, template, waitpoint};
use state::AppState;
use tauri::menu::{MenuBuilder, SubmenuBuilder};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .setup(|app| {
            let file_menu = SubmenuBuilder::new(app, "File")
                .text("new-project", "New Project")
                .text("open-project", "Open...")
                .separator()
                .text("save-project", "Save")
                .text("save-project-as", "Save As...")
                .separator()
                .text("export-project", "Export...")
                .separator()
                .text("templates", "Templates...")
                .separator()
                .quit()
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .text("undo", "Undo")
                .text("redo", "Redo")
                .separator()
                .cut()
                .copy()
                .paste()
                .separator()
                .text("duplicate", "Duplicate")
                .text("delete", "Delete")
                .select_all()
                .build()?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .text("fullscreen-preview", "Fullscreen Preview")
                .separator()
                .text("zoom-in", "Zoom In")
                .text("zoom-out", "Zoom Out")
                .text("zoom-reset", "Reset Zoom")
                .separator()
                .text("grid-snap", "Toggle Grid Snap")
                .build()?;

            let insert_menu = SubmenuBuilder::new(app, "Insert")
                .text("insert-text", "Text")
                .text("insert-rect", "Rectangle")
                .text("insert-ellipse", "Ellipse")
                .text("insert-image", "Image...")
                .text("insert-video", "Video...")
                .text("insert-audio", "Audio...")
                .text("insert-svg", "SVG...")
                .separator()
                .text("insert-button", "Button")
                .text("insert-hotspot", "Hotspot")
                .build()?;

            let scene_menu = SubmenuBuilder::new(app, "Scene")
                .text("add-scene", "Add Scene")
                .separator()
                .text("next-scene", "Next Scene")
                .text("prev-scene", "Previous Scene")
                .separator()
                .text("subtitles", "Subtitles...")
                .build()?;

            let playback_menu = SubmenuBuilder::new(app, "Playback")
                .text("play-pause", "Play / Pause")
                .text("stop", "Stop")
                .separator()
                .text("data-source", "Data Source...")
                .build()?;

            let menu = MenuBuilder::new(app)
                .items(&[
                    &file_menu,
                    &edit_menu,
                    &view_menu,
                    &insert_menu,
                    &scene_menu,
                    &playback_menu,
                ])
                .build()?;

            app.set_menu(menu)?;

            app.on_menu_event(move |app_handle, event| {
                let id = event.id().0.as_str();
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.eval(&format!("if(window.CitCatMenu)CitCatMenu.handle('{}')", id));
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            project::project_new,
            project::project_get,
            project::project_save,
            project::project_open,
            scene::scene_add,
            scene::scene_update,
            scene::scene_delete,
            scene::scene_reorder,
            object::object_add,
            object::object_update,
            object::object_delete,
            object::object_reorder,
            object::object_duplicate,
            keyframe::keyframe_add,
            keyframe::keyframe_update,
            keyframe::keyframe_delete,
            effect::effects_list,
            effect::effects_reload,
            effect::effect_apply,
            event::event_add,
            event::event_update,
            event::event_delete,
            path::path_set,
            path::path_add_point,
            path::path_update_point,
            path::path_delete_point,
            data_cmd::data_connect,
            data_cmd::data_tables,
            data_cmd::data_columns,
            data_cmd::data_rows,
            data_cmd::data_select_table,
            data_cmd::data_set_preview_row,
            data_cmd::data_disconnect,
            binding::binding_add,
            binding::binding_delete,
            binding::condition_set,
            export_cmd::export_html,
            export_cmd::export_batch_html,
            export_cmd::dialog_export_save,
            export_cmd::dialog_export_folder,
            export_cmd::dialog_export_mp4,
            export_cmd::check_ffmpeg,
            export_cmd::mp4_create_temp_dir,
            export_cmd::mp4_write_frame,
            export_cmd::mp4_encode,
            export_cmd::mp4_cleanup,
            history_cmd::history_push,
            history_cmd::undo,
            history_cmd::redo,
            template::template_list,
            template::template_save,
            template::template_load,
            project::dialog_save_file,
            project::dialog_open_file,
            project::dialog_open_image,
            project::dialog_open_video,
            project::dialog_open_audio,
            project::dialog_open_svg,
            project::read_svg_file,
            waitpoint::waitpoint_add,
            waitpoint::waitpoint_update,
            waitpoint::waitpoint_delete,
            subtitle_cmd::subtitle_import,
            subtitle_cmd::subtitle_export,
            subtitle_cmd::subtitle_add_entry,
            subtitle_cmd::subtitle_update_entry,
            subtitle_cmd::subtitle_delete_entry,
            subtitle_cmd::subtitle_clear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
