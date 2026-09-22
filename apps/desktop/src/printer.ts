import { invoke } from '@tauri-apps/api/core';
import { SerialPort, type PortInfo } from 'tauri-plugin-serialplugin-api';

// UNVERIFIED against real hardware - no printer available in this
// environment (see src-tauri/src/escpos.rs's module doc for what IS
// verified: the exact ESC/POS byte sequences, checked against the
// documented command set). Printer connection details are a per-till
// setting, not app config - stored in localStorage, editable from the
// till UI (see PrinterSettings.tsx).
//
// Two printer types share this module: network (unchanged, byte-building
// stays in Rust - see escpos.rs) and USB/serial (new - most budget thermal
// printers enumerate as a virtual COM port via a CH340/CP210x-class chip,
// see tauri_plugin_serialplugin's registration in lib.rs). The serial path
// builds ESC/POS bytes here in TS instead of routing through a Rust Tauri
// command, since tauri-plugin-serialplugin's own JS API (verified against
// its actual shipped types, not guessed) already gives a complete,
// type-safe port-list/open/write surface - no extra Rust glue needed.
const TYPE_KEY = 'hardware-pos-printer-type';
const HOST_KEY = 'hardware-pos-printer-host';
const PORT_KEY = 'hardware-pos-printer-port';
const SERIAL_PATH_KEY = 'hardware-pos-printer-serial-path';
const SERIAL_BAUD_KEY = 'hardware-pos-printer-serial-baud';

export type PrinterTarget = { kind: 'network'; host: string; port: number } | { kind: 'usb'; path: string; baudRate: number };

export function getPrinterSettings(): PrinterTarget | null {
  const kind = localStorage.getItem(TYPE_KEY) === 'usb' ? 'usb' : 'network';
  if (kind === 'usb') {
    const path = localStorage.getItem(SERIAL_PATH_KEY);
    if (!path) return null;
    const baudRate = Number(localStorage.getItem(SERIAL_BAUD_KEY)) || 9600;
    return { kind: 'usb', path, baudRate };
  }
  const host = localStorage.getItem(HOST_KEY);
  const port = localStorage.getItem(PORT_KEY);
  if (!host || !port) return null;
  return { kind: 'network', host, port: Number(port) };
}

export function setPrinterSettings(target: PrinterTarget): void {
  localStorage.setItem(TYPE_KEY, target.kind);
  if (target.kind === 'usb') {
    localStorage.setItem(SERIAL_PATH_KEY, target.path);
    localStorage.setItem(SERIAL_BAUD_KEY, String(target.baudRate));
  } else {
    localStorage.setItem(HOST_KEY, target.host);
    localStorage.setItem(PORT_KEY, String(target.port));
  }
}

/** Ports currently visible to the OS - re-query on demand (a Refresh button in the UI), never cached, since USB devices are hot-pluggable. */
export async function listSerialPorts(): Promise<PortInfo[]> {
  const ports = await SerialPort.available_ports();
  return Object.values(ports);
}

export interface PrintableLine {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ReceiptInput {
  storeName: string;
  orderId: string;
  lines: PrintableLine[];
  taxTotal: number;
  total: number;
  tenderType: string;
  header?: string | null;
  footer?: string | null;
  // Set only for a credit sale still awaiting payment - see escpos.rs's
  // ReceiptData.unpaid_notice. Left unset/null for every other reprint,
  // including a credit sale that's since been settled.
  unpaidNotice?: string | null;
}

// --- ESC/POS byte builders for the USB/serial path only - the network
// path's bytes are still built in Rust (escpos.rs), unchanged. Ported 1:1
// from escpos.rs / apps/mobile/src/printer.ts's identical port, so a
// receipt looks/behaves the same regardless of platform or connection
// type. Uses the webview's built-in TextEncoder (unlike mobile's Hermes
// runtime, a Tauri webview reliably has it - no hand-rolled encoder
// needed here).
const ESC = 0x1b;
const GS = 0x1d;

function bytes(...b: number[]): number[] {
  return b;
}
function text(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

function buildReceiptBytes(order: ReceiptInput): Uint8Array {
  const out: number[] = [];
  out.push(...bytes(ESC, 0x40)); // ESC @ - initialize
  out.push(...bytes(ESC, 0x61, 1)); // ESC a 1 - align center
  out.push(...bytes(ESC, 0x45, 1)); // ESC E 1 - bold on
  out.push(...text(order.storeName));
  out.push(0x0a);
  out.push(...bytes(ESC, 0x45, 0)); // bold off
  out.push(...text(`Order ${order.orderId.slice(0, 8)}`));
  out.push(0x0a);
  if (order.header) {
    out.push(...text(order.header));
    out.push(0x0a);
  }
  out.push(...bytes(ESC, 0x61, 0)); // align left
  out.push(0x0a);

  for (const line of order.lines) {
    out.push(...text(`${line.name} x${line.quantity} @ ${line.unitPrice.toFixed(2)} = ${line.lineTotal.toFixed(2)}`));
    out.push(0x0a);
  }

  out.push(0x0a);
  out.push(...text(`Tax: ${order.taxTotal.toFixed(2)}`));
  out.push(0x0a);
  out.push(...bytes(ESC, 0x45, 1));
  out.push(...text(`Total: ${order.total.toFixed(2)} (${order.tenderType})`));
  out.push(...bytes(ESC, 0x45, 0));
  out.push(0x0a);
  if (order.unpaidNotice) {
    out.push(...bytes(ESC, 0x61, 1));
    out.push(...bytes(ESC, 0x45, 1));
    out.push(...text(order.unpaidNotice));
    out.push(...bytes(ESC, 0x45, 0));
    out.push(0x0a);
    out.push(...bytes(ESC, 0x61, 0));
  }
  if (order.footer) {
    out.push(0x0a);
    out.push(...bytes(ESC, 0x61, 1));
    out.push(...text(order.footer));
    out.push(0x0a);
  }
  out.push(0x0a, 0x0a);
  out.push(...bytes(GS, 0x56, 0x00)); // GS V 0 - full cut

  return new Uint8Array(out);
}

// ESC p 0 25 250 - drawer kick-out (see escpos.rs's kick_cash_drawer for the same bytes/reasoning).
const KICK_DRAWER_BYTES = new Uint8Array([ESC, 0x70, 0x00, 25, 250]);

async function writeToSerialPort(target: { path: string; baudRate: number }, data: Uint8Array): Promise<void> {
  const port = new SerialPort({ path: target.path, baudRate: target.baudRate });
  try {
    await port.open();
    await port.writeBinary(data);
  } finally {
    await port.close().catch(() => undefined);
  }
}

/**
 * Never throws in a way that should block a sale - a printer being off,
 * unreachable, or unconfigured must not prevent a completed sale from
 * being recorded (spec's whole offline-first premise would be undermined
 * by making the source of truth depend on a peripheral). Callers should
 * treat a rejected promise here as a warning, not a failure.
 */
export async function printReceipt(order: ReceiptInput): Promise<void> {
  const target = getPrinterSettings();
  if (!target) {
    throw new Error('No printer configured');
  }
  if (target.kind === 'usb') {
    await writeToSerialPort(target, buildReceiptBytes(order));
    return;
  }
  await invoke('print_receipt', {
    printerHost: target.host,
    printerPort: target.port,
    storeName: order.storeName,
    orderId: order.orderId,
    lines: order.lines,
    taxTotal: order.taxTotal,
    total: order.total,
    tenderType: order.tenderType,
    header: order.header ?? null,
    footer: order.footer ?? null,
    unpaidNotice: order.unpaidNotice ?? null,
  });
}

export async function kickCashDrawer(): Promise<void> {
  const target = getPrinterSettings();
  if (!target) {
    throw new Error('No printer configured');
  }
  if (target.kind === 'usb') {
    await writeToSerialPort(target, KICK_DRAWER_BYTES);
    return;
  }
  await invoke('kick_cash_drawer', { printerHost: target.host, printerPort: target.port });
}
