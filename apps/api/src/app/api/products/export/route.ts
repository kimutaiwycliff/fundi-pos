import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import ExcelJS from 'exceljs';
import { INVENTORY_COLUMNS } from '@/lib/inventoryImport';
import { isTenantUser, toID } from '@/lib/relations';

// The export counterpart to bulk-upload/template's INVENTORY_COLUMNS - same
// column order/keys, so a downloaded export re-uploads unchanged through
// the existing importer. One row per product, plus one additional row per
// variant (Parent SKU + Variant Label set, same "one row per SKU"
// convention the importer already documents). Opening Stock is left blank
// on every row: stock is a derived sum of this tenant's stock-movements
// ledger per store, not a single portable number, and writing a computed
// current total here would double-count it as a brand-new movement on
// re-import.
export async function GET(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = toID(user.tenant);
  const products = await payload.find({
    collection: 'products',
    where: { tenant: { equals: tenantId } },
    sort: 'name',
    limit: 10000,
    depth: 0,
    overrideAccess: true,
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Products');
  sheet.columns = INVENTORY_COLUMNS.map((col) => ({ header: col.header, key: col.key, width: 20 }));
  sheet.getRow(1).font = { bold: true };

  for (const product of products.docs) {
    sheet.addRow({
      sku: product.sku ?? '',
      parentSku: '',
      variantLabel: '',
      barcode: product.barcode ?? '',
      name: product.name,
      category: product.category ?? '',
      costPrice: product.costPrice ?? '',
      sellPrice: product.sellPrice ?? '',
      taxRate: product.taxRate ?? 0,
      reorderPoint: product.reorderPoint ?? 0,
      maxDiscountAmount: product.maxDiscountAmount ?? 0,
      active: product.isActive === false ? 'No' : 'Yes',
      openingStock: '',
    });

    for (const variant of product.variants ?? []) {
      sheet.addRow({
        sku: variant.sku ?? '',
        parentSku: product.sku ?? '',
        variantLabel: variant.label,
        barcode: variant.barcode ?? '',
        name: '',
        category: '',
        costPrice: variant.costPrice ?? '',
        sellPrice: variant.sellPrice ?? '',
        taxRate: '',
        reorderPoint: '',
        maxDiscountAmount: '',
        active: '',
        openingStock: '',
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="products-export-${date}.xlsx"`,
    },
  });
}
