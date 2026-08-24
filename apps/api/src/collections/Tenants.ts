import type { CollectionConfig } from 'payload';
import { toID } from '../lib/relations.ts';

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  admin: { useAsTitle: 'name' },
  access: {
    // A tenant user may only ever read/update their own tenant record,
    // scoped by `id` - Tenants has no `tenant` relationship field (a
    // tenant doesn't belong to itself), so the shared ownerOnly helper
    // (which filters by `{ tenant: { equals: ... } }`, correct for every
    // OTHER collection) doesn't apply here. update reused it anyway until
    // now, which silently 500'd on the very first real PATCH ever issued
    // against this collection ("Cannot find field for path at tenant" -
    // Postgres/Drizzle rejecting a WHERE clause on a column that doesn't
    // exist) - caught live wiring up the dashboard's Settings page, the
    // first thing in this whole project to ever call it.
    read: ({ req }) => {
      if (req.user?.collection === 'platform-admins') return true;
      if (!req.user) return false;
      return { id: { equals: toID(req.user.tenant) } };
    },
    update: ({ req }) => {
      if (req.user?.collection === 'platform-admins') return true;
      if (!req.user || req.user.role !== 'owner') return false;
      return { id: { equals: toID(req.user.tenant) } };
    },
    create: () => false, // tenants are created by the signup/billing flow, not via the API
    delete: () => false,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'subscriptionTier',
      type: 'select',
      required: true,
      defaultValue: 'trial',
      options: ['trial', 'starter', 'growth', 'enterprise'],
    },
    {
      name: 'billingStatus',
      type: 'select',
      required: true,
      defaultValue: 'trialing',
      options: ['active', 'trialing', 'past_due', 'canceled'],
    },
    {
      // Printed on every receipt, above the line items - typically a
      // physical address/phone/KRA PIN, since `name` alone is already the
      // header's title line. Synced to the till (docker/powersync/
      // sync-config.yaml) so printing works fully offline once it's synced
      // down once.
      name: 'receiptHeader',
      type: 'textarea',
      admin: { description: 'Printed at the top of every receipt, below the business name (e.g. address, phone).' },
    },
    {
      name: 'receiptFooter',
      type: 'textarea',
      admin: { description: 'Printed at the bottom of every receipt (e.g. "Thank you for your business!", return policy).' },
    },
  ],
};
