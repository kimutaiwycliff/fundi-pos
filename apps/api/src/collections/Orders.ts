import type { CollectionConfig } from 'payload';
import { computeOrderTotals, type LineInput } from '@hardware-pos/business-logic';
import { isAuthenticated, managerOrOwner, neverDelete, ownTenantOnly } from '../access/index.ts';
import { toID } from '../lib/relations.ts';
import { enforceOwnTenant } from '../hooks/enforceTenant.ts';

const REVERSAL_STATUSES = new Set(['refunded', 'voided']);

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
    // Point-in-time display name for whichever physical till rang this up
    // (apps/desktop's own local setting, never renamed retroactively on
    // past orders) - `terminal` above stays the stable id every lookup
    // (shift status, sync scoping) keys off, so renaming a till later can
    // never break those; this is purely "what was it called at the time."
    { name: 'terminalName', type: 'text' },
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
        // Denormalized copies of the parent order's own tenant/store,
        // stamped in beforeChange below - PowerSync's sync rules don't
        // support joins (confirmed against PowerSync's own docs: "Joins
        // are not supported in Sync Rules", their documented fix is
        // exactly this denormalization), so orders_line_items's PowerSync
        // stream can't reach these via `JOIN orders` the way
        // docker/powersync/sync-config.yaml previously tried to - it
        // silently replicated nothing. These columns let that stream
        // filter directly, no join needed. Never read/written by any
        // client - hidden from the admin UI on purpose.
        { name: 'tenantId', type: 'number', admin: { hidden: true } },
        { name: 'storeId', type: 'number', admin: { hidden: true } },
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
      options: ['cash', 'mpesa', 'card', 'credit'],
    },
    {
      name: 'paymentStatus',
      type: 'select',
      required: true,
      defaultValue: 'paid',
      options: ['paid', 'pending', 'failed'],
    },
    // Credit ("pay later") sales only - who authorized marking this paid,
    // and when. Left null for every other tender type; used by the audit
    // hook below to tell a genuine settlement apart from M-Pesa's own
    // pending->paid transition (which never sets this).
    { name: 'settledAt', type: 'date' },
    { name: 'settledBy', type: 'relationship', relationTo: 'users' },
    // Correlates Safaricom's asynchronous STK Push callback (which has no
    // other way to reference back to this order) - spec Section 6.5:
    // "M-Pesa STK Push... queue as pending if attempted offline and confirm
    // on reconnect". Nullable - only set for tenderType 'mpesa'.
    { name: 'mpesaCheckoutRequestId', type: 'text', index: true },
    // Correlates Pesapal's IPN callback back to this order (Pesapal's
    // OrderTrackingId is a distinct value from Daraja's CheckoutRequestID -
    // see lib/payments/pesapal.ts). Nullable - only set for tenderType 'card'.
    { name: 'pesapalOrderTrackingId', type: 'text', index: true },
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
      // Each line's real taxRate, not a blanket rate - a product exempt
      // from VAT (or at some other rate) was silently taxed at 16% anyway
      // here, even though the till itself (computeOrderTotals called
      // locally in Till.tsx, from each product's own synced tax_rate) got
      // it right. That mismatch only showed up on a reprint/web view,
      // which both read this collection's own (wrongly recomputed)
      // taxTotal rather than the till's original one-time-correct receipt.
      async ({ data, operation, req }) => {
        if (operation !== 'create' || !Array.isArray(data.lineItems)) return data;

        const productIds = [...new Set(data.lineItems.map((line: Record<string, unknown>) => Number(line.product)))];
        const products = await req.payload.find({
          collection: 'products',
          where: { id: { in: productIds } },
          limit: productIds.length,
          overrideAccess: true,
          req,
        });
        const taxRateByProductId = new Map(products.docs.map((p) => [p.id, p.taxRate]));

        const lines: LineInput[] = data.lineItems.map((line: Record<string, unknown>) => ({
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          discount: Number(line.discount ?? 0),
          // Falls back to the same 0 Products.taxRate's own schema default
          // uses - only reachable if a line references a product that's
          // since been deleted, not the normal case.
          taxRate: taxRateByProductId.get(Number(line.product)) ?? 0,
        }));

        const totals = computeOrderTotals(lines);
        data.taxTotal = totals.taxTotal;
        data.discountTotal = totals.discountTotal;
        data.total = totals.total;
        data.loyaltyPointsEarned = data.customer ? Math.floor(totals.total / 100) : 0;

        // See lineItems.tenantId/storeId's own comment above - orders are
        // create-only from every client's perspective, so this only ever
        // needs to run here (this whole block is already gated to
        // operation === 'create').
        data.lineItems = data.lineItems.map((line: Record<string, unknown>) => ({
          ...line,
          tenantId: Number(data.tenant),
          storeId: Number(data.store),
        }));

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
              tenant: Number(toID(doc.tenant)),
              store: Number(toID(doc.store)),
              product: Number(toID(line.product)),
              variant: line.variant ?? null,
              quantityDelta: sign * Math.abs(line.quantity),
              reason,
              relatedOrder: String(doc.id),
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
      // Multi-staff accountability: who actually approved this void/refund,
      // not just whose session the HTTP request happened to run under. A
      // cashier's own session can never pass Orders.access.update
      // (managerOrOwner) on its own - the authorize-status route is the
      // only path a cashier session can take, and it sets
      // req.context.authorizedByManagerId to the PIN-verified manager
      // before calling update() with overrideAccess. A manager/owner
      // editing an order directly (no PIN step needed - already
      // authorized by their own role) has no such context, so this falls
      // back to req.user - correctly attributing to them instead.
      async ({ doc, operation, req, previousDoc }) => {
        const justReversed =
          operation === 'update' && REVERSAL_STATUSES.has(doc.status) && !REVERSAL_STATUSES.has(previousDoc?.status ?? '');
        if (!justReversed) return doc;

        const actorId = (req.context?.authorizedByManagerId as number | undefined) ?? req.user?.id;
        if (actorId == null) return doc;

        await req.payload.create({
          collection: 'audit-log',
          data: {
            tenant: Number(toID(doc.tenant)),
            actor: Number(actorId),
            action: doc.status === 'voided' ? 'order_voided' : 'order_refunded',
            entityType: 'order',
            entityId: String(doc.id),
            summary: `Order ${String(doc.id).slice(0, 8)} ${doc.status} (${(doc.total as number).toFixed(2)})`,
            metadata: { previousStatus: previousDoc?.status, total: doc.total },
          },
          overrideAccess: true,
          req,
        });
        return doc;
      },
      // Same "context wins over session" reasoning as the void/refund hook
      // above, for the other manager-gated transition: settling a credit
      // sale (see /api/orders/[id]/settle). Guarded on settledAt actually
      // having just been set, not just paymentStatus flipping to 'paid' -
      // M-Pesa's own callback-driven pending->paid transition never sets
      // settledAt, so it never fires this.
      async ({ doc, operation, req, previousDoc }) => {
        const justSettled =
          operation === 'update' &&
          doc.paymentStatus === 'paid' &&
          previousDoc?.paymentStatus === 'pending' &&
          Boolean(doc.settledAt) &&
          !previousDoc?.settledAt;
        if (!justSettled) return doc;

        const actorId = (req.context?.authorizedByManagerId as number | undefined) ?? req.user?.id;
        if (actorId == null) return doc;

        await req.payload.create({
          collection: 'audit-log',
          data: {
            tenant: Number(toID(doc.tenant)),
            actor: Number(actorId),
            action: 'sale_settled',
            entityType: 'order',
            entityId: String(doc.id),
            summary: `Order ${String(doc.id).slice(0, 8)} settled (${(doc.total as number).toFixed(2)})`,
            metadata: { total: doc.total, customer: doc.customer },
          },
          overrideAccess: true,
          req,
        });
        return doc;
      },
    ],
  },
};
