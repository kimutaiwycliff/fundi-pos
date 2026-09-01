import type { CollectionBeforeValidateHook } from 'payload';
import { generateUniqueProductCode } from '../lib/codeGen.ts';
import { isTenantUser, toID } from '../lib/relations.ts';

// SKU/barcode are auto-generated whenever left blank, for both the product
// itself and each of its variants - the dashboard's product dialog no
// longer shows those fields at all (per the user's own instruction: they
// don't want to deal with them), and the Excel bulk importer treats them as
// optional too. Runs in beforeValidate specifically, not beforeChange -
// beforeChange fires AFTER Payload's own required-field validation, which
// would reject a blank sku before this hook ever got a chance to fill it in.
export const generateProductCodes: CollectionBeforeValidateHook = async ({ data, req, originalDoc, operation }) => {
  if (!data) return data;

  const tenantId = isTenantUser(req.user)
    ? Number(toID(req.user.tenant))
    : data.tenant != null
      ? Number(toID(data.tenant))
      : originalDoc?.tenant != null
        ? Number(toID(originalDoc.tenant))
        : undefined;
  if (tenantId == null || !Number.isFinite(tenantId)) return data;

  const reservedSkus = new Set<string>();
  const reservedBarcodes = new Set<string>();

  if (operation === 'create' || 'sku' in data) {
    if (!data.sku) {
      data.sku = await generateUniqueProductCode({ payload: req.payload, tenantId, field: 'sku', reserved: reservedSkus });
    }
  }
  if (operation === 'create' || 'barcode' in data) {
    if (!data.barcode) {
      data.barcode = await generateUniqueProductCode({ payload: req.payload, tenantId, field: 'barcode', reserved: reservedBarcodes });
    }
  }

  if (Array.isArray(data.variants)) {
    for (const variant of data.variants as Array<Record<string, unknown>>) {
      if (!variant || typeof variant !== 'object') continue;
      if (!variant.sku) {
        variant.sku = await generateUniqueProductCode({ payload: req.payload, tenantId, field: 'sku', reserved: reservedSkus });
      }
      if (!variant.barcode) {
        variant.barcode = await generateUniqueProductCode({ payload: req.payload, tenantId, field: 'barcode', reserved: reservedBarcodes });
      }
    }
  }

  return data;
};
