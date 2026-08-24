import type { CollectionConfig } from 'payload';
import { isAuthenticated, ownerOnly } from '../access/index.ts';
import { toID } from '../lib/relations.ts';

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  admin: { useAsTitle: 'name' },
  access: {
    // A tenant user may only ever read their own tenant record. The one
    // exception is a platform admin (collections/PlatformAdmins.ts) - the
    // SaaS operator's own staff, a structurally separate auth collection -
    // who can read every tenant, mirroring access/index.ts's isPlatformAdmin
    // bypass since this collection has its own inline access fn rather than
    // using the shared ownTenantOnly helper. req.user.tenant arrives
    // populated (a full object) on a real request - must unwrap via toID().
    read: ({ req }) => {
      if (req.user?.collection === 'platform-admins') return true;
      if (!req.user) return false;
      return { id: { equals: toID(req.user.tenant) } };
    },
    update: ownerOnly,
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
  ],
};
