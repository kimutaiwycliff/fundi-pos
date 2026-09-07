import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { isTenantUser, toID } from '@/lib/relations';

// Marks a purchase order received and writes one stock-movements row per
// line item (reason: 'restock') - reuses the existing append-only ledger
// model rather than adding a separate "received stock" concept, the same
// way a sale's stock impact is just more rows in the same ledger.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'owner' && user.role !== 'manager') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const tenantId = toID(user.tenant);

  const po = await payload.findByID({ collection: 'purchase-orders', id, overrideAccess: true }).catch(() => null);
  if (!po || toID(po.tenant) !== tenantId) {
    return Response.json({ error: 'Purchase order not found' }, { status: 404 });
  }
  if (po.status === 'received') {
    return Response.json({ error: 'Already received' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const lineItems = (po.lineItems ?? []) as Array<{ product: unknown; variant?: string | null; quantity: number }>;

  for (const line of lineItems) {
    await payload.create({
      collection: 'stock-movements',
      data: {
        id: crypto.randomUUID(),
        tenant: Number(tenantId),
        store: Number(toID(po.store)),
        product: Number(toID(line.product)),
        variant: line.variant || undefined,
        quantityDelta: line.quantity,
        reason: 'restock',
        clientTimestamp: now,
        sourceTerminal: 'web-purchase-order-receive',
      },
      overrideAccess: true,
    });
  }

  const updated = await payload.update({
    collection: 'purchase-orders',
    id,
    data: { status: 'received', receivedAt: now },
    overrideAccess: true,
  });

  return Response.json({ doc: updated });
}
