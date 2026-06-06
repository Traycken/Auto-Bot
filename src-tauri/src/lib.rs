mod blocks;
mod engine;
mod ipc;
mod overlay;

use tauri::Manager;

pub fn run() {
    env_logger::init();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    let builder = overlay::register_protocol(builder);

    builder
        .setup(|app| {
            let handle = app.handle().clone();
            engine::ExecutionEngine::init(handle.clone());
            app.manage(overlay::OverlayResult(
                std::sync::Arc::new(std::sync::Mutex::new(None))
            ));

            // Ensure Fonctions/ directory exists on startup
            if let Ok(exe) = std::env::current_exe() {
                if let Some(dir) = exe.parent() {
                    let fn_dir = dir.join("Fonctions");
                    let _ = std::fs::create_dir_all(&fn_dir);
                    log::info!("Fonctions dir: {}", fn_dir.display());
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Sequence
            ipc::run_sequence,
            ipc::stop_sequence,
            // Screens
            ipc::list_screens,
            ipc::capture_pixel_color,
            ipc::capture_region,
            ipc::get_cursor_position,
            // Region selector
            ipc::select_screen_region,
            ipc::submit_region_selection,
            ipc::cancel_region_selection,
            ipc::request_cmd_admin_access,
            ipc::is_app_elevated,
            // Functions directory
            ipc::get_exe_dir,
            ipc::get_functions_dir,
            ipc::list_functions,
            ipc::write_text_file_native,
            // Settings & OCR detection
            ipc::get_settings,
            ipc::save_settings,
            ipc::detect_tesseract_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Auto Bot");
}
