import type { Payload, PayloadRequest } from 'payload';

// Current stock for a product(+variant) at a store is ALWAYS a derived sum
// over StockMovements — never a mutable counter. This is what prevents
// silent overselling when two offline tills sell the same last unit before
// either has synced (see POS_SAAS_SPEC.md Section 5).
//
// `req` MUST be threaded through and forwarded to `payload.find` here: this
// is called from StockMovements' afterChange hook, which runs inside the
// same DB transaction as the write that triggered it. Without reusing that
// transaction (via req), this query runs on a separate connection and
// can't see the just-inserted row yet - caught by an integration test that
// expected a negative-balance flag and got none.
export async function computeRunningBalance(
  payload: Payload,
  args: { tenant: string; store: string; product: string; variant?: string | null },
  req?: PayloadRequest,
): Promise<number> {
  const where: Record<string, unknown> = {
    tenant: { equals: args.tenant },
    store: { equals: args.store },
    product: { equals: args.product },
  };
  if (args.variant) {
    where.variant = { equals: args.variant };
  }

  const result = await payload.find({
    collection: 'stock-movements',
    where,
    pagination: false, // return every matching row so the sum is exact
    overrideAccess: true,
    req,
  });

  return result.docs.reduce((sum, doc) => sum + (doc.quantityDelta as number), 0);
}
