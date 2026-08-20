import type { CollectionConfig } from 'payload';
import { isAuthenticated, ownerOnly } from '../access/index.ts';

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  admin: { useAsTitle: 'name' },
  access: {
    // A user may only ever read their own tenant record - there is no
    // superadmin bypass at this layer (ops access goes through direct DB
    // access, not the API).
    read: ({ req }) => {
      if (!req.user) return false;
      return { id: { equals: req.user.tenant } };
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
