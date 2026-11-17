import type { CollectionConfig } from 'payload';
import { APIError } from 'payload';
import { allow, resetLimit } from '../lib/rateLimit.ts';
import { TOTP_REQUIRED_MESSAGE, verifyTotp } from '../lib/totp.ts';

// Hidden from every API read; only server code (overrideAccess) sees them.
const secret = { read: () => false, update: () => false };

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
  fields: [
    { name: 'name', type: 'text', required: true },
    // 2-step sign-in (authenticator app). Managed by /api/platform-2fa.
    { name: 'totpEnabled', type: 'checkbox', defaultValue: false, access: { update: () => false } },
    { name: 'totpSecret', type: 'text', access: secret, admin: { hidden: true } },
    { name: 'totpPendingSecret', type: 'text', access: secret, admin: { hidden: true } },
  ],
  hooks: {
    beforeLogin: [
      // With 2-step on, the password alone isn't enough - the login request
      // must also carry `totp`. Enforced here, in the API, so it covers the
      // console, the REST endpoint and Payload's /admin alike (/admin has no
      // code field; operators reach it via the console's handoff instead).
      async ({ user, req }) => {
        if (!user.totpEnabled) return user;
        const full = await req.payload.findByID({ collection: 'platform-admins', id: user.id, overrideAccess: true, showHiddenFields: true, depth: 0 });
        const code = (req.data as { totp?: unknown } | undefined)?.totp;
        const key = `totp:${user.id}`;
        if (typeof code !== 'string' || !code.trim()) throw new APIError(TOTP_REQUIRED_MESSAGE, 401);
        if (!allow(key, 5, 15 * 60 * 1000)) throw new APIError('Too many wrong codes - try again in 15 minutes.', 429);
        if (!full.totpSecret || !verifyTotp(String(full.totpSecret), code)) throw new APIError('That code is wrong or has expired.', 401);
        resetLimit(key);
        return user;
      },
    ],
  },
};
