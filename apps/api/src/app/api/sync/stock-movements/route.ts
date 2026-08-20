import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { isDuplicateIdError } from '@/lib/idempotency';

export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = await request.json();

  try {
    const doc = await payload.create({
      collection: 'stock-movements',
      data,
      user,
      overrideAccess: false,
    });
    return Response.json({ doc, idempotentReplay: false });
  } catch (err) {
    if (isDuplicateIdError(err) && typeof data?.id === 'string') {
      const existing = await payload.findByID({
        collection: 'stock-movements',
        id: data.id,
        user,
        overrideAccess: false,
      });
      return Response.json({ doc: existing, idempotentReplay: true });
    }
    throw err;
  }
}
