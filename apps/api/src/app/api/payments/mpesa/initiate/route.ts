import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { initiateStkPush } from '@/lib/daraja';
import { toID } from '@/lib/relations';

// spec Section 6.5: "M-Pesa STK Push... requires connectivity at time of
// transaction". This route is only reachable when the till is online (it's
// a direct HTTP call), which is the natural offline gate - no separate
// "are we online" check needed. UNVERIFIED against the real Daraja
// sandbox/production (see lib/daraja.ts).
export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orderId, phone } = await request.json();
  if (typeof orderId !== 'string' || typeof phone !== 'string') {
    return Response.json({ error: 'orderId and phone are required' }, { status: 400 });
  }

  const order = await payload.findByID({ collection: 'orders', id: orderId, overrideAccess: true }).catch(() => null);
  if (!order || toID(order.tenant) !== toID(user.tenant)) {
    return Response.json({ error: 'Order not found' }, { status: 404 });
  }
  if (order.tenderType !== 'mpesa') {
    return Response.json({ error: "Order's tenderType is not 'mpesa'" }, { status: 400 });
  }

  const callbackUrl = process.env.DARAJA_CALLBACK_URL || `${process.env.API_PUBLIC_URL}/api/payments/mpesa/callback`;

  try {
    const stkResponse = await initiateStkPush({
      phone,
      amount: order.total as number,
      accountReference: order.id,
      description: `Order ${order.id}`,
      callbackUrl,
    });

    await payload.update({
      collection: 'orders',
      id: order.id,
      data: { mpesaCheckoutRequestId: stkResponse.CheckoutRequestID, paymentStatus: 'pending' },
      overrideAccess: true,
    });

    return Response.json({ checkoutRequestId: stkResponse.CheckoutRequestID });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
