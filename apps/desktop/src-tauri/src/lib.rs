mod connector;
mod escpos;
mod pin;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use connector::{ApiConnector, ConnectorHandle};
use powersync::SyncOptions;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_powersync::PowerSyncExt;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// FRICTION FINDING (from the earlier throwaway spike, still true for the real
// schema): PowerSyncTauriDatabase does not create its containing directory
// before asking rusqlite to open the file, so opening a database under
// appDataDir() on first launch fails with SQLite CANTOPEN because
// `~/Library/Application Support/<identifier>/` doesn't exist yet. The app
// must create it itself first, which is what this command does.
#[tauri::command]
fn ensure_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

/// Live connectors, keyed by the JS-visible `rustHandle` of the
/// PowerSyncTauriDatabase they're attached to, so `powersync_update_token`
/// can reach back into an already-running connector's credentials.
#[derive(Default)]
struct ConnectorRegistry(Mutex<HashMap<usize, Arc<ApiConnector>>>);

/// Looks up the [`powersync::PowerSyncDatabase`] behind a JS `rustHandle` and
/// connects it to the PowerSync service (http://localhost:8080) using a real
/// Rust `BackendConnector` (see src/connector.rs). This only exists as a
/// custom command because `PowerSyncTauriDatabase.connect()` throws by
/// design in JavaScript in this SDK - see
/// ~/.cargo/registry/src/*/tauri-plugin-powersync-0.0.6, whose `Command` enum
/// (src/commands.rs) has no `Connect` variant, and
/// node_modules/@powersync/tauri-plugin/guest-js/database.ts's `connect()`
/// override, which unconditionally throws
/// "Instead, call connect() in your Rust code."
#[tauri::command]
async fn powersync_connect(
    app: AppHandle,
    registry: State<'_, ConnectorRegistry>,
    rust_handle: usize,
    api_base_url: String,
    powersync_url: String,
    payload_token: String,
) -> Result<(), String> {
    let db = app
        .powersync()
        .database_from_javascript_handle(rust_handle)
        .map_err(|e| e.to_string())?;

    let connector = Arc::new(ApiConnector::new(db.clone(), api_base_url, powersync_url, payload_token));
    registry.0.lock().unwrap().insert(rust_handle, connector.clone());

    db.connect(SyncOptions::new(ConnectorHandle(connector))).await;
    Ok(())
}

/// Updates the Payload token an already-connected connector uses to mint
/// fresh PowerSync JWTs (see connector.rs's fetch_credentials).
#[tauri::command]
fn powersync_update_token(registry: State<'_, ConnectorRegistry>, rust_handle: usize, payload_token: String) -> Result<(), String> {
    let map = registry.0.lock().unwrap();
    let connector = map
        .get(&rust_handle)
        .ok_or_else(|| format!("no connector registered for handle {rust_handle}"))?;
    connector.set_payload_token(payload_token);
    Ok(())
}

#[tauri::command]
async fn powersync_disconnect(app: AppHandle, rust_handle: usize) -> Result<(), String> {
    let db = app
        .powersync()
        .database_from_javascript_handle(rust_handle)
        .map_err(|e| e.to_string())?;
    db.disconnect().await;
    Ok(())
}

/// Verifies a manager/owner's PIN fully offline (spec Section 6.1: refunds/
/// voids gated behind manager PIN, must work with zero network) against the
/// `pin_hash` column already synced down for this tenant via the `users`
/// PowerSync stream. The JS side looks up the candidate manager's stored
/// hash locally first (see src/pin.ts) and passes it in here - this command
/// never touches the database itself, just the scrypt comparison.
#[tauri::command]
fn verify_manager_pin(pin: String, stored_hash: String) -> bool {
    pin::verify_pin(&pin, &stored_hash)
}

#[derive(serde::Deserialize)]
struct ReceiptLineInput {
    name: String,
    quantity: f64,
    #[serde(rename = "unitPrice")]
    unit_price: f64,
    #[serde(rename = "lineTotal")]
    line_total: f64,
}

/// UNVERIFIED against real hardware (see escpos.rs's module doc) - builds
/// and sends one receipt, kicking the cash drawer only for cash tenders
/// (spec Section 6.5: cash always works offline; the print itself is
/// attempted regardless of connectivity, since it's local network I/O to
/// the printer, not a call to apps/api).
#[tauri::command]
fn print_receipt(
    printer_host: String,
    printer_port: u16,
    store_name: String,
    order_id: String,
    lines: Vec<ReceiptLineInput>,
    tax_total: f64,
    total: f64,
    tender_type: String,
    header: Option<String>,
    footer: Option<String>,
) -> Result<(), String> {
    let data = escpos::ReceiptData {
        store_name,
        order_id,
        lines: lines
            .into_iter()
            .map(|l| escpos::ReceiptLine {
                name: l.name,
                quantity: l.quantity,
                unit_price: l.unit_price,
                line_total: l.line_total,
            })
            .collect(),
        tax_total,
        total,
        kick_drawer: tender_type == "cash",
        tender_type,
        header,
        footer,
    };
    let bytes = escpos::build_receipt(&data);
    escpos::send_to_network_printer(&printer_host, printer_port, &bytes)
}

/// UNVERIFIED against real hardware - kicks the drawer without printing
/// anything, for a manual "open drawer" action independent of a sale.
#[tauri::command]
fn kick_cash_drawer(printer_host: String, printer_port: u16) -> Result<(), String> {
    escpos::send_to_network_printer(&printer_host, printer_port, &escpos::kick_cash_drawer())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_powersync::init())
        .manage(ConnectorRegistry::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            ensure_app_data_dir,
            powersync_connect,
            powersync_update_token,
            powersync_disconnect,
            verify_manager_pin,
            print_receipt,
            kick_cash_drawer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
