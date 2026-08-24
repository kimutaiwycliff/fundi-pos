import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { signPowerSyncToken } from '@/lib/powersyncAuth';
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

  const token = await signPowerSyncToken({
    id: user.id,
    tenant: toID(user.tenant) as string | number,
    store: user.store ? (toID(user.store) as string | number) : null,
    role: user.role as string,
  });

  return Response.json({ token });
}
