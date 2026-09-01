import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { parseInventoryWorkbook } from '@/lib/inventoryImport';
import { isTenantUser, toID } from '@/lib/relations';

// Bulk product import from an uploaded spreadsheet - manager/owner only,
// same as manually creating products. Idempotent by design: a row whose
// SKU already exists for this tenant is skipped rather than overwritten,
// so re-uploading the same file (or a corrected version of it) is always
// safe. Opening-stock rows go through the same StockMovements ledger every
// other stock change does - never a direct stock-count write.
export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user) || (user.role !== 'owner' && user.role !== 'manager')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const storeId = formData.get('storeId');
  if (!(file instanceof File)) {
    return Response.json({ error: 'file is required' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { rows, errors } = await parseInventoryWorkbook(buffer);

  const tenantId = toID(user.tenant);
  const rowErrors: { row: number; message: string }[] = errors.map((e) => ({ row: e.rowNumber, message: e.message }));
  let createdCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    const existing = await payload.find({
      collection: 'products',
      where: { tenant: { equals: tenantId }, sku: { equals: row.sku } },
      limit: 1,
      overrideAccess: true,
    });
    if (existing.docs.length > 0) {
      skippedCount++;
      rowErrors.push({ row: row.rowNumber, message: `SKU "${row.sku}" already exists - skipped` });
      continue;
    }

    const product = await payload.create({
      collection: 'products',
      data: {
        tenant: Number(tenantId),
        sku: row.sku,
        barcode: row.barcode ?? undefined,
        name: row.name,
        category: row.category ?? undefined,
        costPrice: row.costPrice,
        sellPrice: row.sellPrice,
        taxRate: row.taxRate,
        reorderPoint: row.reorderPoint,
        maxDiscountAmount: row.maxDiscountAmount,
        isActive: row.isActive,
      },
      overrideAccess: true,
    });
    createdCount++;

    if (row.openingStock > 0 && typeof storeId === 'string' && storeId) {
      await payload.create({
        collection: 'stock-movements',
        data: {
          id: crypto.randomUUID(),
          tenant: Number(tenantId),
          store: Number(storeId),
          product: Number(product.id),
          quantityDelta: row.openingStock,
          reason: 'restock',
          clientTimestamp: new Date().toISOString(),
          sourceTerminal: 'bulk-import',
        },
        overrideAccess: true,
      });
    } else if (row.openingStock > 0) {
      rowErrors.push({ row: row.rowNumber, message: `Opening Stock (${row.openingStock}) ignored - no store selected for this upload` });
    }
  }

  return Response.json({ createdCount, skippedCount, errors: rowErrors });
}
