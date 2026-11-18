import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { purgeTenant } from '@/lib/purgeTenant';

// Irreversible, full cascade delete of a tenant and every row it owns -
// reachable from web via the platform proxy at /api/platform/tenants/:id/
// purge (forwards to this exact API URL). Only ever called from the
// platform admin console's "Delete permanently" action, gated client-side
// to a soft-deleted tenant plus a typed-name confirmation - re-checked
// here server-side too, since this is the one truly irreversible action
// in the whole platform.
//
// Tenants.delete is hard-disabled (`() => false`) and no DB-level cascade
// exists for any tenant_id foreign key (every one is NOT NULL with an
// ON DELETE set null that Postgres can never actually satisfy - a raw
// delete with any dependent row left would fail outright, not silently
// cascade). Products.ts/Users.ts each have a beforeDelete guard blocking
// deletion while stock-movements/orders/shifts/audit-log reference them -
// those hooks still run under overrideAccess (only access *checks* are
// bypassed), so this deletes in an order where every guarded collection's
// dependents are already gone by the time it's their turn.
//
// Deliberately excluded: platform-audit-log (the SaaS operator's own
// permanent record that this tenant was ever deleted - purging it at the
// moment of deletion would defeat its own purpose; its own `tenant` field
// is nullable specifically so its FK's ON DELETE SET NULL can actually
// fire here instead of blocking the tenant delete, and `summary` already
// holds a self-contained human-readable record independent of the live
// relationship) and sync-log (no `tenant` field at all - it's keyed by
// terminal id, diagnostic-only, not worth a fragile cross-collection join
// to clean up).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (user?.collection !== 'platform-admins') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const tenant = await payload.findByID({ collection: 'tenants', id, overrideAccess: true }).catch(() => null);
  if (!tenant) {
    return Response.json({ error: 'Tenant not found' }, { status: 404 });
  }
  if (tenant.status !== 'deleted') {
    return Response.json({ error: 'Soft-delete this tenant first - permanent delete is only available for an already-deleted tenant.' }, { status: 400 });
  }
  // A failure partway through can leave a tenant partially purged; the
  // message at least says which collection it stopped on.
  try {
    await purgeTenant(payload, Number(tenant.id), { actorId: Number(user.id), reason: 'deleted by an operator' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Purge failed partway through: ${message}` }, { status: 500 });
  }
  return Response.json({ success: true });
}
