import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { signPowerSyncToken } from '@/lib/powersyncAuth';
import { checkTenantAccess } from '@/lib/billing';
import { isTenantUser, toID } from '@/lib/relations';

// The desktop till (and web dashboard, for the live-orders view) calls this
// once logged in via Payload's normal auth, then hands the returned token
// to the PowerSync client SDK. Re-called on expiry/reconnect - see
// TOKEN_TTL_SECONDS in lib/powersyncAuth.ts.
//
// ?storeId=X lets a user with NO fixed store (owner/manager overseeing
// multiple branches - Users.store is nullable for exactly this) pick which
// branch's stock_movements/orders this till should sync right now. A
// cashier with a fixed store can never override it this way - `storeId` is
// only consulted when `user.store` is null in the first place, so a
// tampered request just gets ignored, not honored.
export async function GET(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });

  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // A till already mid-session (holding a still-valid Payload JWT) would
  // otherwise keep syncing indefinitely even after cancellation - this is
  // the re-check that actually stops it, since PowerSync re-calls this
  // every ~1 hour (TOKEN_TTL_SECONDS) on expiry/reconnect regardless of
  // whether the till's own Payload session is still valid.
  const tenant = await payload.findByID({ collection: 'tenants', id: toID(user.tenant), overrideAccess: true });
  const billing = checkTenantAccess(tenant);
  if (!billing.allowed) {
    return Response.json({ error: billing.message }, { status: 403 });
  }
  // Same re-check pattern as billing status just above, for the same
  // reason: a till already mid-session keeps this token indefinitely
  // otherwise, even after a manager bans the person using it. Re-checked
  // here (not just at login) since a ban should take effect within this
  // token's ~1hr lifetime, not only on the next fresh login.
  if (user.status === 'banned') {
    return Response.json({ error: 'This account has been disabled.' }, { status: 403 });
  }

  let storeId: string | number | null = user.store ? (toID(user.store) as string | number) : null;
  if (user.store == null) {
    const requestedStoreId = new URL(request.url).searchParams.get('storeId');
    if (requestedStoreId) {
      const store = await payload.findByID({ collection: 'stores', id: requestedStoreId, overrideAccess: true }).catch(() => null);
      if (!store || toID(store.tenant) !== toID(user.tenant)) {
        return Response.json({ error: 'Invalid store' }, { status: 403 });
      }
      storeId = store.id;
    }
  }

  const token = await signPowerSyncToken({
    id: user.id,
    tenant: toID(user.tenant) as string | number,
    store: storeId,
    role: user.role as string,
  });

  return Response.json({ token });
}
