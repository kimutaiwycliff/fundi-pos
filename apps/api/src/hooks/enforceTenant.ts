import type { CollectionBeforeChangeHook } from 'payload';
import { isTenantUser, toID } from '../lib/relations.ts';

// Never trust a client-submitted `tenant` (or, where applicable, `store`)
// field - always derive it from the authenticated user. Access-control's
// `create` check only validates ROLE, not that submitted field VALUES match
// the requesting user (a filter like `{ tenant: { equals: toID(...) } }` is
// meaningful for read/update/delete WHERE clauses, but a create has no
// existing row to filter against). Without this, a client could submit an
// arbitrary tenant id on create and it would silently succeed - caught
// while building the web dashboard's product-create form, not by a test.
//
// `requireOwnStore: true` additionally forces `store` to the user's own
// store when they have one assigned (cashiers, store-level managers).
// Org-level users (store: null) keep whatever store they submitted -
// trusted for now; validating that store actually belongs to their tenant
// is a Phase 6 hardening item, not blocking here.
export function enforceOwnTenant(options: { requireOwnStore?: boolean } = {}): CollectionBeforeChangeHook {
  return ({ data, req, operation }) => {
    if (operation === 'create' && req.user) {
      if (!isTenantUser(req.user)) {
        throw new Error('A platform admin cannot create tenant-scoped records directly - no tenant to attribute them to.');
      }
      data.tenant = toID(req.user.tenant);
      if (options.requireOwnStore && req.user.store) {
        data.store = toID(req.user.store);
      }
    }
    return data;
  };
}
