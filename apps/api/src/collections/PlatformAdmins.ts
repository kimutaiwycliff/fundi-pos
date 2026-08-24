import type { CollectionConfig } from 'payload';

// The SaaS operator's own staff, not a tenant's staff - deliberately a
// separate auth-enabled collection with no `tenant` field, so a platform
// admin's identity is structurally distinct from every tenant-scoped Users
// row. access/index.ts's shared helpers (and Tenants.ts's/Shifts.ts's own
// inline access fns) all special-case `req.user.collection ===
// 'platform-admins'` to bypass tenant scoping entirely - this is the one
// user type meant to see across every tenant.
//
// No self-serve create route: the first (and any subsequent) platform admin
// is provisioned via a one-off Local API script run directly against the
// server, the same way Tenants themselves are provisioned - never through
// the public REST API.
export const PlatformAdmins: CollectionConfig = {
  slug: 'platform-admins',
  auth: true,
  admin: { useAsTitle: 'email' },
  access: {
    // Payload's own admin UI reads the logged-in user's own doc (/me) to
    // render the session - only self-read, never another admin's record.
    read: ({ req }) => (req.user ? { id: { equals: req.user.id } } : false),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [{ name: 'name', type: 'text', required: true }],
};
