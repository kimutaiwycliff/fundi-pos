import type { CollectionConfig } from 'payload';
import { APIError } from 'payload';
import { managerOrOwner, ownTenantOnly } from '../access/index.ts';
import { hashPin } from '../lib/pin.ts';
import { enforceOwnTenant } from '../hooks/enforceTenant.ts';
import { checkBillingStatus } from '../lib/billing.ts';
import { toID } from '../lib/relations.ts';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true, // email/password login, for the web dashboard
  admin: { useAsTitle: 'email' },
  access: {
    read: ownTenantOnly,
    create: managerOrOwner,
    update: managerOrOwner,
    delete: managerOrOwner,
  },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    {
      name: 'store',
      type: 'relationship',
      relationTo: 'stores',
      // nullable for org-level admins (owner/manager overseeing multiple stores)
      required: false,
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'cashier',
      options: ['owner', 'manager', 'cashier'],
    },
    {
      // Shown at the till (and everywhere else in the dashboard) instead of
      // email once set - a cashier's own login email is rarely what a
      // shopkeeper wants printed on a receipt or shown on a shared terminal.
      // Optional so existing/seeded staff created before this field existed
      // aren't broken; every display site falls back to email when absent.
      name: 'name',
      type: 'text',
      admin: { description: "Displayed at the till instead of the staff member's email." },
    },
    {
      // A real phone number is effectively a personal identifier already -
      // DB-wide uniqueness (not just per-tenant) is the correct constraint,
      // not an oversight. Optional for now so existing/seeded staff aren't
      // broken; intended to become the till's fast PIN-login identifier.
      name: 'phone',
      type: 'text',
      unique: true,
      admin: { description: 'e.g. 0712345678 - used for fast PIN login at the till.' },
    },
    {
      // Input-only: never persisted. A beforeChange hook hashes this into
      // pinHash and discards the plaintext before the row is written.
      name: 'pin',
      type: 'text',
      virtual: true,
      admin: { description: 'Fast till PIN login (4-6 digits). Never stored in plaintext.' },
    },
    {
      name: 'pinHash',
      type: 'text',
      admin: { readOnly: true, hidden: true },
      // admin.hidden only hides it from the admin UI - without this, the
      // scrypt hash of a 4-6 digit PIN (small enough to brute-force
      // offline in seconds) was coming back in every REST/GraphQL response
      // that includes a user, including a cashier's own /api/users/me.
      // Caught live while smoke-testing the containerized web dashboard's
      // login route. overrideAccess: true callers (the manager-PIN
      // authorize-status route, PowerSync's direct-Postgres replication)
      // are unaffected - this only governs the ordinary API.
      access: { read: () => false },
    },
  ],
  hooks: {
    beforeLogin: [
      // billingStatus was previously just a label - see lib/billing.ts.
      // Blocking a canceled tenant's login here, not in access control,
      // covers every route uniformly (dashboard AND till both call this
      // same Payload auth strategy) without touching every collection.
      async ({ user, req }) => {
        const tenant = await req.payload.findByID({
          collection: 'tenants',
          id: toID(user.tenant),
          overrideAccess: true,
        });
        const check = checkBillingStatus(tenant.billingStatus);
        if (!check.allowed) {
          // A plain Error gets masked as a generic 500 "Something went
          // wrong" by Payload's error handler (only its own typed/
          // "operational" errors are considered safe to show a client) -
          // confirmed live: the real message never reached the caller
          // until switched to APIError.
          throw new APIError(check.message ?? 'This account is not active.', 403);
        }
        return user;
      },
    ],
    beforeChange: [
      // Every other collection already forces `tenant` from the requesting
      // user on create - this one never did, meaning a new staff member's
      // tenant had to be submitted by the client with nothing stopping it
      // from being a DIFFERENT tenant's id. Caught live: creating a staff
      // member through the dashboard's own Add-staff dialog 400'd with
      // "Tenant is required" (it never sends one, exactly as it shouldn't
      // have to), which is what surfaced the gap.
      enforceOwnTenant(),
      ({ data }) => {
        if (data?.pin) {
          data.pinHash = hashPin(String(data.pin));
          delete data.pin;
        }
        return data;
      },
    ],
  },
};
