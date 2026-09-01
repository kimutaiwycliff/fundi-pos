import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { parseInventoryWorkbook } from '@/lib/inventoryImport';
import { isTenantUser, toID } from '@/lib/relations';

// Bulk product import from an uploaded spreadsheet - manager/owner only,
// same as manually creating products. Idempotent for rows that give an
// explicit SKU: a row whose SKU already exists for this tenant is skipped
// rather than overwritten, so re-uploading the same file (or a corrected
// version of it) is safe. A row that leaves SKU blank is NOT idempotent -
// it's always treated as a brand new product/variant with a freshly
// generated code, so re-uploading a file full of blank-SKU rows creates
// duplicates rather than skipping them. Opening-stock rows go through the
// same StockMovements ledger every other stock change does - never a
// direct stock-count write.
//
// Two passes: standalone product rows first (kind: 'product'), then variant
// rows (kind: 'variant') - a variant's Parent SKU might point at a product
// created in the FIRST pass of this very file, so variants can never be
// processed before every product row has had a chance to exist.
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
  let variantsAddedCount = 0;

  async function recordOpeningStock(productId: number, variant: string | null, quantity: number, rowNumber: number) {
    if (quantity <= 0) return;
    if (typeof storeId !== 'string' || !storeId) {
      rowErrors.push({ row: rowNumber, message: `Opening Stock (${quantity}) ignored - no store selected for this upload` });
      return;
    }
    await payload.create({
      collection: 'stock-movements',
      data: {
        id: crypto.randomUUID(),
        tenant: Number(tenantId),
        store: Number(storeId),
        product: productId,
        variant,
        quantityDelta: quantity,
        reason: 'restock',
        clientTimestamp: new Date().toISOString(),
        sourceTerminal: 'bulk-import',
      },
      overrideAccess: true,
    });
  }

  // Pass 1 - standalone products. skuToProductId tracks what THIS upload
  // just created, so a variant row later in the same file can resolve its
  // Parent SKU without a fresh query.
  const skuToProductId = new Map<string, number>();
  for (const row of rows) {
    if (row.kind !== 'product') continue;

    // A blank SKU always means "create a new one, let it be generated" -
    // there's nothing to check for a duplicate against.
    if (row.sku) {
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
    }

    const product = await payload.create({
      collection: 'products',
      data: {
        tenant: Number(tenantId),
        sku: row.sku || undefined,
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
    if (row.sku) skuToProductId.set(row.sku, Number(product.id));

    await recordOpeningStock(Number(product.id), null, row.openingStock, row.rowNumber);
  }

  // Pass 2 - variants. Each Parent SKU resolves against what pass 1 just
  // created first, then falls back to an existing product already in the
  // catalog (so a follow-up upload can add new variants to an old product).
  for (const row of rows) {
    if (row.kind !== 'variant') continue;

    let parentId = skuToProductId.get(row.parentSku);
    if (parentId == null) {
      const existingParent = await payload.find({
        collection: 'products',
        where: { tenant: { equals: tenantId }, sku: { equals: row.parentSku } },
        limit: 1,
        overrideAccess: true,
      });
      parentId = existingParent.docs[0]?.id as number | undefined;
    }
    if (parentId == null) {
      rowErrors.push({ row: row.rowNumber, message: `Parent SKU "${row.parentSku}" not found - add that product first` });
      continue;
    }

    const parent = await payload.findByID({ collection: 'products', id: parentId, overrideAccess: true });
    const existingVariants = (parent.variants ?? []) as Array<{ id?: string; sku: string }>;
    if (row.sku && existingVariants.some((v) => v.sku === row.sku)) {
      skippedCount++;
      rowErrors.push({ row: row.rowNumber, message: `Variant SKU "${row.sku}" already exists on "${row.parentSku}" - skipped` });
      continue;
    }

    const updated = await payload.update({
      collection: 'products',
      id: parentId,
      data: {
        variants: [
          ...existingVariants,
          {
            label: row.label,
            sku: row.sku || undefined,
            barcode: row.barcode ?? undefined,
            sellPrice: row.sellPrice ?? undefined,
            costPrice: row.costPrice ?? undefined,
          },
        ],
      },
      overrideAccess: true,
    });
    variantsAddedCount++;

    // The new variant's id (and, when row.sku was blank, its generated sku)
    // is only assigned by this update - the one sub-document whose id
    // wasn't already present before the update is the one just added.
    const newVariants = (updated.variants ?? []) as Array<{ id?: string; sku: string }>;
    const existingIds = new Set(existingVariants.map((v) => v.id));
    const newVariantId = newVariants.find((v) => v.id && !existingIds.has(v.id))?.id ?? null;
    await recordOpeningStock(parentId, newVariantId, row.openingStock, row.rowNumber);
  }

  return Response.json({ createdCount, variantsAddedCount, skippedCount, errors: rowErrors });
}
