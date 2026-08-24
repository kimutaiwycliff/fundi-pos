import type { CollectionConfig } from 'payload';
import { computeOrderTotals, type LineInput } from '@hardware-pos/business-logic';
import { isAuthenticated, managerOrOwner, neverDelete, ownTenantOnly } from '../access/index.ts';
import { toID } from '../lib/relations.ts';
import { enforceOwnTenant } from '../hooks/enforceTenant.ts';

export const Orders: CollectionConfig = {
  slug: 'orders',
  admin: { useAsTitle: 'id', defaultColumns: ['store', 'total', 'tenderType', 'status', 'createdAt'] },
  access: {
    read: ownTenantOnly,
    create: isAuthenticated, // cashiers create sales
    // Status transitions (refunded/voided) are manager/owner-gated per spec
    // Section 6.1; line items and totals are never client-editable after
    // creation - only the fields below.
    update: managerOrOwner,
    delete: neverDelete,
  },
  fields: [
    { name: 'id', type: 'text', required: true }, // client-generated UUID
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'store', type: 'relationship', relationTo: 'stores', required: true, index: true },
    { name: 'terminal', type: 'text', required: true },
    { name: 'cashier', type: 'relationship', relationTo: 'users', required: true },
    // Optional - not every sale is tied to a known customer. Not in the
    // spec's original Orders field list, but needed to actually implement
    // "Customer profiles, purchase history, loyalty points" (spec Section
    // 6.4) since Customers.purchaseHistory has nothing to derive from
    // without it.
    { name: 'customer', type: 'relationship', relationTo: 'customers' },
    {
      name: 'loyaltyPointsEarned',
      type: 'number',
      admin: {
        readOnly: true,
        description: '1 point per 100 spent, server-computed at sale time. Stored (not recomputed) so a refund/void reverses exactly what was earned.',
      },
    },
    {
      name: 'lineItems',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        { name: 'product', type: 'relationship', relationTo: 'products', required: true },
        { name: 'variant', type: 'text' },
        { name: 'quantity', type: 'number', required: true, min: 0.001 },
        { name: 'unitPrice', type: 'number', required: true, admin: { step: 0.01 } },
        { name: 'discount', type: 'number', required: true, defaultValue: 0, admin: { step: 0.01 } },
      ],
    },
    // taxTotal/discountTotal/total are always server-recomputed in
    // beforeChange below from lineItems via @hardware-pos/business-logic -
    // the same module the desktop/web clients use, so nothing here can be
    // spoofed by a client and everyone agrees on the arithmetic.
    { name: 'taxTotal', type: 'number', required: true, admin: { readOnly: true, step: 0.01 } },
    { name: 'discountTotal', type: 'number', required: true, admin: { readOnly: true, step: 0.01 } },
    { name: 'total', type: 'number', required: true, admin: { readOnly: true, step: 0.01 } },
    {
      name: 'tenderType',
      type: 'select',
      required: true,
      options: ['cash', 'mpesa', 'card'],
    },
    {
      name: 'paymentStatus',
      type: 'select',
      required: true,
      defaultValue: 'paid',
      options: ['paid', 'pending', 'failed'],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'completed',
      options: ['completed', 'refunded', 'voided'],
    },
    { name: 'createdOffline', type: 'checkbox', defaultValue: false },
    { name: 'syncedAt', type: 'date' },
    // KRA eTIMS fields - nullable until vendor certification is complete
    // (see build plan Phase 8). Designed in now so no data migration is
    // needed once OSCU/VSCU wiring lands.
    { name: 'kraInvoiceNumber', type: 'text' },
    { name: 'kraQrCode', type: 'text' },
    { name: 'kraCuSerial', type: 'text' },
    {
      name: 'kraSubmissionStatus',
      type: 'select',
      required: true,
      defaultValue: 'not_applicable',
      options: ['not_applicable', 'pending', 'submitted', 'failed'],
    },
  ],
  hooks: {
    beforeChange: [
      enforceOwnTenant({ requireOwnStore: true }),
      ({ data, operation }) => {
        if (operation !== 'create' || !Array.isArray(data.lineItems)) return data;

        const lines: LineInput[] = data.lineItems.map((line: Record<string, unknown>) => ({
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          discount: Number(line.discount ?? 0),
          taxRate: 0.16, // TODO(Phase 6): read per-product taxRate once product lookups are wired into this hook
        }));

        const totals = computeOrderTotals(lines);
        data.taxTotal = totals.taxTotal;
        data.discountTotal = totals.discountTotal;
        data.total = totals.total;
        data.loyaltyPointsEarned = data.customer ? Math.floor(totals.total / 100) : 0;

        if (!data.syncedAt) {
          data.syncedAt = new Date().toISOString();
        }

        return data;
      },
    ],
    afterChange: [
      async ({ doc, operation, req, previousDoc }) => {
        // Derive the ledger rows this order implies. On create: one 'sale'
        // movement per line item. On a status transition into 'refunded' OR
        // 'voided': the mirror-image movements, so the ledger always
        // reflects reality without ever mutating history. Both statuses
        // restore the same physical shelf stock - the ledger doesn't care
        // about the legal/financial distinction between a refund and a
        // void, only that the item is back on the shelf. (Originally only
        // checked 'refunded' - caught while wiring up the void flow.)
        const shouldPostSaleMovements = operation === 'create' && doc.status === 'completed';
        const shouldPostRefundMovements =
          operation === 'update' &&
          (doc.status === 'refunded' || doc.status === 'voided') &&
          previousDoc?.status !== 'refunded' &&
          previousDoc?.status !== 'voided';

        if (!shouldPostSaleMovements && !shouldPostRefundMovements) return doc;

        const sign = shouldPostRefundMovements ? 1 : -1;
        const reason = shouldPostRefundMovements ? 'adjustment' : 'sale';
        const lineItems = (doc.lineItems ?? []) as Array<{
          product: string;
          variant?: string | null;
          quantity: number;
        }>;

        for (const line of lineItems) {
          await req.payload.create({
            collection: 'stock-movements',
            data: {
              id: crypto.randomUUID(),
              tenant: toID(doc.tenant),
              store: toID(doc.store),
              product: toID(line.product),
              variant: line.variant ? toID(line.variant) : null,
              quantityDelta: sign * Math.abs(line.quantity),
              reason,
              relatedOrder: toID(doc.id),
              clientTimestamp: new Date().toISOString(),
              sourceTerminal: doc.terminal,
            },
            overrideAccess: true,
            req,
          });
        }

        return doc;
      },
      // Loyalty accrual/reversal - symmetric with the stock-movement hook
      // above: earn on a completed sale, give back the exact same points
      // (not a recomputed amount) on refund/void, per Customers.loyaltyPoints
      // (spec Section 6.4).
      async ({ doc, operation, req, previousDoc }) => {
        if (!doc.customer) return doc;

        const justCompleted = operation === 'create' && doc.status === 'completed';
        const justReversed =
          operation === 'update' &&
          (doc.status === 'refunded' || doc.status === 'voided') &&
          previousDoc?.status !== 'refunded' &&
          previousDoc?.status !== 'voided';

        if (!justCompleted && !justReversed) return doc;

        const delta = justReversed ? -(doc.loyaltyPointsEarned as number) : (doc.loyaltyPointsEarned as number);
        if (!delta) return doc;

        const customer = await req.payload.findByID({
          collection: 'customers',
          id: toID(doc.customer),
          overrideAccess: true,
          req,
        });
        await req.payload.update({
          collection: 'customers',
          id: toID(doc.customer),
          data: { loyaltyPoints: Math.max(0, (customer.loyaltyPoints as number) + delta) },
          overrideAccess: true,
          req,
        });

        return doc;
      },
    ],
  },
};
