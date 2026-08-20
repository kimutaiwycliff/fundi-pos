import type { CollectionConfig } from 'payload';
import { isAuthenticated, neverDelete, ownTenantOnly } from '../access/index.ts';
import { computeRunningBalance } from '../hooks/stockBalance.ts';
import { toID } from '../lib/relations.ts';

export const StockMovements: CollectionConfig = {
  slug: 'stock-movements',
  admin: { useAsTitle: 'id', defaultColumns: ['product', 'store', 'quantityDelta', 'reason', 'flaggedForReview'] },
  access: {
    read: ownTenantOnly,
    // Cashiers write these constantly (every sale); managers/owners for
    // restocks/adjustments/transfers. Nothing may ever be deleted -
    // corrections are new rows, never edits to history.
    create: isAuthenticated,
    update: () => false,
    delete: neverDelete,
  },
  fields: [
    // Client-generated UUID, so replaying an already-applied write is a
    // no-op (see /api/sync/stock-movements route, which is where the actual
    // idempotency check happens - Payload has no hook that can skip a DB
    // write mid-flight, only a route wrapping the Local API can).
    { name: 'id', type: 'text', required: true },
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'store', type: 'relationship', relationTo: 'stores', required: true, index: true },
    { name: 'product', type: 'relationship', relationTo: 'products', required: true, index: true },
    { name: 'variant', type: 'text' }, // sub-document id within product.variants, if applicable
    {
      name: 'quantityDelta',
      type: 'number',
      required: true,
      admin: { description: 'Positive = restock/return. Negative = sale/write-off.' },
    },
    {
      name: 'reason',
      type: 'select',
      required: true,
      options: ['sale', 'restock', 'transfer_in', 'transfer_out', 'adjustment', 'write_off'],
    },
    { name: 'relatedOrder', type: 'relationship', relationTo: 'orders' },
    { name: 'clientTimestamp', type: 'date', required: true },
    { name: 'serverTimestamp', type: 'date' },
    { name: 'sourceTerminal', type: 'text', required: true },
    {
      // Set automatically when this movement drives a product+store's
      // running balance negative. Surfaced in the dashboard's exception
      // queue (Phase 6) for manual review - never silently clamped to zero.
      name: 'flaggedForReview',
      type: 'checkbox',
      defaultValue: false,
      admin: { readOnly: true },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        if (operation === 'create' && !data.serverTimestamp) {
          data.serverTimestamp = new Date().toISOString();
        }
        return data;
      },
    ],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== 'create') return doc;

        const balance = await computeRunningBalance(
          req.payload,
          {
            tenant: String(toID(doc.tenant)),
            store: String(toID(doc.store)),
            product: String(toID(doc.product)),
            variant: doc.variant ? String(toID(doc.variant)) : null,
          },
          req,
        );

        if (balance < 0) {
          await req.payload.update({
            collection: 'stock-movements',
            id: doc.id,
            data: { flaggedForReview: true },
            overrideAccess: true,
            req,
          });
        }
      },
    ],
  },
};
