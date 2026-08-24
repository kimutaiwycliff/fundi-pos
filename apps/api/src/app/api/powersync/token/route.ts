import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { signPowerSyncToken } from '@/lib/powersyncAuth';
import { checkBillingStatus } from '@/lib/billing';
import { isTenantUser, toID } from '@/lib/relations';

// The desktop till (and web dashboard, for the live-orders view) calls this
// once logged in via Payload's normal auth, then hands the returned token
// to the PowerSync client SDK. Re-called on expiry/reconnect - see
// TOKEN_TTL_SECONDS in lib/powersyncAuth.ts.
export async function GET() {
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
  const billing = checkBillingStatus(tenant.billingStatus);
  if (!billing.allowed) {
    return Response.json({ error: billing.message }, { status: 403 });
  }

  const token = await signPowerSyncToken({
    id: user.id,
    tenant: toID(user.tenant) as string | number,
    store: user.store ? (toID(user.store) as string | number) : null,
    role: user.role as string,
  });

  return Response.json({ token });
}
