import type { CollectionConfig } from 'payload';

// One row per person per Nairobi day they used Fundi POS - the raw material
// for the /platform console's "last active", "active days" and health
// scores. Written only by lib/activity.ts (a raw upsert, so the unique
// user+day index matters); never through the REST API.
//   logins  sign-ins that day (email, PIN)
//   pings   ~5-minute stretches of activity (dashboard visits, till calls)
//   sources which apps they used: web / desktop / mobile
export const TenantActivityDays: CollectionConfig = {
  slug: 'tenant-activity-days',
  admin: { hidden: true },
  access: {
    read: ({ req }) => req.user?.collection === 'platform-admins',
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  indexes: [{ fields: ['user', 'day'], unique: true }],
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true },
    // Nairobi calendar date, YYYY-MM-DD.
    { name: 'day', type: 'text', required: true, index: true },
    { name: 'logins', type: 'number', required: true, defaultValue: 0 },
    { name: 'pings', type: 'number', required: true, defaultValue: 0 },
    { name: 'sources', type: 'json' },
    { name: 'firstSeenAt', type: 'date' },
    { name: 'lastSeenAt', type: 'date', index: true },
  ],
};
