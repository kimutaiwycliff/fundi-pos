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
      // A tenant's own way to "ban" a staff member (per the user's own
      // instruction) without losing their history - Orders/Shifts/AuditLog
      // all hold required relationships to a user, so an outright delete is
      // often impossible once someone has actually worked a shift (see this
      // collection's own `delete` access below). Banning is always
      // available and always reversible.
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: ['active', 'banned'],
      admin: { description: 'A banned staff member cannot log in - password or till PIN - anywhere, on any device.' },
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
      // Blocks the till's fast phone+PIN login as well, since both it
      // (apps/api/src/app/api/auth/pin-login/route.ts) and the till's
      // fully-offline cashier-switch/manager-authorize PIN checks go
      // through separate code paths that don't call payload.login() at
      // all - each has its own explicit status check alongside this one.
      // This one covers the standard email+password login every one of
      // those other paths still relies on for the initial connected login.
      async ({ user, req }) => {
        if (user.status === 'banned') {
          await req.payload.create({
            collection: 'audit-log',
            overrideAccess: true,
            data: {
              tenant: Number(toID(user.tenant)),
              actor: Number(user.id),
              action: 'login_blocked',
              entityType: 'user',
              entityId: String(user.id),
              summary: `${user.name || user.email} attempted to log in while banned`,
            },
            req,
          });
          throw new APIError('This account has been disabled. Contact your manager or owner.', 403);
        }
        return user;
      },
    ],
    afterLogin: [
      // Covers the web dashboard's own email+password login (the only path
      // that goes through payload.login()/this auth strategy) - the till's
      // phone+PIN login has its own separate audit write in that route,
      // and fully offline PIN-based cashier switching has no connection at
      // the moment it happens to log anything at all.
      async ({ user, req }) => {
        await req.payload.create({
          collection: 'audit-log',
          overrideAccess: true,
          data: {
            tenant: Number(toID(user.tenant)),
            actor: Number(user.id),
            action: 'login',
            entityType: 'user',
            entityId: String(user.id),
            summary: `${user.name || user.email} logged in`,
          },
          req,
        });
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
      // Can't ban yourself - the most common way this would otherwise go
      // wrong is an owner/manager locking themselves out of their own
      // tenant by mistake, with no other session left to undo it.
      ({ req, data, originalDoc }) => {
        if (data?.status === 'banned' && req.user && String(req.user.id) === String(originalDoc?.id)) {
          throw new APIError('You cannot ban your own account.', 400);
        }
        return data;
      },
    ],
    afterChange: [
      // Staff creation and ban/reactivate are the two lifecycle events a
      // tenant cares about auditing here - ordinary field edits (name,
      // phone, role) aren't logged, matching the narrower scope of the
      // existing price/order audit entries rather than a full version
      // history of every field on every collection.
      async ({ req, doc, previousDoc, operation }) => {
        if (!req.user) return doc;
        if (operation === 'create') {
          await req.payload.create({
            collection: 'audit-log',
            overrideAccess: true,
            data: {
              tenant: Number(toID(doc.tenant)),
              actor: Number(req.user.id),
              action: 'staff_created',
              entityType: 'user',
              entityId: String(doc.id),
              summary: `${doc.name || doc.email} added as ${doc.role}`,
            },
            req,
          });
        } else if (previousDoc && doc.status !== previousDoc.status) {
          const banned = doc.status === 'banned';
          await req.payload.create({
            collection: 'audit-log',
            overrideAccess: true,
            data: {
              tenant: Number(toID(doc.tenant)),
              actor: Number(req.user.id),
              action: banned ? 'staff_banned' : 'staff_reactivated',
              entityType: 'user',
              entityId: String(doc.id),
              summary: `${doc.name || doc.email} ${banned ? 'banned' : 'reactivated'}`,
            },
            req,
          });
        }
        return doc;
      },
    ],
    afterDelete: [
      async ({ req, doc }) => {
        if (!req.user) return;
        await req.payload.create({
          collection: 'audit-log',
          overrideAccess: true,
          data: {
            tenant: Number(toID(doc.tenant)),
            actor: Number(req.user.id),
            action: 'staff_deleted',
            entityType: 'user',
            entityId: String(doc.id),
            summary: `${doc.name || doc.email} deleted`,
          },
          req,
        });
      },
    ],
    beforeDelete: [
      // Same reasoning as the self-ban guard above, for the more permanent
      // action.
      ({ req, id }) => {
        if (req.user && String(req.user.id) === String(id)) {
          throw new APIError('You cannot delete your own account.', 400);
        }
      },
      // Orders/Shifts/AuditLog all hold required relationships to a user
      // (cashier/actor/settledBy) - Postgres's own foreign-key constraint
      // already refuses a delete that would orphan them, which is correct,
      // but Payload's error handler masks the real reason as a generic
      // "Something went wrong." (confirmed live: deleting a cashier with
      // real order history 500'd with no useful detail at all). Checking
      // first and throwing a real APIError turns that into an actionable
      // message instead of a dead end.
      async ({ req, id }) => {
        const [orders, shifts, auditLog, settled] = await Promise.all([
          req.payload.find({ collection: 'orders', where: { cashier: { equals: id } }, limit: 1, overrideAccess: true }),
          req.payload.find({ collection: 'shifts', where: { cashier: { equals: id } }, limit: 1, overrideAccess: true }),
          req.payload.find({ collection: 'audit-log', where: { actor: { equals: id } }, limit: 1, overrideAccess: true }),
          req.payload.find({ collection: 'orders', where: { settledBy: { equals: id } }, limit: 1, overrideAccess: true }),
        ]);
        if (orders.totalDocs > 0 || shifts.totalDocs > 0 || auditLog.totalDocs > 0 || settled.totalDocs > 0) {
          throw new APIError(
            'This staff member has sales, shift, or audit history and cannot be deleted. Ban them instead to revoke access while keeping records intact.',
            400,
          );
        }
      },
    ],
  },
};
