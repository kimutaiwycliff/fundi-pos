import { describe, expect, it } from 'vitest';
import { buildTemplateWorkbook, parseInventoryWorkbook } from '../lib/inventoryImport.ts';

describe('buildTemplateWorkbook + parseInventoryWorkbook round-trip', () => {
  it('parses its own generated template back into the two example rows', async () => {
    const workbook = buildTemplateWorkbook();
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const { rows, errors } = await parseInventoryWorkbook(buffer);

    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ sku: 'SKU-001', name: 'Sample Product', costPrice: 450, sellPrice: 799 });
    expect(rows[1]).toMatchObject({ sku: 'SKU-002', name: 'Another Sample Product' });
  });
});

describe('parseInventoryWorkbook validation', () => {
  it('reports a row missing a required column instead of silently dropping it', async () => {
    const workbook = buildTemplateWorkbook();
    const sheet = workbook.getWorksheet('Products')!;
    sheet.addRow({ sku: 'HW-NO-PRICE', name: 'Missing prices' }); // no costPrice/sellPrice

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const { rows, errors } = await parseInventoryWorkbook(buffer);

    expect(rows).toHaveLength(2); // the two valid example rows
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

    const minimal = rows.find((r) => r.sku === 'HW-MINIMAL')!;
    expect(minimal.taxRate).toBe(0.16);
    expect(minimal.reorderPoint).toBe(0);
    expect(minimal.openingStock).toBe(0);
  });

  it('skips fully blank rows without producing an error', async () => {
    const workbook = buildTemplateWorkbook();
    const sheet = workbook.getWorksheet('Products')!;
    sheet.addRow({});

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const { rows, errors } = await parseInventoryWorkbook(buffer);

    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(0);
  });
});
