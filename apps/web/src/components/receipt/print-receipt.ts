import { TENDER_LABEL, type ReceiptData, type TenantReceiptInfo } from './types';
import { formatDateTime } from '@/lib/format-date';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildReceiptHtml(data: ReceiptData, tenant: TenantReceiptInfo): string {
  const lineRows = data.lines
    .map(
      (line) =>
        `<div class="line"><span>${escapeHtml(line.label)} x${line.quantity}</span><span>${line.lineTotal.toFixed(2)}</span></div>`,
    )
    .join('');

  return `<!doctype html>
<html>
<head>
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
  .settled { text-align: center; color: #555; margin: 8px 0; }
  .totals .line { margin-top: 2px; }
  .totals .grand { font-weight: bold; font-size: 13px; }
  .footer { margin-top: 10px; white-space: pre-wrap; text-align: center; }
  @media print {
    body { width: 100%; }
  }
</style>
</head>
<body>
  <div class="center bold">${escapeHtml(tenant.name)}</div>
  ${tenant.receiptHeader ? `<div class="center">${escapeHtml(tenant.receiptHeader)}</div>` : ''}
  <div class="divider"></div>
  <div class="line"><span>Order #${data.orderId.slice(0, 8)}</span><span>${formatDateTime(data.createdAt)}</span></div>
  <div class="line"><span>Cashier</span><span>${escapeHtml(data.cashierLabel)}</span></div>
  ${data.customerLabel ? `<div class="line"><span>Customer</span><span>${escapeHtml(data.customerLabel)}</span></div>` : ''}
  <div class="divider"></div>
  ${lineRows}
  <div class="divider"></div>
  ${
    data.isUnpaidCredit
      ? '<div class="banner">UNPAID &mdash; pay on settlement</div>'
      : data.isSettledCredit && data.settledAtLabel
        ? `<div class="settled">Settled ${escapeHtml(data.settledAtLabel)}</div>`
        : ''
  }
  <div class="totals">
    <div class="line"><span>Tax</span><span>${data.taxTotal.toFixed(2)}</span></div>
    ${data.discountTotal > 0 ? `<div class="line"><span>Discount</span><span>-${data.discountTotal.toFixed(2)}</span></div>` : ''}
    <div class="line grand"><span>Total</span><span>${data.total.toFixed(2)}</span></div>
    <div class="line"><span>Tender</span><span>${TENDER_LABEL[data.tenderType]}</span></div>
  </div>
  ${tenant.receiptFooter ? `<div class="footer">${escapeHtml(tenant.receiptFooter)}</div>` : ''}
</body>
</html>`;
}

// Opens a popup window with a print-optimized receipt and triggers the
// browser's print dialog - the web POS's substitute for desktop's raw
// ESC/POS printing (no cash-drawer kick, no direct thermal-printer socket;
// see the plan's locked decision on browser-print-only for v1).
export function printReceipt(data: ReceiptData, tenant: TenantReceiptInfo): boolean {
  const win = window.open('', '_blank', 'width=380,height=600');
  if (!win) return false;

  const html = buildReceiptHtml(data, tenant);
  win.document.open();
  win.document.write(html);
  win.document.close();

  // The print dialog needs the document fully painted first - onload fires
  // once the write()'d document (and its inline styles) settle, which is
  // more reliable here than calling print() immediately.
  win.onload = () => {
    win.focus();
    win.print();
  };

  return true;
}
