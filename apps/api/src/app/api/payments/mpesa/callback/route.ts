import config from '@payload-config';
import { getPayload } from 'payload';
import { parseStkCallback } from '@/lib/daraja';

// Safaricom calls this directly (not the till) once the customer has
// approved/declined/timed-out the STK prompt on their phone - there is no
// "user session" here, this endpoint's only real authorization is that it
// can only ever move a specific, already-known order from 'pending' to
// 'paid'/'failed', nothing else. UNVERIFIED against a real Daraja callback
// - the shape is per Safaricom's documented callback contract
// (lib/daraja.ts's parseStkCallback), never received from a live sandbox.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parseStkCallback(body);

  // Safaricom expects a 200 response regardless, or it will retry - always
  // acknowledge, even for a payload we can't match to an order.
  if (!parsed) {
    return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }

  const payload = await getPayload({ config });
  const matches = await payload.find({
    collection: 'orders',
    where: { mpesaCheckoutRequestId: { equals: parsed.checkoutRequestId } },
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

  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}
