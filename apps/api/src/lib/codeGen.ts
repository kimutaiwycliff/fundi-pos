import type { Payload } from 'payload';

// Ambiguous characters (0/O, 1/I) dropped so a generated SKU is never
// misread if it ever does get read off a screen or label.
const SKU_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DIGITS = '0123456789';

function randomCode(length: number, alphabet: string): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

// SKU and barcode uniqueness is checked across BOTH a product's own field
// and its variants' matching field - a scanner or a "find by SKU" search
// can't tell a top-level product code from a variant's, so neither may
// collide with the other within a tenant.
async function codeExists(payload: Payload, tenantId: number, field: 'sku' | 'barcode', value: string): Promise<boolean> {
  const result = await payload.find({
    collection: 'products',
    where: {
      and: [{ tenant: { equals: tenantId } }, { or: [{ [field]: { equals: value } }, { [`variants.${field}`]: { equals: value } }] }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return result.totalDocs > 0;
}

// `reserved` tracks codes already handed out earlier in the SAME request
// (e.g. two blank variant SKUs on one product save) - a fresh DB query
// alone can't see a sibling's just-generated code before the document is
// actually written, so two variants could otherwise be assigned the same
// one.
export async function generateUniqueProductCode(params: {
  payload: Payload;
  tenantId: number;
  field: 'sku' | 'barcode';
  reserved: Set<string>;
}): Promise<string> {
  const { payload, tenantId, field, reserved } = params;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = field === 'sku' ? `SKU-${randomCode(6, SKU_ALPHABET)}` : randomCode(12, DIGITS);
    if (reserved.has(candidate)) continue;
    if (!(await codeExists(payload, tenantId, field, candidate))) {
      reserved.add(candidate);
      return candidate;
    }
  }
  throw new Error(`Could not generate a unique ${field === 'sku' ? 'SKU' : 'barcode'} - please try again.`);
}
