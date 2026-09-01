import ExcelJS from 'exceljs';

// Bulk inventory import/export. One column schema drives both directions
// (buildTemplateWorkbook / parseInventoryWorkbook) so the template a tenant
// downloads is always exactly what the parser accepts - no drift between
// "what we tell them to fill in" and "what we actually read."
export interface InventoryColumn {
  header: string;
  key:
    | 'sku'
    | 'barcode'
    | 'name'
    | 'category'
    | 'costPrice'
    | 'sellPrice'
    | 'taxRate'
    | 'reorderPoint'
    | 'maxDiscountAmount'
    | 'active'
    | 'openingStock'
    | 'parentSku'
    | 'variantLabel';
  required: boolean;
  type: 'string' | 'number';
  example: string | number;
}

// Column headers/examples are deliberately industry-neutral (no currency
// symbol, no hardware-specific examples baked into the schema itself) - this
// import is meant to work for any retail or service business selling
// physical stock, not just hardware stores.
//
// Parent SKU/Variant Label are how one flat sheet represents a product with
// variants - blank Parent SKU means "this row is its own product" (the
// original, still-supported shape); a filled Parent SKU means "this row is
// one variant of the product with that SKU" (either created earlier in this
// same file, or already existing in the catalog), same "one row per shared
// key" convention Shopify's own product CSV import uses.
export const INVENTORY_COLUMNS: InventoryColumn[] = [
  // SKU/Barcode are optional on both product and variant rows - a blank
  // one is auto-generated (unique per tenant) by the same Products
  // collection hook that backs the dashboard's product dialog, which
  // doesn't show these fields at all any more.
  { header: 'SKU', key: 'sku', required: false, type: 'string', example: 'SKU-001' },
  { header: 'Parent SKU', key: 'parentSku', required: false, type: 'string', example: '' },
  { header: 'Variant Label', key: 'variantLabel', required: false, type: 'string', example: '' },
  { header: 'Barcode', key: 'barcode', required: false, type: 'string', example: '6001234567890' },
  { header: 'Name', key: 'name', required: true, type: 'string', example: 'Sample Product' },
  { header: 'Category', key: 'category', required: false, type: 'string', example: 'General' },
  { header: 'Cost Price', key: 'costPrice', required: true, type: 'number', example: 450 },
  { header: 'Sell Price', key: 'sellPrice', required: true, type: 'number', example: 799 },
  { header: 'Tax Rate', key: 'taxRate', required: false, type: 'number', example: 0 },
  { header: 'Reorder Point', key: 'reorderPoint', required: false, type: 'number', example: 5 },
  { header: 'Max Discount', key: 'maxDiscountAmount', required: false, type: 'number', example: 0 },
  { header: 'Active (Yes/No)', key: 'active', required: false, type: 'string', example: 'Yes' },
  { header: 'Opening Stock', key: 'openingStock', required: false, type: 'number', example: 25 },
];

export interface ParsedProductRow {
  rowNumber: number;
  kind: 'product';
  sku: string;
  barcode: string | null;
  name: string;
  category: string | null;
  costPrice: number;
  sellPrice: number;
  taxRate: number;
  reorderPoint: number;
  maxDiscountAmount: number;
  isActive: boolean;
  openingStock: number;
}

export interface ParsedVariantRow {
  rowNumber: number;
  kind: 'variant';
  parentSku: string;
  sku: string;
  barcode: string | null;
  label: string;
  // null = inherit the parent product's own price, same meaning as leaving
  // the field blank in the dashboard's variant editor.
  costPrice: number | null;
  sellPrice: number | null;
  openingStock: number;
}

export type ParsedInventoryRow = ParsedProductRow | ParsedVariantRow;

export interface InventoryRowError {
  rowNumber: number;
  message: string;
}

export interface ParsedInventoryWorkbook {
  rows: ParsedInventoryRow[];
  errors: InventoryRowError[];
}

// Bundles still stay a manual follow-up in the dashboard - Products.
// bundleComponents is its own nested structure that doesn't map onto a flat
// spreadsheet row any more cleanly than variants would have without the
// Parent SKU convention above, and bundles are rare enough not to warrant
// inventing one.
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
        c.key === 'sku'
          ? 'SKU-002'
          : c.key === 'name'
            ? 'Another Sample Product'
            : c.key === 'category'
              ? 'Accessories'
              : c.example,
      ]),
    ),
  );
  // A third example row demonstrating the variant convention: Parent SKU
  // points back at row 2 (SKU-001), so this becomes a variant of that
  // product rather than a standalone one - Cost/Sell Price are left blank
  // here on purpose to show "inherit the parent's price."
  sheet.addRow({
    sku: 'SKU-001-RED-L',
    parentSku: 'SKU-001',
    variantLabel: 'Red / L',
    barcode: '',
    name: '',
    category: '',
    costPrice: '',
    sellPrice: '',
    taxRate: '',
    reorderPoint: '',
    maxDiscountAmount: '',
    active: '',
    openingStock: 10,
  });

  const instructions = workbook.addWorksheet('Instructions');
  instructions.columns = [{ width: 90 }];
  instructions.addRows([
    ['Bulk product import - how to fill this in'],
    [''],
    ['1. Fill in the "Products" sheet, one row per product (or per variant - see #10). Delete the example rows first.'],
    ['2. Required columns for a standalone product: Name, Cost Price, Sell Price.'],
    ['3. SKU and Barcode are both optional - leave either blank and a unique one is generated automatically. If you do set a SKU, it must be unique within your business; a row whose SKU already exists is skipped, not overwritten.'],
    ['4. Tax Rate is a decimal, not a percentage - e.g. 16% is 0.16. Leave blank to default to 0 (no tax).'],
    ['5. Reorder Point triggers the low-stock alert once on-hand quantity drops to or below it. Leave blank to default to 0.'],
    ['6. Max Discount is a flat amount, not a percentage - how much a cashier may knock off this product per unit at the till. Leave blank or 0 to disallow discounts entirely - this is the default unless you state otherwise.'],
    ['7. Active (Yes/No) - leave blank or Yes for a normal product. Set to No to import it already archived (hidden from the Sell page and Products list, but still on record).'],
    ['8. Opening Stock creates one initial stock movement per product (or per variant) for the store you pick when uploading. Leave blank or 0 for none.'],
    ['9. This template only supports simple products and variants - add bundles or related-product links afterward in the dashboard.'],
    ['10. To add variants (e.g. sizes or colors), fill Parent SKU with an existing product\'s SKU (either from an earlier row in this file, or already in your catalog) and Variant Label with the option name (e.g. "Red / L"). SKU on that row becomes the variant\'s own SKU, or is auto-generated if left blank. Cost Price/Sell Price can be left blank on a variant row to use the parent product\'s price, or filled in if that option costs/sells differently. Note: if you want to add variants to a product within this same file, give that product row an explicit SKU so you have something to put in Parent SKU - an auto-generated one can\'t be referenced since you won\'t know it in advance.'],
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

    const parentSku = values.parentSku ? String(values.parentSku).trim() : '';

    if (parentSku) {
      // Variant row - Name/Category/Tax Rate/Reorder Point/Max Discount/
      // Active don't apply per-variant in the schema (Products.variants
      // only carries label/sku/barcode/price), so they're simply ignored
      // here rather than erroring on an unused column.
      const variantLabel = values.variantLabel ? String(values.variantLabel).trim() : '';
      if (!variantLabel) {
        errors.push({ rowNumber, message: 'Variant rows (with a Parent SKU) need a Variant Label' });
        return;
      }
      const costPrice = values.costPrice != null ? Number(values.costPrice) : null;
      const sellPrice = values.sellPrice != null ? Number(values.sellPrice) : null;
      if ((costPrice != null && !Number.isFinite(costPrice)) || (sellPrice != null && !Number.isFinite(sellPrice))) {
        errors.push({ rowNumber, message: 'Cost Price and Sell Price must be numbers when set' });
        return;
      }
      rows.push({
        rowNumber,
        kind: 'variant',
        parentSku,
        // Blank means "generate one" - handled by the same Products
        // collection hook the dashboard's product dialog relies on.
        sku: values.sku ? String(values.sku) : '',
        barcode: values.barcode ? String(values.barcode) : null,
        label: variantLabel,
        costPrice,
        sellPrice,
        openingStock: values.openingStock != null && Number.isFinite(Number(values.openingStock)) ? Number(values.openingStock) : 0,
      });
      return;
    }

    const missing = INVENTORY_COLUMNS.filter(
      (c) => c.required && c.key !== 'parentSku' && c.key !== 'variantLabel' && !values[c.key],
    ).map((c) => c.header);
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
      kind: 'product',
      // Blank means "generate one" - handled by the same Products
      // collection hook the dashboard's product dialog relies on.
      sku: values.sku ? String(values.sku) : '',
      barcode: values.barcode ? String(values.barcode) : null,
      name: String(values.name),
      category: values.category ? String(values.category) : null,
      costPrice,
      sellPrice,
      taxRate: values.taxRate != null && Number.isFinite(Number(values.taxRate)) ? Number(values.taxRate) : 0,
      reorderPoint: values.reorderPoint != null && Number.isFinite(Number(values.reorderPoint)) ? Number(values.reorderPoint) : 0,
      // No discount unless the sheet explicitly says otherwise - matches
      // the Products collection's own maxDiscountAmount default of 0.
      maxDiscountAmount:
        values.maxDiscountAmount != null && Number.isFinite(Number(values.maxDiscountAmount))
          ? Math.max(0, Number(values.maxDiscountAmount))
          : 0,
      // Blank/missing defaults to active - only an explicit "No" archives
      // an imported row, so a template with no Active column at all (an
      // older download) still imports every row as active, unchanged.
      isActive: String(values.active ?? '').trim().toLowerCase() !== 'no',
      openingStock: values.openingStock != null && Number.isFinite(Number(values.openingStock)) ? Number(values.openingStock) : 0,
    });
  });

  return { rows, errors };
}
