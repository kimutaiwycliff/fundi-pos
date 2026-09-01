import { describe, expect, it } from 'vitest';
import { buildTemplateWorkbook, parseInventoryWorkbook, type ParsedProductRow } from '../lib/inventoryImport.ts';

describe('buildTemplateWorkbook + parseInventoryWorkbook round-trip', () => {
  it('parses its own generated template back into the two products and one variant', async () => {
    const workbook = buildTemplateWorkbook();
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const { rows, errors } = await parseInventoryWorkbook(buffer);

    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: 'product', sku: 'SKU-001', name: 'Sample Product', costPrice: 450, sellPrice: 799 });
    expect(rows[1]).toMatchObject({ kind: 'product', sku: 'SKU-002', name: 'Another Sample Product' });
    expect(rows[2]).toMatchObject({ kind: 'variant', parentSku: 'SKU-001', sku: 'SKU-001-RED-L', label: 'Red / L' });
  });
});

describe('parseInventoryWorkbook validation', () => {
  it('reports a row missing a required column instead of silently dropping it', async () => {
    const workbook = buildTemplateWorkbook();
    const sheet = workbook.getWorksheet('Products')!;
    sheet.addRow({ sku: 'HW-NO-PRICE', name: 'Missing prices' }); // no costPrice/sellPrice

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const { rows, errors } = await parseInventoryWorkbook(buffer);

    expect(rows).toHaveLength(3); // the two products + one variant from the template itself
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Cost Price');
  });

  it('rejects non-numeric prices with a clear per-row error', async () => {
    const workbook = buildTemplateWorkbook();
    const sheet = workbook.getWorksheet('Products')!;
    sheet.addRow({ sku: 'HW-BAD-PRICE', name: 'Bad price', costPrice: 'not-a-number', sellPrice: 100 });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const { errors } = await parseInventoryWorkbook(buffer);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/must be numbers/);
  });

  it('defaults taxRate/reorderPoint/openingStock when left blank', async () => {
    const workbook = buildTemplateWorkbook();
    const sheet = workbook.getWorksheet('Products')!;
    sheet.addRow({ sku: 'HW-MINIMAL', name: 'Minimal row', costPrice: 100, sellPrice: 200 });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const { rows } = await parseInventoryWorkbook(buffer);

    const minimal = rows.find((r) => r.sku === 'HW-MINIMAL' && r.kind === 'product') as ParsedProductRow | undefined;
    expect(minimal).toBeDefined();
    expect(minimal!.taxRate).toBe(0);
    expect(minimal!.reorderPoint).toBe(0);
    expect(minimal!.openingStock).toBe(0);
  });

  it('accepts a product row with a blank SKU, leaving it for the collection to auto-generate', async () => {
    const workbook = buildTemplateWorkbook();
    const sheet = workbook.getWorksheet('Products')!;
    sheet.addRow({ name: 'No Sku Product', costPrice: 100, sellPrice: 200 });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const { rows, errors } = await parseInventoryWorkbook(buffer);

    expect(errors).toHaveLength(0);
    const row = rows.find((r) => r.kind === 'product' && r.name === 'No Sku Product') as ParsedProductRow | undefined;
    expect(row).toBeDefined();
    expect(row!.sku).toBe('');
  });

  it('accepts a variant row with a blank SKU', async () => {
    const workbook = buildTemplateWorkbook();
    const sheet = workbook.getWorksheet('Products')!;
    sheet.addRow({ parentSku: 'SKU-001', variantLabel: 'XL' });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const { rows, errors } = await parseInventoryWorkbook(buffer);

    expect(errors).toHaveLength(0);
    const variant = rows.find((r) => r.kind === 'variant' && r.label === 'XL');
    expect(variant).toMatchObject({ kind: 'variant', parentSku: 'SKU-001', sku: '' });
  });

  it('skips fully blank rows without producing an error', async () => {
    const workbook = buildTemplateWorkbook();
    const sheet = workbook.getWorksheet('Products')!;
    sheet.addRow({});

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const { rows, errors } = await parseInventoryWorkbook(buffer);

    expect(rows).toHaveLength(3);
    expect(errors).toHaveLength(0);
  });

  it('treats a row with Parent SKU as a variant, ignoring product-only columns', async () => {
    const workbook = buildTemplateWorkbook();
    const sheet = workbook.getWorksheet('Products')!;
    sheet.addRow({ sku: 'HW-HAMMER-16', parentSku: 'SKU-001', variantLabel: '16oz', sellPrice: 850 });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const { rows, errors } = await parseInventoryWorkbook(buffer);

    expect(errors).toHaveLength(0);
    const variant = rows.find((r) => r.sku === 'HW-HAMMER-16');
    expect(variant).toMatchObject({ kind: 'variant', parentSku: 'SKU-001', label: '16oz', sellPrice: 850, costPrice: null });
  });

  it('rejects a variant row missing its label', async () => {
    const workbook = buildTemplateWorkbook();
    const sheet = workbook.getWorksheet('Products')!;
    sheet.addRow({ sku: 'HW-HAMMER-16', parentSku: 'SKU-001' }); // no variantLabel

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const { errors } = await parseInventoryWorkbook(buffer);

    expect(errors.some((e) => e.message.includes('Variant Label'))).toBe(true);
  });
});
