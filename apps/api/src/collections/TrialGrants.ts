import type { CollectionConfig } from 'payload';

// Every free trial ever granted - by self-serve signup or by the operator -
// kept even after the tenant is purged (tenant is optional and only set
// while it exists), so "this email/phone already had a trial" stays
// answerable. Matching is on the canonical email (gmail dots and +tags
// ignored), the owner's phone, and - as a weaker hint - the signup IP.
// Written by lib/trialGrants.ts only; platform admins can read it.
export const TrialGrants: CollectionConfig = {
  slug: 'trial-grants',
  admin: { useAsTitle: 'businessName', defaultColumns: ['businessName', 'emailCanonical', 'source', 'createdAt'] },
  defaultSort: '-createdAt',
  access: {
    read: ({ req }) => req.user?.collection === 'platform-admins',
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', index: true },
    { name: 'businessName', type: 'text', required: true },
    { name: 'emailCanonical', type: 'text', index: true },
    { name: 'emailRaw', type: 'text' },
    { name: 'phone', type: 'text', index: true },
    { name: 'ip', type: 'text', index: true },
    { name: 'source', type: 'select', required: true, options: ['signup', 'operator'] },
    { name: 'trialDays', type: 'number' },
    // Operator granted it knowing it was a repeat.
    { name: 'repeatOverride', type: 'checkbox', defaultValue: false },
  ],
};
