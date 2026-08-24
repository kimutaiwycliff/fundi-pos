import type { Access } from 'payload';
import { isTenantUser, toID } from '../lib/relations.ts';

// Every collection in this app is tenant-scoped: a user only ever sees or
// touches rows belonging to their own tenant, regardless of role. Role
// (owner/manager/cashier) governs WHAT a tenant's users can do to their own
// tenant's data, not whose data they can see — cross-tenant isolation is a
// separate, non-negotiable axis enforced here at the access-control layer
// (a Postgres-level `where` filter), not just in the UI.
//
// req.user.tenant arrives POPULATED (a full Tenant object) on a real
// authenticated request (cookie/JWT session), not as a bare id - confirmed
// the hard way: a real POST /api/users request 500'd with "invalid input
// syntax for type integer" because an earlier version of this file passed
// the whole object straight into a `{ equals: ... }` filter. Local-API-based
// tests missed this because their synthetic user objects used plain numeric
// ids, not Payload's actual populated shape - toID() must be used on every
// req.user.tenant reference here, not just in collection hooks.

// The SaaS operator's own staff (collections/PlatformAdmins.ts) - a
// structurally separate auth collection with no tenant field at all, so
// this check can never be spoofed by a tenant user's role/data. Every
// tenant-scoping helper below bypasses entirely for this user type (via
// isTenantUser's type guard, so TS also narrows req.user back to the
// tenant User type for everything after); it's the one identity meant to
// see across every tenant via Payload's own /admin panel.

export const isAuthenticated: Access = ({ req }) => Boolean(req.user);

export const ownTenantOnly: Access = ({ req }) => {
  if (!req.user) return false;
  if (!isTenantUser(req.user)) return true;
  return { tenant: { equals: toID(req.user.tenant) } };
};

export const ownerOnly: Access = ({ req }) => {
  if (!req.user) return false;
  if (!isTenantUser(req.user)) return true;
  if (req.user.role !== 'owner') return false;
  return { tenant: { equals: toID(req.user.tenant) } };
};

export const managerOrOwner: Access = ({ req }) => {
  if (!req.user) return false;
  if (!isTenantUser(req.user)) return true;
  if (req.user.role !== 'owner' && req.user.role !== 'manager') return false;
  return { tenant: { equals: toID(req.user.tenant) } };
};

// StockMovements and Orders are an append-only financial ledger — nothing
// may ever delete a row out of it. Corrections happen via new rows
// (reason: 'adjustment', or an order's status transitioning to 'refunded'/
// 'voided'), never by deleting history.
export const neverDelete: Access = () => false;
