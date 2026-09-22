mod escpos;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
    unpaid_notice: Option<String>,
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
        unpaid_notice,
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
        .invoke_handler(tauri::generate_handler![
            greet,
            print_receipt,
            kick_cash_drawer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
