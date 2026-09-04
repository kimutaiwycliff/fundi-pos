import type { ReceiptOrderData, ReceiptTenantInfo } from './receiptHtml';

// A real A4 invoice, distinct from receiptHtml.ts's 280px thermal-receipt
// template - the WhatsApp "invoice" was, until now, literally that same
// thermal template rasterized to PDF, which is why it looked like a receipt.
// Reuses ReceiptOrderData/ReceiptTenantInfo unchanged (same data already
// flows through SalesScreen.tsx) - only the presentation differs.
// expo-print's Print.printToFileAsync honors @page CSS for page sizing, so
// no new dependency is needed to get real A4 output.

const TENDER_LABEL: Record<string, string> = {
  cash: 'Cash',
  mpesa: 'M-Pesa',
  credit: 'Credit (pay later)',
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildInvoiceHtml(data: ReceiptOrderData, tenant: ReceiptTenantInfo): string {
  const invoiceNumber = data.orderId.slice(0, 8).toUpperCase();
  const subtotal = data.total - data.taxTotal + data.discountTotal;

  const rows = data.lines
    .map(
      (line, i) => `<tr class="${i % 2 === 1 ? 'alt' : ''}">
        <td>${escapeHtml(line.label)}</td>
        <td class="num">${line.quantity}</td>
        <td class="num">${(line.lineTotal / line.quantity).toFixed(2)}</td>
        <td class="num">${line.lineTotal.toFixed(2)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Invoice ${invoiceNumber}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Helvetica, Arial, sans-serif;
    max-width: 210mm;
    margin: 0 auto;
    padding: 0;
    font-size: 11pt;
    color: #1a1a1a;
    line-height: 1.5;
  }
  .letterhead {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid #df5102;
    padding-bottom: 16px;
    margin-bottom: 28px;
  }
  .business-name { font-size: 20pt; font-weight: 700; color: #16100e; }
  .business-meta { margin-top: 4px; font-size: 9.5pt; color: #555; white-space: pre-wrap; max-width: 320px; }
  .invoice-title { text-align: right; }
  .invoice-title h1 { margin: 0; font-size: 22pt; letter-spacing: 2px; color: #df5102; font-weight: 700; }
  .invoice-meta { margin-top: 6px; font-size: 9.5pt; color: #555; }
  .invoice-meta div { margin-top: 2px; }
  .invoice-meta .label { color: #888; display: inline-block; width: 90px; }

  .parties { display: flex; justify-content: space-between; margin-bottom: 28px; gap: 24px; }
  .party h3 { margin: 0 0 6px; font-size: 8.5pt; letter-spacing: 1px; text-transform: uppercase; color: #888; font-weight: 600; }
  .party .name { font-size: 12pt; font-weight: 600; color: #16100e; }
  .party .line { font-size: 10pt; color: #444; margin-top: 2px; }

  table.items { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.items th {
    text-align: left;
    font-size: 8.5pt;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: #888;
    font-weight: 600;
    padding: 8px 10px;
    border-bottom: 2px solid #ddd;
  }
  table.items td { padding: 9px 10px; font-size: 10.5pt; border-bottom: 1px solid #eee; }
  table.items tr.alt td { background: #faf8f7; }
  table.items th.num, table.items td.num { text-align: right; }

  .totals-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
  .totals { width: 260px; }
  .totals .row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 10.5pt; color: #444; }
  .totals .row.grand { border-top: 2px solid #16100e; margin-top: 6px; padding-top: 10px; font-size: 13pt; font-weight: 700; color: #16100e; }

  .banner {
    margin: 20px 0;
    border: 1.5px solid #b45309;
    background: #fff8ec;
    color: #b45309;
    padding: 10px 14px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 10pt;
  }

  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; font-size: 9.5pt; color: #777; white-space: pre-wrap; }
</style>
</head>
<body>
  <div class="letterhead">
    <div>
      <div class="business-name">${escapeHtml(tenant.name)}</div>
      ${tenant.receiptHeader ? `<div class="business-meta">${escapeHtml(tenant.receiptHeader)}</div>` : ''}
    </div>
    <div class="invoice-title">
      <h1>INVOICE</h1>
      <div class="invoice-meta">
        <div><span class="label">Invoice #</span>${invoiceNumber}</div>
        <div><span class="label">Date</span>${escapeHtml(data.createdAtLabel)}</div>
        ${data.terminalLabel ? `<div><span class="label">Terminal</span>${escapeHtml(data.terminalLabel)}</div>` : ''}
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Billed to</h3>
      <div class="name">${data.customerLabel ? escapeHtml(data.customerLabel) : 'Walk-in customer'}</div>
    </div>
    <div class="party" style="text-align: right;">
      <h3>Served by</h3>
      <div class="line">${escapeHtml(data.cashierLabel)}</div>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>Item</th>
        <th class="num">Qty</th>
        <th class="num">Unit price</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  ${data.isUnpaidCredit ? '<div class="banner">This invoice is UNPAID &mdash; please settle on the agreed date.</div>' : ''}

  <div class="totals-wrap">
    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
      <div class="row"><span>Tax</span><span>${data.taxTotal.toFixed(2)}</span></div>
      ${data.discountTotal > 0 ? `<div class="row"><span>Discount</span><span>-${data.discountTotal.toFixed(2)}</span></div>` : ''}
      <div class="row"><span>Payment method</span><span>${TENDER_LABEL[data.tenderType] ?? data.tenderType}</span></div>
      <div class="row grand"><span>Total due</span><span>${data.total.toFixed(2)}</span></div>
    </div>
  </div>

  ${tenant.receiptFooter ? `<div class="footer">${escapeHtml(tenant.receiptFooter)}</div>` : ''}
</body>
</html>`;
}
