import type { Payload } from 'payload';

// Irreversible, full cascade delete of a tenant and every row it owns. Used
// by the console's "Delete permanently" (app/api/tenants/[id]/purge) and by
// the daily purge job for soft-deleted tenants whose 30-day grace has run
// out (lib/notifications.ts runScheduledPurges). Kept even after: the
// platform audit log, trial grants (repeat-trial history) and sent-email
// records - their tenant link just goes empty.

const TENANT_SCOPED_COLLECTIONS = [
  'audit-log',
  'shifts',
  'credit-payments',
  'stock-movements',
  'orders',
  // After orders (an order can reference the promo code it used).
  'promo-codes',
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
  // 'stores' is deleted last, after users (see below).
] as const;

type BulkDeleteResult = { errors?: { message?: string }[] };

// A bulk payload.delete({ where }) doesn't throw when individual documents
// fail (a beforeDelete guard, a foreign key) - it returns them in `errors`.
// Ignoring that is how stores silently survived every purge until now.
function assertDeleted(collection: string, result: BulkDeleteResult) {
  const failure = result.errors?.[0];
  if (failure) throw new Error(`${collection}: ${failure.message ?? 'could not be deleted'}`);
}

export async function purgeTenant(payload: Payload, tenantId: number, audit: { actorId?: number | null; reason: string }): Promise<void> {
  const tenant = await payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true });
  if (tenant.status !== 'deleted') throw new Error('Soft-delete this tenant first - only an already-deleted tenant can be purged.');
    for (const collection of TENANT_SCOPED_COLLECTIONS) {
    assertDeleted(collection, await payload.delete({ collection, where: { tenant: { equals: tenantId } }, overrideAccess: true }));
  }

  // Media one document at a time, not a bulk `where` delete - R2 object
  // cleanup only happens through the storage plugin's per-document delete
  // hook (@payloadcms/storage-s3), never as a side effect of a bulk query.
  const media = await payload.find({ collection: 'media', where: { tenant: { equals: tenantId } }, pagination: false, depth: 0, overrideAccess: true });
  for (const doc of media.docs) {
    await payload.delete({ collection: 'media', id: doc.id, overrideAccess: true });
  }

  // Subscription payments go straight through the db adapter, skipping
  // SubscriptionPayments' afterDelete hooks - those recompute paidUntil
  // and write a payment_deleted audit row per payment, pointless for a
  // tenant that's about to stop existing. Like promo-codes, these have a
  // NOT NULL tenant_id behind an ON DELETE SET NULL foreign key, so
  // leaving any behind made the final tenant delete below fail.
  await payload.db.deleteMany({ collection: 'subscription-payments', where: { tenant: { equals: tenantId } } });
  // Same NOT NULL-behind-SET NULL shape. Activity rows also reference
  // users, so they must go before the users delete below.
  await payload.db.deleteMany({ collection: 'tenant-activity-days', where: { tenant: { equals: tenantId } } });
  await payload.db.deleteMany({ collection: 'platform-tenant-notes', where: { tenant: { equals: tenantId } } });
  await payload.db.deleteMany({ collection: 'trial-extension-requests', where: { tenant: { equals: tenantId } } });
  await payload.db.deleteMany({ collection: 'devices', where: { tenant: { equals: tenantId } } });

  assertDeleted('users', await payload.delete({ collection: 'users', where: { tenant: { equals: tenantId } }, overrideAccess: true }));
  // Stores after users: Stores' beforeDelete refuses while any staff
  // member is still assigned to the branch.
  assertDeleted('stores', await payload.delete({ collection: 'stores', where: { tenant: { equals: tenantId } }, overrideAccess: true }));
  await payload.delete({ collection: 'tenants', id: tenantId, overrideAccess: true });

  await payload.create({
    collection: 'platform-audit-log',
    overrideAccess: true,
    data: {
      actor: audit.actorId ?? undefined,
      action: 'tenant_purged',
      summary: `${tenant.name} permanently deleted (${audit.reason})`,
      metadata: { tenantId, name: tenant.name, reason: audit.reason },
    },
  });
}
