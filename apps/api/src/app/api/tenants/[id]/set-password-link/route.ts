import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { sendOwnerWelcome } from '@/lib/notifications';
import { createSetPasswordLink } from '@/lib/setPasswordLink';

// PLATFORM-ADMIN ONLY. A fresh set-password link for the tenant's owner
// (the first one expired, or they never got the email) - emailed to them
// and returned so the operator can send it over WhatsApp too.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (user?.collection !== 'platform-admins') return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = Number((await params).id);
  const owners = await payload.find({
    collection: 'users',
    where: { tenant: { equals: tenantId }, role: { equals: 'owner' }, status: { equals: 'active' } },
    sort: 'createdAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const owner = owners.docs[0];
  if (!owner?.email) return Response.json({ error: 'This tenant has no active owner with an email.' }, { status: 404 });
  const link = await createSetPasswordLink(payload, String(owner.email));
  const emailed = await sendOwnerWelcome(payload, { tenantId, ownerEmail: String(owner.email), ownerName: (owner.name as string) ?? null, link, trialDays: 0, resend: true });
  return Response.json({ setPasswordLink: link, email: owner.email, emailed });
}
