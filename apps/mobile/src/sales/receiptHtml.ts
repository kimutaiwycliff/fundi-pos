// Mirrors apps/web/src/components/receipt/print-receipt.ts's buildReceiptHtml
// almost exactly (same sections, same thermal-receipt-width styling) so a
// reprint looks the same whether it came from the web dashboard or this
// till - deliberately duplicated rather than shared from business-logic,
// same as this app's other ports (see connector.ts, SellScreen.tsx): a
// small, self-contained HTML template isn't worth a cross-app package for.
//
// expo-print's Print.printAsync({ html }) is this app's equivalent of the
// web version's `window.open() + win.print()` - it hands the same kind of
// print-ready HTML to Android's native print dialog, which itself offers
// "Save as PDF" and any paired/registered printer (including most Wi-Fi/
// Bluetooth receipt printers exposed as an Android print service). There is
// no raw ESC/POS socket printing here, matching the web POS's own locked
// "browser-print-only" decision - desktop's printer.ts is the only place
// that talks a real printer protocol directly, over a wired network socket
// a phone has no equivalent of.
export interface ReceiptTenantInfo {
  name: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
}

export interface ReceiptLineData {
  label: string;
  quantity: number;
  lineTotal: number;
}

export interface ReceiptOrderData {
  orderId: string;
  createdAtLabel: string;
  cashierLabel: string;
  customerLabel: string | null;
  terminalLabel: string | null;
  lines: ReceiptLineData[];
  taxTotal: number;
  discountTotal: number;
  total: number;
  tenderType: string;
  isUnpaidCredit: boolean;
}

const TENDER_LABEL: Record<string, string> = {
  cash: 'Cash',
  mpesa: 'M-Pesa',
  credit: 'Credit (pay later)',
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildReceiptHtml(data: ReceiptOrderData, tenant: ReceiptTenantInfo): string {
  const lineRows = data.lines
    .map((line) => `<div class="line"><span>${escapeHtml(line.label)} x${line.quantity}</span><span>${line.lineTotal.toFixed(2)}</span></div>`)
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt ${data.orderId.slice(0, 8)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Courier New", Courier, monospace;
    width: 280px;
    margin: 0 auto;
    padding: 12px;
    font-size: 12px;
    color: #000;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .divider { border-top: 1px dashed #000; margin: 8px 0; }
  .line { display: flex; justify-content: space-between; gap: 8px; }
  .banner {
    border: 2px solid #b45309;
    color: #b45309;
    padding: 6px;
    text-align: center;
    font-weight: bold;
    margin: 8px 0;
  }
  .totals .line { margin-top: 2px; }
  .totals .grand { font-weight: bold; font-size: 13px; }
  .footer { margin-top: 10px; white-space: pre-wrap; text-align: center; }
</style>
</head>
<body>
  <div class="center bold">${escapeHtml(tenant.name)}</div>
  ${tenant.receiptHeader ? `<div class="center">${escapeHtml(tenant.receiptHeader)}</div>` : ''}
  <div class="divider"></div>
  <div class="line"><span>Order #${data.orderId.slice(0, 8)}</span><span>${escapeHtml(data.createdAtLabel)}</span></div>
  <div class="line"><span>Cashier</span><span>${escapeHtml(data.cashierLabel)}</span></div>
  ${data.customerLabel ? `<div class="line"><span>Customer</span><span>${escapeHtml(data.customerLabel)}</span></div>` : ''}
  ${data.terminalLabel ? `<div class="line"><span>Terminal</span><span>${escapeHtml(data.terminalLabel)}</span></div>` : ''}
  <div class="divider"></div>
  ${lineRows}
  <div class="divider"></div>
  ${data.isUnpaidCredit ? '<div class="banner">UNPAID &mdash; pay on settlement</div>' : ''}
  <div class="totals">
    <div class="line"><span>Tax</span><span>${data.taxTotal.toFixed(2)}</span></div>
    ${data.discountTotal > 0 ? `<div class="line"><span>Discount</span><span>-${data.discountTotal.toFixed(2)}</span></div>` : ''}
    <div class="line grand"><span>Total</span><span>${data.total.toFixed(2)}</span></div>
    <div class="line"><span>Tender</span><span>${TENDER_LABEL[data.tenderType] ?? data.tenderType}</span></div>
  </div>
  ${tenant.receiptFooter ? `<div class="footer">${escapeHtml(tenant.receiptFooter)}</div>` : ''}
</body>
</html>`;
}
