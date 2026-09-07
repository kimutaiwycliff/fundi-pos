// Mirrors sales/invoiceHtml.ts's A4 letterhead/table/totals structure
// exactly (same brand colors, same @page sizing via expo-print's
// printToFileAsync), adapted for restock line items instead of sale line
// items - same reasoning as web's restock-document.ts.

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface RestockListLine {
  productName: string;
  variantLabel: string | null;
  quantity: number;
  unitCost: number | null;
}

export interface RestockListData {
  poNumber: string;
  storeName: string;
  supplierName: string;
  createdAtLabel: string;
  lines: RestockListLine[];
  estimatedTotal: number | null;
}

export function buildRestockListHtml(data: RestockListData, tenant: { name: string }): string {
  const showCost = data.lines.some((l) => l.unitCost !== null);

  const rows = data.lines
    .map((line, i) => {
      const label = line.variantLabel ? `${line.productName} - ${line.variantLabel}` : line.productName;
      const lineTotal = line.unitCost !== null ? line.unitCost * line.quantity : null;
      return `<tr class="${i % 2 === 1 ? 'alt' : ''}">
        <td>${escapeHtml(label)}</td>
        <td class="num">${line.quantity}</td>
        ${showCost ? `<td class="num">${line.unitCost !== null ? line.unitCost.toFixed(2) : '-'}</td>` : ''}
        ${showCost ? `<td class="num">${lineTotal !== null ? lineTotal.toFixed(2) : '-'}</td>` : ''}
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Restock list ${data.poNumber}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; max-width: 210mm; margin: 0 auto; padding: 0; font-size: 11pt; color: #1a1a1a; line-height: 1.5; }
  .letterhead { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #df5102; padding-bottom: 16px; margin-bottom: 28px; }
  .business-name { font-size: 20pt; font-weight: 700; color: #16100e; }
  .doc-title { text-align: right; }
  .doc-title h1 { margin: 0; font-size: 20pt; letter-spacing: 2px; color: #df5102; font-weight: 700; }
  .doc-meta { margin-top: 6px; font-size: 9.5pt; color: #555; }
  .doc-meta div { margin-top: 2px; }
  .doc-meta .label { color: #888; display: inline-block; width: 100px; }
  .parties { display: flex; justify-content: space-between; margin-bottom: 28px; gap: 24px; }
  .party h3 { margin: 0 0 6px; font-size: 8.5pt; letter-spacing: 1px; text-transform: uppercase; color: #888; font-weight: 600; }
  .party .name { font-size: 12pt; font-weight: 600; color: #16100e; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.items th { text-align: left; font-size: 8.5pt; letter-spacing: 0.5px; text-transform: uppercase; color: #888; font-weight: 600; padding: 8px 10px; border-bottom: 2px solid #ddd; }
  table.items td { padding: 9px 10px; font-size: 10.5pt; border-bottom: 1px solid #eee; }
  table.items tr.alt td { background: #faf8f7; }
  table.items th.num, table.items td.num { text-align: right; }
  .totals-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
  .totals { width: 260px; }
  .totals .row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 10.5pt; color: #444; }
  .totals .row.grand { border-top: 2px solid #16100e; margin-top: 6px; padding-top: 10px; font-size: 13pt; font-weight: 700; color: #16100e; }
  .note { margin-top: 20px; font-size: 9pt; color: #888; }
</style>
</head>
<body>
  <div class="letterhead">
    <div class="business-name">${escapeHtml(tenant.name)}</div>
    <div class="doc-title">
      <h1>RESTOCK LIST</h1>
      <div class="doc-meta">
        <div><span class="label">Reference</span>${escapeHtml(data.poNumber)}</div>
        <div><span class="label">Date</span>${escapeHtml(data.createdAtLabel)}</div>
      </div>
    </div>
  </div>
  <div class="parties">
    <div class="party"><h3>Store</h3><div class="name">${escapeHtml(data.storeName)}</div></div>
    <div class="party" style="text-align: right;"><h3>Supplier</h3><div class="name">${escapeHtml(data.supplierName)}</div></div>
  </div>
  <table class="items">
    <thead>
      <tr>
        <th>Item</th>
        <th class="num">Qty</th>
        ${showCost ? '<th class="num">Est. unit cost</th>' : ''}
        ${showCost ? '<th class="num">Est. line total</th>' : ''}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  ${
    data.estimatedTotal !== null
      ? `<div class="totals-wrap"><div class="totals"><div class="row grand"><span>Estimated total</span><span>${data.estimatedTotal.toFixed(2)}</span></div></div></div>`
      : ''
  }
  <p class="note">Estimated total is based on the last recorded cost price per item, not a confirmed supplier invoice.</p>
</body>
</html>`;
}
