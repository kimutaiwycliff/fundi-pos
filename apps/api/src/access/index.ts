import type { Access } from 'payload'

// Every collection in this app is tenant-scoped: a user only ever sees or
// touches rows belonging to their own tenant, regardless of role. Role
// (owner/manager/cashier) governs WHAT a tenant's users can do to their own
// tenant's data, not whose data they can see — cross-tenant isolation is a
// separate, non-negotiable axis enforced here at the access-control layer
// (a Postgres-level `where` filter), not just in the UI.

export const isAuthenticated: Access = ({ req }) => Boolean(req.user)

export const ownTenantOnly: Access = ({ req }) => {
  if (!req.user) return false
  return { tenant: { equals: req.user.tenant } }
}

export const ownerOnly: Access = ({ req }) => {
  if (!req.user) return false
  if (req.user.role !== 'owner') return false
  return { tenant: { equals: req.user.tenant } }
}

export const managerOrOwner: Access = ({ req }) => {
  if (!req.user) return false
  if (req.user.role !== 'owner' && req.user.role !== 'manager') return false
  return { tenant: { equals: req.user.tenant } }
}

// StockMovements and Orders are an append-only financial ledger — nothing
// may ever delete a row out of it. Corrections happen via new rows
// (reason: 'adjustment', or an order's status transitioning to 'refunded'/
// 'voided'), never by deleting history.
export const neverDelete: Access = () => false
