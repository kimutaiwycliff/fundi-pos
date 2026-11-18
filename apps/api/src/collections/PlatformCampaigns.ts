import type { CollectionConfig } from 'payload';

// One-off emails the operator sends to a group of shops (Campaigns page):
// e.g. "help getting your first sale" to shops that never started. Each
// send is recorded here; each shop's copy goes out once (key
// campaign:<id>:<tenant>) and skips shops that unsubscribed.
export const PlatformCampaigns: CollectionConfig = {
  slug: 'platform-campaigns',
  admin: { useAsTitle: 'subject', defaultColumns: ['subject', 'segment', 'recipients', 'createdAt'] },
  defaultSort: '-createdAt',
  access: {
    read: ({ req }) => req.user?.collection === 'platform-admins',
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'subject', type: 'text', required: true },
    { name: 'body', type: 'textarea', required: true },
    { name: 'segment', type: 'text', required: true },
    { name: 'recipients', type: 'number', required: true },
    { name: 'skippedOptedOut', type: 'number', defaultValue: 0 },
    { name: 'sentBy', type: 'relationship', relationTo: 'platform-admins' },
  ],
};
