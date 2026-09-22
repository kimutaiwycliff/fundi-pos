import AsyncStorage from '@react-native-async-storage/async-storage';
import TcpSocket from 'react-native-tcp-socket';

// UNVERIFIED against real hardware - no physical printer is available in
// this environment to test against. Ported from apps/desktop/src/printer.ts
// + src-tauri/src/escpos.rs (read those first for the full reasoning: why
// hand-rolled ESC/POS rather than a third-party plugin, why a raw TCP/
// JetDirect socket on port 9100 rather than USB/serial). As on desktop, only
// the byte sequences themselves (Epson's long-stable, publicly documented
// ESC/POS command set) can be verified without hardware - actually writing
// them to a network printer and having it produce a legible receipt cannot
// be, from here.
//
// Printer connection details are a per-till setting, not app config. This
// app has no localStorage (RN has no DOM), so AsyncStorage is the mobile
// equivalent - same key names as desktop's localStorage keys, purely so the
// naming is consistent across platforms (the values themselves are never
// shared between a phone and a desktop till; each device has its own).
const HOST_KEY = 'hardware-pos-printer-host';
const PORT_KEY = 'hardware-pos-printer-port';

export async function getPrinterSettings(): Promise<{ host: string; port: number } | null> {
  try {
    const [host, port] = await Promise.all([AsyncStorage.getItem(HOST_KEY), AsyncStorage.getItem(PORT_KEY)]);
    if (!host || !port) return null;
    const parsedPort = Number(port);
    if (!Number.isFinite(parsedPort) || parsedPort <= 0) return null;
    return { host, port: parsedPort };
  } catch {
    // A corrupt/unavailable AsyncStorage read is the same as "not
    // configured" here - never a reason to error out of a sale.
    return null;
  }
}

export async function setPrinterSettings(host: string, port: number): Promise<void> {
  await AsyncStorage.setItem(HOST_KEY, host);
  await AsyncStorage.setItem(PORT_KEY, String(port));
}

// --- ESC/POS byte builders - ported 1:1 from escpos.rs's helpers ---

const ESC = 0x1b;
const GS = 0x1d;

function init(): number[] {
  return [ESC, 0x40]; // ESC @ - initialize printer
}

function setBold(on: boolean): number[] {
  return [ESC, 0x45, on ? 1 : 0]; // ESC E n
}

function setAlignCenter(): number[] {
  return [ESC, 0x61, 1]; // ESC a 1
}

function setAlignLeft(): number[] {
  return [ESC, 0x61, 0]; // ESC a 0
}

function lineFeed(): number[] {
  return [0x0a];
}

// GS V 0 - full cut (the modern, widely-supported ESC/POS cut command - see
// escpos.rs's cut_paper for why this over the older partial-cut commands).
function cutPaper(): number[] {
  return [GS, 0x56, 0x00];
}

// Hand-rolled UTF-8 encoder rather than the global TextEncoder - this repo's
// RN/Hermes version likely has it, but there's no reason to gamble on a
// runtime detail here when a ~15-line encoder removes the question
// entirely. Mirrors what Rust's String::as_bytes() does in escpos.rs's text().
function utf8Bytes(s: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const code = s.codePointAt(i)!;
    if (code > 0xffff) i++; // consume the low surrogate of the pair
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

function text(s: string): number[] {
  return utf8Bytes(s);
}

// Matches Rust's default `{}` Display for an f64 (2.0 -> "2", 2.5 -> "2.5")
// closely enough for receipt purposes - JS's default Number->String
// stringification already drops insignificant trailing zeros the same way.
function qty(n: number): string {
  return String(n);
}

function money(n: number): string {
  return n.toFixed(2);
}

export interface PrintableLine {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

// Same input shape as desktop's printer.ts (see Till.tsx's own printReceipt
// call site) so both platforms' receipts carry identical information.
export interface ReceiptInput {
  storeName: string;
  orderId: string;
  lines: PrintableLine[];
  taxTotal: number;
  total: number;
  tenderType: string;
  header?: string | null;
  footer?: string | null;
  // Set only for a credit sale still awaiting payment - left unset/null for
  // every other reprint, including a credit sale that's since been settled.
  unpaidNotice?: string | null;
}

/**
 * Assembles the full byte sequence for one receipt - ported 1:1 from
 * escpos.rs's build_receipt (line items are plain fixed-width text, no
 * columns/tables, same as desktop, for the same reason: real column
 * alignment depends on a specific printer's character width/font that can't
 * be confirmed without hardware). Kept in lockstep with the desktop version
 * so a receipt looks/behaves the same on the same class of hardware
 * regardless of which till printed it.
 */
export function buildReceiptBytes(order: ReceiptInput): Uint8Array {
  const out: number[] = [];
  out.push(...init());
  out.push(...setAlignCenter());
  out.push(...setBold(true));
  out.push(...text(order.storeName));
  out.push(...lineFeed());
  out.push(...setBold(false));
  out.push(...text(`Order ${order.orderId.slice(0, 8)}`));
  out.push(...lineFeed());
  if (order.header) {
    out.push(...text(order.header));
    out.push(...lineFeed());
  }
  out.push(...setAlignLeft());
  out.push(...lineFeed());

  for (const line of order.lines) {
    out.push(...text(`${line.name} x${qty(line.quantity)} @ ${money(line.unitPrice)} = ${money(line.lineTotal)}`));
    out.push(...lineFeed());
  }

  out.push(...lineFeed());
  out.push(...text(`Tax: ${money(order.taxTotal)}`));
  out.push(...lineFeed());
  out.push(...setBold(true));
  out.push(...text(`Total: ${money(order.total)} (${order.tenderType})`));
  out.push(...setBold(false));
  out.push(...lineFeed());
  if (order.unpaidNotice) {
    out.push(...setAlignCenter());
    out.push(...setBold(true));
    out.push(...text(order.unpaidNotice));
    out.push(...setBold(false));
    out.push(...lineFeed());
    out.push(...setAlignLeft());
  }
  if (order.footer) {
    out.push(...lineFeed());
    out.push(...setAlignCenter());
    out.push(...text(order.footer));
    out.push(...lineFeed());
  }
  out.push(...lineFeed());
  out.push(...lineFeed());
  out.push(...cutPaper());

  return new Uint8Array(out);
}

// Matches desktop's 5s write_timeout in escpos.rs's send_to_network_printer
// (there it's a blocking std::net::TcpStream; here it bounds both the async
// connect and the write via a JS-level watchdog on top of the library's own
// connectTimeout, since this is UNVERIFIED against real hardware and can't
// be trusted to always behave the same across Android/iOS network stacks).
const CONNECT_TIMEOUT_MS = 5000;

/**
 * Never throws and never rejects - a bad, unreachable, unconfigured, or slow
 * printer must never block or fail a completed sale (same non-fatal
 * contract as desktop's printer.ts). Unlike desktop, an UNCONFIGURED printer
 * resolves as a silent no-op rather than an error: printing is opt-in here,
 * and a till that's never set one up shouldn't see any printer-related
 * error at all. Callers should fire this off after a sale completes and
 * never await it on the critical path - it's not meant to delay the
 * cashier's confirmation/receipt screen.
 */
export async function printReceipt(order: ReceiptInput): Promise<void> {
  const settings = await getPrinterSettings();
  if (!settings) return; // no-op: no printer configured for this till

  let bytes: Uint8Array;
  try {
    bytes = buildReceiptBytes(order);
  } catch {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    let client: ReturnType<typeof TcpSocket.createConnection> | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        client?.destroy();
      } catch {
        // already closed/destroyed - nothing to do
      }
      resolve();
    };

    const timer = setTimeout(finish, CONNECT_TIMEOUT_MS);

    try {
      client = TcpSocket.createConnection({ host: settings.host, port: settings.port, connectTimeout: CONNECT_TIMEOUT_MS }, () => {
        try {
          client?.write(bytes, undefined, () => finish());
        } catch {
          finish();
        }
      });
      client.on('error', () => finish());
    } catch {
      finish();
    }
  });
}
