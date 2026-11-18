import type { CollectionConfig } from 'payload';

// Every email the platform sends (to tenant owners and to the operator),
// with a unique `key` so scheduled reminders go out exactly once - e.g.
// "trial_ending:12:2026-11-20:3d" can only ever be written one time.
// Written by lib/email.ts only; platform admins can read it (the tenant
// page's "Emails sent" card).
export const PlatformNotifications: CollectionConfig = {
  slug: 'platform-notifications',
  admin: { useAsTitle: 'subject', defaultColumns: ['kind', 'to', 'status', 'createdAt'] },
  defaultSort: '-createdAt',
  access: {
    read: ({ req }) => req.user?.collection === 'platform-admins',
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    // Optional: operator-only emails (digest, sign-up alerts) aren't about one tenant.
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', index: true },
    { name: 'kind', type: 'text', required: true, index: true },
    { name: 'key', type: 'text', required: true, unique: true },
    { name: 'to', type: 'text', required: true },
    { name: 'subject', type: 'text', required: true },
    // sent: Brevo accepted it. logged: no BREVO_API_KEY (dev) - printed instead. failed: Brevo refused/unreachable.
    { name: 'status', type: 'select', required: true, options: ['sent', 'logged', 'failed'] },
    { name: 'error', type: 'text' },
    { name: 'providerId', type: 'text' },
  ],
};
