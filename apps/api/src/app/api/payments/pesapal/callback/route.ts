import config from '@payload-config';
import { getPayload } from 'payload';
import { pesapalProvider } from '@/lib/payments/pesapal';

// Pesapal's IPN hits this URL with query params, not a JSON body - see
// lib/payments/pesapal.ts's parsePesapalIpnQuery. Same "always 200, look the
// order up ourselves" shape as the M-Pesa callback. UNVERIFIED - no real
// Pesapal IPN has ever reached this route.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = await pesapalProvider.parseCallback(searchParams);

  if (!parsed) {
    return Response.json({ status: 'received' });
  }

  const payload = await getPayload({ config });
  const matches = await payload.find({
    collection: 'orders',
    where: { pesapalOrderTrackingId: { equals: parsed.providerReference } },
    limit: 1,
    overrideAccess: true,
  });
  const order = matches.docs[0];

  if (order) {
    await payload.update({
      collection: 'orders',
      id: order.id,
      data: { paymentStatus: parsed.succeeded ? 'paid' : 'failed' },
      overrideAccess: true,
    });
  }

  return Response.json({ status: 'received' });
}
