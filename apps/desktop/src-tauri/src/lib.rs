// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// PowerSync offline-storage risk spike: this command lets the JS side push
// evidence lines to the real process stdout (println!), which is what we
// capture from the terminal to prove persistence across restarts without
// depending on webview devtools console forwarding.
#[tauri::command]
fn spike_log(message: String) {
    println!("[spike] {}", message);
}

// FRICTION FINDING: PowerSyncTauriDatabase does not create its containing
// directory before asking rusqlite to open the file, so opening a database
// under appDataDir() on first launch fails with SQLite CANTOPEN because
// `~/Library/Application Support/<identifier>/` doesn't exist yet. The app
// must create it itself first, which is what this command does.
#[tauri::command]
fn spike_ensure_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_powersync::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            spike_log,
            spike_ensure_app_data_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
