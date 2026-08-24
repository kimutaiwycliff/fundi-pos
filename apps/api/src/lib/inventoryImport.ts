import ExcelJS from 'exceljs';

// Bulk inventory import/export. One column schema drives both directions
// (buildTemplateWorkbook / parseInventoryWorkbook) so the template a tenant
// downloads is always exactly what the parser accepts - no drift between
// "what we tell them to fill in" and "what we actually read."
export interface InventoryColumn {
  header: string;
  key: 'sku' | 'barcode' | 'name' | 'category' | 'costPrice' | 'sellPrice' | 'taxRate' | 'reorderPoint' | 'openingStock';
  required: boolean;
  type: 'string' | 'number';
  example: string | number;
}

export const INVENTORY_COLUMNS: InventoryColumn[] = [
  { header: 'SKU', key: 'sku', required: true, type: 'string', example: 'HW-HAMMER-01' },
  { header: 'Barcode', key: 'barcode', required: false, type: 'string', example: '6001234567890' },
  { header: 'Name', key: 'name', required: true, type: 'string', example: 'Claw Hammer 16oz' },
  { header: 'Category', key: 'category', required: false, type: 'string', example: 'Hand Tools' },
  { header: 'Cost Price (KES)', key: 'costPrice', required: true, type: 'number', example: 450 },
  { header: 'Sell Price (KES)', key: 'sellPrice', required: true, type: 'number', example: 799 },
  { header: 'Tax Rate', key: 'taxRate', required: false, type: 'number', example: 0.16 },
  { header: 'Reorder Point', key: 'reorderPoint', required: false, type: 'number', example: 5 },
  { header: 'Opening Stock', key: 'openingStock', required: false, type: 'number', example: 25 },
];

export interface ParsedInventoryRow {
  rowNumber: number;
  sku: string;
  barcode: string | null;
  name: string;
  category: string | null;
  costPrice: number;
  sellPrice: number;
  taxRate: number;
  reorderPoint: number;
  openingStock: number;
}

export interface InventoryRowError {
  rowNumber: number;
  message: string;
}

export interface ParsedInventoryWorkbook {
  rows: ParsedInventoryRow[];
  errors: InventoryRowError[];
}

// Only variant-free, non-bundle products are in scope here - a flat product
// list is what a bulk import realistically looks like; variants/bundles
// stay a manual follow-up in the dashboard (Products.variants/
// bundleComponents are nested array structures that don't map cleanly onto
// flat spreadsheet rows without a much more complex template).
export function buildTemplateWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet('Products');
  sheet.columns = INVENTORY_COLUMNS.map((col) => ({ header: col.header, key: col.key, width: 20 }));
  sheet.getRow(1).font = { bold: true };
  sheet.addRow(Object.fromEntries(INVENTORY_COLUMNS.map((c) => [c.key, c.example])));
  sheet.addRow(
    Object.fromEntries(
      INVENTORY_COLUMNS.map((c) => [
        c.key,
        c.key === 'sku' ? 'HW-PAINT-5L' : c.key === 'name' ? 'Emulsion Paint 5L - White' : c.key === 'category' ? 'Paint' : c.example,
      ]),
    ),
  );

  const instructions = workbook.addWorksheet('Instructions');
  instructions.columns = [{ width: 90 }];
  instructions.addRows([
    ['Bulk product import - how to fill this in'],
    [''],
    ['1. Fill in the "Products" sheet, one row per product. Delete the two example rows first.'],
    ['2. Required columns: SKU, Name, Cost Price (KES), Sell Price (KES).'],
    ['3. SKU must be unique within your business - a row whose SKU already exists is skipped, not overwritten.'],
    ['4. Tax Rate is a decimal, not a percentage - 16% VAT is 0.16. Leave blank to default to 0.16.'],
    ['5. Reorder Point triggers the low-stock alert once on-hand quantity drops to or below it. Leave blank to default to 0.'],
    ['6. Opening Stock creates one initial stock movement per product for the store you pick when uploading. Leave blank or 0 for none.'],
    ['7. This template only supports simple products - add variants or bundles afterward in the dashboard.'],
  ]);
  instructions.getRow(1).font = { bold: true, size: 14 };

  return workbook;
}

function readCell(row: ExcelJS.Row, columnIndex: number): string | number | null {
  const cell = row.getCell(columnIndex + 1);
  const value = cell.value;
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object' && 'result' in value) return (value as { result: string | number }).result;
  return value as string | number;
}

export async function parseInventoryWorkbook(buffer: Buffer): Promise<ParsedInventoryWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet('Products') ?? workbook.worksheets[0];
  if (!sheet) {
    return { rows: [], errors: [{ rowNumber: 0, message: 'No worksheet found in the uploaded file' }] };
  }

  const headerRow = sheet.getRow(1);
  const columnOrder = INVENTORY_COLUMNS.map((col) => {
    let foundIndex = -1;
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (String(cell.value).trim().toLowerCase() === col.header.toLowerCase()) foundIndex = colNumber - 1;
    });
    return foundIndex;
  });

  const rows: ParsedInventoryRow[] = [];
  const errors: InventoryRowError[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header

    const values = Object.fromEntries(
      INVENTORY_COLUMNS.map((col, i) => [col.key, columnOrder[i] >= 0 ? readCell(row, columnOrder[i]) : null]),
    ) as Record<InventoryColumn['key'], string | number | null>;

    if (Object.values(values).every((v) => v === null)) return; // fully blank row - skip silently

    const missing = INVENTORY_COLUMNS.filter((c) => c.required && !values[c.key]).map((c) => c.header);
    if (missing.length > 0) {
      errors.push({ rowNumber, message: `Missing required value(s): ${missing.join(', ')}` });
      return;
    }

    const costPrice = Number(values.costPrice);
    const sellPrice = Number(values.sellPrice);
    if (!Number.isFinite(costPrice) || !Number.isFinite(sellPrice)) {
      errors.push({ rowNumber, message: 'Cost Price and Sell Price must be numbers' });
      return;
    }

    rows.push({
      rowNumber,
      sku: String(values.sku),
      barcode: values.barcode ? String(values.barcode) : null,
      name: String(values.name),
      category: values.category ? String(values.category) : null,
      costPrice,
      sellPrice,
      taxRate: values.taxRate != null && Number.isFinite(Number(values.taxRate)) ? Number(values.taxRate) : 0.16,
      reorderPoint: values.reorderPoint != null && Number.isFinite(Number(values.reorderPoint)) ? Number(values.reorderPoint) : 0,
      openingStock: values.openingStock != null && Number.isFinite(Number(values.openingStock)) ? Number(values.openingStock) : 0,
    });
  });

  return { rows, errors };
}
