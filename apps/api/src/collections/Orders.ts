import type { CollectionConfig } from 'payload';
import { APIError } from 'payload';
import {
  computeCheckoutTotals,
  evaluatePromo,
  hasAddon,
  loyaltyPointsEarnedFor,
  normalizePromoCode,
  resolveLoyaltyRedemption,
  SALES_CHANNEL_LABELS,
  SALES_CHANNELS,
  type LineInput,
  type PromoRule,
} from '@hardware-pos/business-logic';
import { isAuthenticated, managerOrOwner, neverDelete, ownTenantOnly } from '../access/index.ts';
import { isTenantUser, toID } from '../lib/relations.ts';
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
      // Where the sale came from (walk-in, WhatsApp, TikTok...) - picked at
      // checkout, drives Reports -> Sales by channel. Orders from before
      // this existed (or from an un-updated till) default to walk-in.
      name: 'channel',
      type: 'select',
      defaultValue: 'walk_in',
      options: SALES_CHANNELS.map((value) => ({ value, label: SALES_CHANNEL_LABELS[value] })),
    },
    // Order-level discounts, both resolved and priced server-side in the
    // beforeChange hook below - a client only ever sends the code text and
    // how many points to redeem, never an amount. Frozen after creation.
    { name: 'promoCodeText', type: 'text', access: { update: () => false } },
    { name: 'promoCode', type: 'relationship', relationTo: 'promo-codes', access: { update: () => false } },
    { name: 'promoDiscount', type: 'number', defaultValue: 0, access: { update: () => false }, admin: { readOnly: true, step: 0.01 } },
    { name: 'loyaltyPointsRedeemed', type: 'number', defaultValue: 0, min: 0, access: { update: () => false } },
    { name: 'loyaltyDiscount', type: 'number', defaultValue: 0, access: { update: () => false }, admin: { readOnly: true, step: 0.01 } },
    {
      // Points credited to the promo code's referrer for this sale - stored
      // so a refund/void takes back exactly what was given.
      name: 'referrerPointsAwarded',
      type: 'number',
      defaultValue: 0,
      access: { update: () => false },
      admin: { readOnly: true },
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
        const [products, tenant] = await Promise.all([
          req.payload.find({
            collection: 'products',
            where: { id: { in: productIds } },
            limit: productIds.length,
            overrideAccess: true,
            req,
          }),
          req.payload.findByID({ collection: 'tenants', id: Number(data.tenant), overrideAccess: true, req }),
        ]);
        const productById = new Map(products.docs.map((p) => [p.id, p]));
        const taxRateByProductId = new Map(products.docs.map((p) => [p.id, p.taxRate]));

        // Discount enforcement - the cap (Products.maxDiscountAmount) was
        // previously client-only and bypassable via a direct API call;
        // the cost floor didn't exist anywhere at all. Owners always
        // bypass the configured cap (they set it and already see cost),
        // but the floor is unconditional for every role - overrideAccess
        // here is only ever used server-side (report/receipt code), so
        // this never blocks anything but a real client-submitted order.
        const enforceCaps = tenant.enforceDiscountCaps !== false;
        const isOwner = req.user?.collection === 'platform-admins' || (isTenantUser(req.user) && req.user.role === 'owner');
        for (const line of data.lineItems as Array<Record<string, unknown>>) {
          const product = productById.get(Number(line.product));
          if (!product) continue;
          const variantId = line.variant as string | null | undefined;
          const variant = variantId
            ? ((product.variants ?? []) as Array<{ id?: string; costPrice?: number }>).find((v) => v.id === variantId)
            : null;
          const costPrice = Number(variant?.costPrice ?? product.costPrice ?? 0);
          const quantity = Number(line.quantity);
          const unitPrice = Number(line.unitPrice);
          const discount = Number(line.discount ?? 0);
          const effectiveUnitPrice = quantity > 0 ? unitPrice - discount / quantity : unitPrice;

          if (effectiveUnitPrice < costPrice - 0.01) {
            throw new APIError(`This item's discount would sell "${String(product.name)}" below cost.`, 400);
          }
          if (!isOwner && enforceCaps) {
            const maxDiscountAmount = Number(product.maxDiscountAmount ?? 0);
            if (discount > maxDiscountAmount * quantity + 0.01) {
              throw new APIError(`Discount on "${String(product.name)}" exceeds the maximum allowed for this product.`, 400);
            }
          }
        }

        const lines: LineInput[] = data.lineItems.map((line: Record<string, unknown>) => ({
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          discount: Number(line.discount ?? 0),
          // Falls back to the same 0 Products.taxRate's own schema default
          // uses - only reachable if a line references a product that's
          // since been deleted, not the normal case.
          taxRate: taxRateByProductId.get(Number(line.product)) ?? 0,
        }));

        const subtotal = computeCheckoutTotals(lines).subtotal;

        // Promo code (Sell Online add-on) - looked up by its text within
        // this tenant, evaluated with the same evaluatePromo() the till's
        // preview used. Never trust a client-sent amount or promo id.
        let promoDiscount = 0;
        data.promoCode = null;
        data.referrerPointsAwarded = 0;
        const promoText = normalizePromoCode(data.promoCodeText as string | undefined);
        data.promoCodeText = promoText || null;
        if (promoText) {
          if (!hasAddon(tenant, 'sell_online')) {
            // Deliberately neutral - a shop without the add-on shouldn't learn it exists.
            throw new APIError("Promo codes aren't available for this shop.", 403);
          }
          const found = await req.payload.find({
            collection: 'promo-codes',
            where: { tenant: { equals: Number(data.tenant) }, code: { equals: promoText } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
            req,
          });
          const promo = found.docs[0];
          if (!promo) throw new APIError(`Promo code ${promoText} doesn't exist.`, 400);
          const result = evaluatePromo(promo as unknown as PromoRule, subtotal);
          if (!result.ok) throw new APIError(result.reason, 400);
          promoDiscount = result.discount;
          data.promoCode = promo.id;
          const referrerId = promo.referrerCustomer ? toID(promo.referrerCustomer) : null;
          const reward = Number(promo.referrerRewardPoints ?? 0);
          // No reward for using your own referral code.
          if (referrerId != null && reward > 0 && String(referrerId) !== String(data.customer ? toID(data.customer) : '')) {
            data.referrerPointsAwarded = Math.floor(reward);
          }
        }

        // Loyalty redemption (every plan) - needs a customer, whole points,
        // never more than they hold. Capped to what brings the bill to zero.
        let loyaltyDiscount = 0;
        const requestedPoints = Math.floor(Number(data.loyaltyPointsRedeemed ?? 0));
        data.loyaltyPointsRedeemed = 0;
        if (requestedPoints > 0) {
          if (!data.customer) throw new APIError('Pick the customer whose loyalty points are being redeemed.', 400);
          const customer = await req.payload.findByID({
            collection: 'customers',
            id: toID(data.customer),
            overrideAccess: true,
            depth: 0,
            req,
          });
          if (String(toID(customer.tenant)) !== String(data.tenant)) throw new APIError('Unknown customer.', 400);
          const available = Number(customer.loyaltyPoints ?? 0);
          if (requestedPoints > available) {
            throw new APIError(`${String(customer.name)} only has ${available} loyalty points.`, 400);
          }
          const pointValue = Number(tenant.loyaltyPointValue ?? 1);
          if (!(pointValue > 0)) throw new APIError('Loyalty point redemption is turned off for this shop.', 400);
          const redemption = resolveLoyaltyRedemption({
            requestedPoints,
            availablePoints: available,
            pointValue,
            payable: subtotal - promoDiscount,
          });
          data.loyaltyPointsRedeemed = redemption.points;
          loyaltyDiscount = redemption.discount;
        }

        const totals = computeCheckoutTotals(lines, { promoDiscount, loyaltyDiscount });
        data.taxTotal = totals.taxTotal;
        data.discountTotal = totals.discountTotal;
        data.total = totals.total;
        data.promoDiscount = totals.promoDiscount;
        data.loyaltyDiscount = totals.loyaltyDiscount;
        data.loyaltyPointsEarned = data.customer ? loyaltyPointsEarnedFor(totals.total) : 0;

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

        // One stock-movement row per line item, independently valid and
        // never dependent on another line's outcome - now that this runs
        // synchronously on every checkout on every platform (not just as an
        // offline-queue drain target), a sequential await-per-line here
        // serialized N round-trips onto every checkout's response time.
        // Promise.all issues them concurrently; the hook still rejects (and
        // the request still surfaces an error) if any one line fails, same
        // as the sequential version ultimately did.
        await Promise.all(
          lineItems.map((line) =>
            req.payload.create({
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
            }),
          ),
        );

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

        // Net movement = earned minus redeemed; a reversal is its exact mirror
        // (earned taken back, redeemed points returned).
        const earned = Number(doc.loyaltyPointsEarned ?? 0);
        const redeemed = Number(doc.loyaltyPointsRedeemed ?? 0);
        const delta = justReversed ? redeemed - earned : earned - redeemed;
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
      // Promo usage counter and referral reward - same earn-on-sale /
      // mirror-on-reversal shape as the loyalty hook above.
      async ({ doc, operation, req, previousDoc }) => {
        if (!doc.promoCode) return doc;
        const justCompleted = operation === 'create' && doc.status === 'completed';
        const justReversed =
          operation === 'update' && REVERSAL_STATUSES.has(doc.status) && !REVERSAL_STATUSES.has(previousDoc?.status ?? '');
        if (!justCompleted && !justReversed) return doc;

        const promo = await req.payload.findByID({
          collection: 'promo-codes',
          id: toID(doc.promoCode),
          overrideAccess: true,
          depth: 0,
          req,
        });
        await req.payload.update({
          collection: 'promo-codes',
          id: promo.id,
          data: { usesCount: Math.max(0, Number(promo.usesCount ?? 0) + (justReversed ? -1 : 1)) },
          overrideAccess: true,
          req,
        });

        const reward = Number(doc.referrerPointsAwarded ?? 0);
        if (reward > 0 && promo.referrerCustomer) {
          const referrer = await req.payload.findByID({
            collection: 'customers',
            id: toID(promo.referrerCustomer),
            overrideAccess: true,
            depth: 0,
            req,
          });
          await req.payload.update({
            collection: 'customers',
            id: referrer.id,
            data: { loyaltyPoints: Math.max(0, Number(referrer.loyaltyPoints ?? 0) + (justReversed ? -reward : reward)) },
            overrideAccess: true,
            req,
          });
        }
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
