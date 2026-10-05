import type { CollectionConfig } from 'payload';
import { APIError } from 'payload';
import { hasAddon, normalizePromoCode } from '@hardware-pos/business-logic';
import { managerOrOwner, ownTenantOnly } from '../access/index.ts';
import { enforceOwnTenant } from '../hooks/enforceTenant.ts';
import { isTenantUser, toID } from '../lib/relations.ts';

// Sell Online add-on: discount codes for campaigns (BLACKFRIDAY), influencers
// (JANE10) and referrals (a code tied to an existing customer, who earns
// loyalty points whenever someone else uses it). Applied at checkout on
// every till - Orders.ts resolves the code server-side and recomputes the
// discount itself, so a client can never invent or inflate one.
export const PromoCodes: CollectionConfig = {
  slug: 'promo-codes',
  admin: { useAsTitle: 'code', defaultColumns: ['code', 'label', 'kind', 'value', 'usesCount', 'active'] },
  access: {
    // Cashiers need to read codes to validate them at the till.
    read: ownTenantOnly,
    create: managerOrOwner,
    update: managerOrOwner,
    // Never deleted - orders reference them for reporting. Deactivate instead.
    delete: () => false,
  },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'code', type: 'text', required: true, index: true },
    { name: 'label', type: 'text', admin: { description: 'Who/what this is for, e.g. "Black Friday" or "Jane (influencer)".' } },
    { name: 'kind', type: 'select', required: true, defaultValue: 'percentage', options: ['percentage', 'flat'] },
    { name: 'value', type: 'number', required: true, min: 0, admin: { description: 'Percent off (0-100) or KES off.' } },
    { name: 'minSpend', type: 'number', min: 0, admin: { description: 'Optional minimum basket value in KES.' } },
    { name: 'startsAt', type: 'date' },
    { name: 'endsAt', type: 'date' },
    { name: 'maxUses', type: 'number', min: 0, admin: { description: 'Optional cap on total uses. Empty or 0 = unlimited.' } },
    {
      // Maintained only by Orders.ts's afterChange hook (+1 on a sale, -1
      // when that sale is refunded/voided) - never client-writable.
      name: 'usesCount',
      type: 'number',
      defaultValue: 0,
      access: { create: () => false, update: () => false },
      admin: { readOnly: true },
    },
    { name: 'active', type: 'checkbox', defaultValue: true },
    {
      name: 'referrerCustomer',
      type: 'relationship',
      relationTo: 'customers',
      admin: { description: 'Referral code: this customer earns points each time someone else uses it.' },
    },
    { name: 'referrerRewardPoints', type: 'number', defaultValue: 0, min: 0 },
  ],
  hooks: {
    beforeChange: [
      enforceOwnTenant(),
      async ({ data, req, operation, originalDoc }) => {
        const tenantId = toID(data.tenant ?? originalDoc?.tenant);
        if (isTenantUser(req.user)) {
          const tenant = await req.payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true, req });
          if (!hasAddon(tenant, 'sell_online')) {
            // Deliberately neutral - a shop without the add-on shouldn't learn it exists.
            throw new APIError("Promo codes aren't available for this shop.", 403);
          }
        }

        if (data.code !== undefined) {
          const code = normalizePromoCode(data.code);
          if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
            throw new APIError('Promo code must be 3-30 letters, numbers, hyphens or underscores.', 400);
          }
          data.code = code;
          const clash = await req.payload.find({
            collection: 'promo-codes',
            where: {
              tenant: { equals: tenantId },
              code: { equals: code },
              ...(operation === 'update' && originalDoc ? { id: { not_equals: originalDoc.id } } : {}),
            },
            limit: 1,
            depth: 0,
            overrideAccess: true,
            req,
          });
          if (clash.totalDocs > 0) throw new APIError(`Promo code ${code} already exists.`, 400);
        }

        const kind = data.kind ?? originalDoc?.kind;
        const value = Number(data.value ?? originalDoc?.value ?? 0);
        if (kind === 'percentage' && value > 100) throw new APIError('A percentage discount cannot be more than 100.', 400);

        const startsAt = data.startsAt ?? originalDoc?.startsAt;
        const endsAt = data.endsAt ?? originalDoc?.endsAt;
        if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
          throw new APIError('The end date must be after the start date.', 400);
        }

        if (data.referrerCustomer) {
          const referrer = await req.payload.findByID({
            collection: 'customers',
            id: toID(data.referrerCustomer),
            overrideAccess: true,
            depth: 0,
            req,
          });
          if (String(toID(referrer.tenant)) !== String(tenantId)) {
            throw new APIError('Referrer must be one of your own customers.', 400);
          }
        }
        return data;
      },
    ],
  },
};
