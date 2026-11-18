import config from '@payload-config';
import { getPayload } from 'payload';
import { verifyUnsubscribeToken } from '@/lib/campaigns';

// PUBLIC (no login): the one-click unsubscribe link in campaign emails.
// The token is an HMAC of the tenant ID, so it can't be guessed or reused
// for another shop. Stops campaigns only - billing emails still go out.
export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { token } = (await request.json().catch(() => ({}))) as { token?: string };
  const tenantId = token ? verifyUnsubscribeToken(payload, token) : null;
  if (!tenantId) return Response.json({ error: 'This unsubscribe link is not valid.' }, { status: 400 });
  const tenant = await payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true }).catch(() => null);
  if (!tenant) return Response.json({ error: 'This shop no longer exists.' }, { status: 404 });
  if (!tenant.marketingOptOut) {
    await payload.update({
      collection: 'tenants',
      id: tenantId,
      data: { marketingOptOut: true },
      overrideAccess: true,
      context: { skipPlatformAudit: true },
    });
  }
  return Response.json({ shop: tenant.name });
}
