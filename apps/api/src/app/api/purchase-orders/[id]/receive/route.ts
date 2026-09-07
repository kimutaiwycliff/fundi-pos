import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { isTenantUser, toID } from '@/lib/relations';

interface ReceiveLine {
  product: unknown;
  variant?: string | null;
  quantity: number;
  receivedQuantity?: number;
}

// Receives some or all of a purchase order's line items and writes one
// stock-movements row per received line (reason: 'restock') - reuses the
// existing append-only ledger model rather than adding a separate
// "received stock" concept, the same way a sale's stock impact is just
// more rows in the same ledger.
//
// Body: { items?: Array<{ index: number; quantity?: number }> } - which
// lines to receive now, and how much of each. Omitting `items` entirely
// receives everything still outstanding (the old all-or-nothing
// behavior, kept as the default for a single-line "receive it all" click).
// Re-callable: a second partial receive on the same PO picks up wherever
// the first left off, since receivedQuantity accumulates rather than resets.
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
    return Response.json({ error: 'Already fully received' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedItems = Array.isArray(body?.items) ? (body.items as Array<{ index: number; quantity?: number }>) : null;

  const now = new Date().toISOString();
  const lineItems = (po.lineItems ?? []) as ReceiveLine[];

  const toReceive: Array<{ index: number; quantity?: number }> = (
    requestedItems ?? lineItems.map((_, index) => ({ index }))
  ).filter((req) => lineItems[req.index]);

  for (const req of toReceive) {
    const line = lineItems[req.index];
    const alreadyReceived = line.receivedQuantity ?? 0;
    const outstanding = line.quantity - alreadyReceived;
    const quantity = Math.min(req.quantity ?? outstanding, outstanding);
    if (quantity <= 0) continue;

    await payload.create({
      collection: 'stock-movements',
      data: {
        id: crypto.randomUUID(),
        tenant: Number(tenantId),
        store: Number(toID(po.store)),
        product: Number(toID(line.product)),
        variant: line.variant || undefined,
        quantityDelta: quantity,
        reason: 'restock',
        clientTimestamp: now,
        sourceTerminal: 'web-purchase-order-receive',
      },
      overrideAccess: true,
    });

    lineItems[req.index] = { ...line, receivedQuantity: alreadyReceived + quantity };
  }

  const allReceived = lineItems.every((l) => (l.receivedQuantity ?? 0) >= l.quantity);
  const anyReceived = lineItems.some((l) => (l.receivedQuantity ?? 0) > 0);
  const status = allReceived ? 'received' : anyReceived ? 'partially_received' : po.status;

  const updated = await payload.update({
    collection: 'purchase-orders',
    id,
    // lineItems has been mutated in place above with updated
    // receivedQuantity values - passing it straight back through is the
    // same "read the doc, tweak it, write it back" shape Payload expects
    // for an array field; the local ReceiveLine type is intentionally
    // looser than the generated PurchaseOrder type for this transient
    // computation, hence the cast.
    data: { lineItems: lineItems as unknown as NonNullable<typeof po.lineItems>, status, receivedAt: allReceived ? now : po.receivedAt },
    overrideAccess: true,
  });

  return Response.json({ doc: updated });
}
