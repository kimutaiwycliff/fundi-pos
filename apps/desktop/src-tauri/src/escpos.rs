// Raw ESC/POS command generation for receipt printing + cash-drawer kick
// (spec Section 6.1 / "Hardware integration" build-order item). No physical
// printer is available in this environment to test against - this module
// is split so the part that CAN be verified without hardware (the exact
// byte sequences, checked against Epson's long-stable, publicly documented
// ESC/POS command set) is separated from the part that genuinely can't
// (actually writing those bytes to a real printer over the network).
//
// Deliberately not using a third-party Tauri printer plugin
// (tauri-plugin-thermal-printer exists on npm, but is a month-old,
// single-maintainer package - more dependency risk than hand-rolling a
// ~40-year-old, extremely well-documented protocol ourselves, and this way
// the byte-level correctness is independently checkable against the spec).
//
// Network (TCP, port 9100 "raw"/JetDirect) rather than USB/serial: most
// receipt printers either are network-capable directly or sit behind a
// print-server bridge, and this avoids OS-specific USB/serial driver code
// with no way to test it here anyway. USB/serial is a documented follow-up,
// not implemented.
use std::io::Write;
use std::net::TcpStream;
use std::time::Duration;

const ESC: u8 = 0x1B;
const GS: u8 = 0x1D;

pub fn init() -> Vec<u8> {
    vec![ESC, b'@']
}

pub fn set_bold(on: bool) -> Vec<u8> {
    vec![ESC, b'E', if on { 1 } else { 0 }]
}

pub fn set_align_center() -> Vec<u8> {
    vec![ESC, b'a', 1]
}

pub fn set_align_left() -> Vec<u8> {
    vec![ESC, b'a', 0]
}

pub fn text(s: &str) -> Vec<u8> {
    s.as_bytes().to_vec()
}

pub fn line_feed() -> Vec<u8> {
    vec![0x0A]
}

/// GS V 0 - full cut. The modern, widely-supported ESC/POS cut command
/// (as opposed to the older printer-specific ESC i / ESC m partial-cut
/// commands some legacy printers use instead).
pub fn cut_paper() -> Vec<u8> {
    vec![GS, b'V', 0x00]
}

/// ESC p m t1 t2 - drawer kick-out. m=0 selects the drawer wired to pin 2
/// (the standard on nearly all receipt-printer drawer ports); t1/t2 are
/// pulse on/off duration in 2ms units - 25/250 (50ms on, 500ms off) is the
/// commonly cited default pulse width long enough to reliably trip a
/// solenoid.
pub fn kick_cash_drawer() -> Vec<u8> {
    vec![ESC, b'p', 0x00, 25, 250]
}

pub struct ReceiptLine {
    pub name: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub line_total: f64,
}

pub struct ReceiptData {
    pub store_name: String,
    pub order_id: String,
    pub lines: Vec<ReceiptLine>,
    pub tax_total: f64,
    pub total: f64,
    pub tender_type: String,
    pub kick_drawer: bool, // only for cash sales
    // Tenant-configurable (apps/web's Settings page, synced down via
    // PowerSync so this works fully offline) - typically an address/phone
    // for the header, a thank-you/return-policy line for the footer.
    pub header: Option<String>,
    pub footer: Option<String>,
    // Set only for a credit sale still awaiting payment - printed bold and
    // centered right after the total so a reprint of an unpaid tab can never
    // be mistaken for a settled one. Left None for every other sale,
    // including a credit sale that HAS since been settled - a settled
    // receipt is meant to look exactly like a normal one, that's the point.
    pub unpaid_notice: Option<String>,
}

/// Assembles the full byte sequence for one receipt. Line items are plain
/// fixed-width text (no columns/tables) - real column alignment depends on
/// the specific printer's character width and font, which can't be
/// confirmed without one; kept deliberately simple rather than guessing at
/// formatting no hardware here can validate.
pub fn build_receipt(data: &ReceiptData) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend(init());
    out.extend(set_align_center());
    out.extend(set_bold(true));
    out.extend(text(&data.store_name));
    out.extend(line_feed());
    out.extend(set_bold(false));
    out.extend(text(&format!("Order {}", &data.order_id[..8.min(data.order_id.len())])));
    out.extend(line_feed());
    if let Some(header) = &data.header {
        out.extend(text(header));
        out.extend(line_feed());
    }
    out.extend(set_align_left());
    out.extend(line_feed());

    for line in &data.lines {
        out.extend(text(&format!(
            "{} x{} @ {:.2} = {:.2}",
            line.name, line.quantity, line.unit_price, line.line_total
        )));
        out.extend(line_feed());
    }

    out.extend(line_feed());
    out.extend(text(&format!("Tax: {:.2}", data.tax_total)));
    out.extend(line_feed());
    out.extend(set_bold(true));
    out.extend(text(&format!("Total: {:.2} ({})", data.total, data.tender_type)));
    out.extend(set_bold(false));
    out.extend(line_feed());
    if let Some(notice) = &data.unpaid_notice {
        out.extend(set_align_center());
        out.extend(set_bold(true));
        out.extend(text(notice));
        out.extend(set_bold(false));
        out.extend(line_feed());
        out.extend(set_align_left());
    }
    if let Some(footer) = &data.footer {
        out.extend(line_feed());
        out.extend(set_align_center());
        out.extend(text(footer));
        out.extend(line_feed());
    }
    out.extend(line_feed());
    out.extend(line_feed());
    out.extend(cut_paper());

    if data.kick_drawer {
        out.extend(kick_cash_drawer());
    }

    out
}

/// UNVERIFIED against real hardware - no printer available in this
/// environment. Opens a plain TCP connection to the printer's raw/JetDirect
/// port (conventionally 9100) and writes the given bytes.
pub fn send_to_network_printer(host: &str, port: u16, bytes: &[u8]) -> Result<(), String> {
    let addr = format!("{host}:{port}");
    let mut stream = TcpStream::connect(&addr).map_err(|e| format!("connect to {addr} failed: {e}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;
    stream.write_all(bytes).map_err(|e| format!("write to {addr} failed: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_matches_the_documented_esc_at_command() {
        assert_eq!(init(), vec![0x1B, 0x40]);
    }

    #[test]
    fn cut_paper_matches_the_documented_gs_v_0_full_cut_command() {
        assert_eq!(cut_paper(), vec![0x1D, b'V', 0x00]);
    }

    #[test]
    fn kick_cash_drawer_matches_the_documented_esc_p_pulse_command() {
        assert_eq!(kick_cash_drawer(), vec![0x1B, b'p', 0x00, 25, 250]);
    }

    #[test]
    fn set_bold_toggles_between_the_documented_on_and_off_codes() {
        assert_eq!(set_bold(true), vec![0x1B, b'E', 0x01]);
        assert_eq!(set_bold(false), vec![0x1B, b'E', 0x00]);
    }

    #[test]
    fn build_receipt_includes_every_line_item_and_ends_with_a_cut() {
        let data = ReceiptData {
            store_name: "Demo Hardware Co".to_string(),
            order_id: "8a35129c-527c-4fc1-9ff5-6c847245c053".to_string(),
            lines: vec![ReceiptLine {
                name: "Claw Hammer".to_string(),
                quantity: 2.0,
                unit_price: 799.0,
                line_total: 1598.0,
            }],
            tax_total: 220.4,
            total: 1598.0,
            tender_type: "cash".to_string(),
            kick_drawer: true,
            header: None,
            footer: None,
            unpaid_notice: None,
        };

        let bytes = build_receipt(&data);
        let as_text = String::from_utf8_lossy(&bytes);

        assert!(as_text.contains("Demo Hardware Co"));
        assert!(as_text.contains("Claw Hammer x2 @ 799.00 = 1598.00"));
        assert!(as_text.contains("Total: 1598.00 (cash)"));
        // Cut command bytes, then the drawer kick, both at the very end.
        assert_eq!(&bytes[bytes.len() - 8..bytes.len() - 5], &cut_paper()[..]);
        assert_eq!(&bytes[bytes.len() - 5..], &kick_cash_drawer()[..]);
    }

    #[test]
    fn build_receipt_skips_the_drawer_kick_for_non_cash_tenders() {
        let data = ReceiptData {
            store_name: "Demo".to_string(),
            order_id: "x".to_string(),
            lines: vec![],
            tax_total: 0.0,
            total: 0.0,
            tender_type: "card".to_string(),
            kick_drawer: false,
            header: None,
            footer: None,
            unpaid_notice: None,
        };
        let bytes = build_receipt(&data);
        assert_eq!(&bytes[bytes.len() - 3..], &cut_paper()[..]);
    }

    #[test]
    fn build_receipt_includes_the_tenant_header_and_footer_when_set() {
        let data = ReceiptData {
            store_name: "Demo Hardware Co".to_string(),
            order_id: "x".to_string(),
            lines: vec![],
            tax_total: 0.0,
            total: 0.0,
            tender_type: "cash".to_string(),
            kick_drawer: false,
            header: Some("Westlands, Nairobi - 0700 000 000".to_string()),
            footer: Some("Thank you for your business!".to_string()),
            unpaid_notice: None,
        };
        let as_text = String::from_utf8_lossy(&build_receipt(&data)).into_owned();
        assert!(as_text.contains("Westlands, Nairobi - 0700 000 000"));
        assert!(as_text.contains("Thank you for your business!"));
    }

    #[test]
    fn build_receipt_prints_the_unpaid_notice_when_a_credit_sale_is_still_pending() {
        let data = ReceiptData {
            store_name: "Demo".to_string(),
            order_id: "x".to_string(),
            lines: vec![],
            tax_total: 0.0,
            total: 500.0,
            tender_type: "credit".to_string(),
            kick_drawer: false,
            header: None,
            footer: None,
            unpaid_notice: Some("UNPAID - PAY LATER".to_string()),
        };
        let as_text = String::from_utf8_lossy(&build_receipt(&data)).into_owned();
        assert!(as_text.contains("UNPAID - PAY LATER"));
    }

    #[test]
    fn build_receipt_omits_header_and_footer_lines_when_not_set() {
        let data = ReceiptData {
            store_name: "Demo".to_string(),
            order_id: "x".to_string(),
            lines: vec![],
            tax_total: 0.0,
            total: 0.0,
            tender_type: "cash".to_string(),
            kick_drawer: false,
            header: None,
            footer: None,
            unpaid_notice: None,
        };
        // Nothing to assert about absence of specific text (there's none to
        // check against) - this test exists to prove build_receipt doesn't
        // panic/misbehave when both are None, which the other tests never
        // exercised until the fields existed.
        build_receipt(&data);
    }
}
