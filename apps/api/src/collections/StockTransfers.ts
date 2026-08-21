import type { CollectionConfig } from 'payload';
import { managerOrOwner, ownTenantOnly } from '../access/index.ts';
import { enforceOwnTenant } from '../hooks/enforceTenant.ts';
import { toID } from '../lib/relations.ts';

export const StockTransfers: CollectionConfig = {
  slug: 'stock-transfers',
  admin: { useAsTitle: 'id' },
  access: {
    read: ownTenantOnly,
    create: managerOrOwner,
    update: managerOrOwner,
    delete: managerOrOwner,
  },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'fromStore', type: 'relationship', relationTo: 'stores', required: true },
    { name: 'toStore', type: 'relationship', relationTo: 'stores', required: true },
    {
      name: 'lineItems',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        { name: 'product', type: 'relationship', relationTo: 'products', required: true },
        { name: 'quantity', type: 'number', required: true, min: 0.001 },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: ['draft', 'in_transit', 'received'],
    },
  ],
  hooks: {
    beforeChange: [enforceOwnTenant()],
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        // Stock only actually moves once a transfer is marked received -
        // draft/in_transit are just planning states, per spec Section 6.2
        // ("inter-store transfers"). Every movement is its own ledger row,
        // same as Orders.afterChange - never a direct stock-count edit.
        // Covers both a multi-step draft->in_transit->received transition
        // AND a transfer created already marked 'received' in one step -
        // caught by a test that created one directly as 'received' and got
        // zero derived movements because this only checked `operation ===
        // 'update'`, silently dropping the fast-path create case.
        const justReceived =
          doc.status === 'received' && (operation === 'create' || previousDoc?.status !== 'received');
        if (!justReceived) return doc;

        const lineItems = (doc.lineItems ?? []) as Array<{ product: unknown; quantity: number }>;
        const now = new Date().toISOString();

        for (const line of lineItems) {
          const productId = toID(line.product);
          await req.payload.create({
            collection: 'stock-movements',
            data: {
              id: crypto.randomUUID(),
              tenant: toID(doc.tenant),
              store: toID(doc.fromStore),
              product: productId,
              quantityDelta: -Math.abs(line.quantity),
              reason: 'transfer_out',
              clientTimestamp: now,
              sourceTerminal: 'stock-transfer',
            },
            overrideAccess: true,
            req,
          });
          await req.payload.create({
            collection: 'stock-movements',
            data: {
              id: crypto.randomUUID(),
              tenant: toID(doc.tenant),
              store: toID(doc.toStore),
              product: productId,
              quantityDelta: Math.abs(line.quantity),
              reason: 'transfer_in',
              clientTimestamp: now,
              sourceTerminal: 'stock-transfer',
            },
            overrideAccess: true,
            req,
          });
        }

        return doc;
      },
    ],
  },
};
