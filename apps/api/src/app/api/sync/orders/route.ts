import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { isDuplicateIdError } from '@/lib/idempotency';

// Ingestion endpoint for the desktop till's upload queue (wired up in
// Phase 2/4). Deliberately a thin wrapper around the Local API rather than
// exposing Payload's default REST create directly, so it can translate a
// duplicate client-generated UUID into an idempotent no-op instead of a
// client-visible error.
export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = await request.json();

  try {
    const doc = await payload.create({
      collection: 'orders',
      data,
      user,
      overrideAccess: false,
    });
    return Response.json({ doc, idempotentReplay: false });
  } catch (err) {
    if (isDuplicateIdError(err) && typeof data?.id === 'string') {
      const existing = await payload.findByID({
        collection: 'orders',
        id: data.id,
        user,
        overrideAccess: false,
      });
      return Response.json({ doc: existing, idempotentReplay: true });
    }
    throw err;
  }
}
