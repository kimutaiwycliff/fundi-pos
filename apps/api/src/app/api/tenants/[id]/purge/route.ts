import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';

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
const TENANT_SCOPED_COLLECTIONS = [
  'audit-log',
  'shifts',
  'credit-payments',
  'stock-movements',
  'orders',
  'purchase-orders',
  'stock-transfers',
  'quotations',
  'customers',
  // Must come after 'purchase-orders' - PurchaseOrders.supplier is a
  // required, top-level relationship, so a supplier can't be deleted while
  // a purchase order still references it. Was missing from this list
  // entirely (every OTHER collection with a `tenant` relationship is
  // covered here or handled separately below) - the tenant row's own
  // delete failed with any supplier left behind, for the identical
  // NOT-NULL-vs-unsatisfiable-ON-DELETE-SET-NULL reason as the
  // store-product-overrides fix below, just one level up (blocking the
  // tenant delete itself, not a child collection's).
  'suppliers',
  // Must come before 'products' - StoreProductOverrides.product is a
  // required, top-level relationship (unlike every other collection's own
  // `product` field, which lives inside a line-items array and gets
  // cascade-deleted along with its parent row instead). With no DB-level
  // cascade on cross-collection FKs (see this file's own header comment),
  // deleting a product while an override row still references it hits
  // Postgres's NOT NULL constraint via an unsatisfiable ON DELETE SET NULL -
  // an unhandled error that surfaced as a bare 500 on every purge attempt.
  'store-product-overrides',
  'products',
  'stores',
] as const;

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

  // Wrapped end-to-end - this loop previously had no error handling at all,
  // so any failure (the store-product-overrides ordering bug fixed above,
  // or any future one) surfaced as a bare, uncaught 500 with no actionable
  // message - the one place on this whole platform where that's worst,
  // since a platform admin has no way to tell "misordered dependency" apart
  // from "genuinely stuck, needs a database check" without server log
  // access. Every dependent collection is now cleared before the request
  // returns; a failure partway through can leave a tenant partially purged,
  // but the returned message at least says which collection it stopped on.
  try {
    for (const collection of TENANT_SCOPED_COLLECTIONS) {
      await payload.delete({ collection, where: { tenant: { equals: tenant.id } }, overrideAccess: true });
    }

    // Media one document at a time, not a bulk `where` delete - R2 object
    // cleanup only happens through the storage plugin's per-document delete
    // hook (@payloadcms/storage-s3), never as a side effect of a bulk query.
    const media = await payload.find({ collection: 'media', where: { tenant: { equals: tenant.id } }, pagination: false, depth: 0, overrideAccess: true });
    for (const doc of media.docs) {
      await payload.delete({ collection: 'media', id: doc.id, overrideAccess: true });
    }

    await payload.delete({ collection: 'users', where: { tenant: { equals: tenant.id } }, overrideAccess: true });
    await payload.delete({ collection: 'tenants', id: tenant.id, overrideAccess: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Purge failed partway through: ${message}` }, { status: 500 });
  }

  return Response.json({ success: true });
}
