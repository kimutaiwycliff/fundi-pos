import { invoke } from '@tauri-apps/api/core';

// UNVERIFIED against real hardware - no printer available in this
// environment (see src-tauri/src/escpos.rs's module doc for what IS
// verified: the exact ESC/POS byte sequences, checked against the
// documented command set). Printer connection details are a per-till
// setting, not app config - stored in localStorage, editable from the
// till UI (see PrinterSettings.tsx).
const HOST_KEY = 'hardware-pos-printer-host';
const PORT_KEY = 'hardware-pos-printer-port';

export function getPrinterSettings(): { host: string; port: number } | null {
  const host = localStorage.getItem(HOST_KEY);
  const port = localStorage.getItem(PORT_KEY);
  if (!host || !port) return null;
  return { host, port: Number(port) };
}

export function setPrinterSettings(host: string, port: number): void {
  localStorage.setItem(HOST_KEY, host);
  localStorage.setItem(PORT_KEY, String(port));
}

export interface PrintableLine {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/**
 * Never throws in a way that should block a sale - a printer being off,
 * unreachable, or unconfigured must not prevent a completed sale from
 * being recorded (spec's whole offline-first premise would be undermined
 * by making the source of truth depend on a peripheral). Callers should
 * treat a rejected promise here as a warning, not a failure.
 */
export async function printReceipt(order: {
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
}): Promise<void> {
  const settings = getPrinterSettings();
  if (!settings) {
    throw new Error('No printer configured');
  }
  await invoke('print_receipt', {
    printerHost: settings.host,
    printerPort: settings.port,
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
  const settings = getPrinterSettings();
  if (!settings) {
    throw new Error('No printer configured');
  }
  await invoke('kick_cash_drawer', { printerHost: settings.host, printerPort: settings.port });
}
