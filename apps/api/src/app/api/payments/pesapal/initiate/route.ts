import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { pesapalProvider } from '@/lib/payments/pesapal';
import { toID } from '@/lib/relations';

// Card-present payment, provider-agnostic per lib/payments/types.ts -
// Pesapal is the concrete adapter (research finding #3). UNVERIFIED against
// a real Pesapal sandbox (see lib/payments/pesapal.ts).
export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orderId } = await request.json();
  if (typeof orderId !== 'string') {
    return Response.json({ error: 'orderId is required' }, { status: 400 });
  }

  const order = await payload.findByID({ collection: 'orders', id: orderId, overrideAccess: true }).catch(() => null);
  if (!order || toID(order.tenant) !== toID(user.tenant)) {
    return Response.json({ error: 'Order not found' }, { status: 404 });
  }
  if (order.tenderType !== 'card') {
    return Response.json({ error: "Order's tenderType is not 'card'" }, { status: 400 });
  }

  const callbackUrl = process.env.PESAPAL_CALLBACK_URL || `${process.env.API_PUBLIC_URL}/api/payments/pesapal/callback`;

  try {
    const result = await pesapalProvider.initiate({
      orderId: order.id,
      amount: order.total as number,
      description: `Order ${order.id}`,
      callbackUrl,
    });

    await payload.update({
      collection: 'orders',
      id: order.id,
      data: { paymentStatus: 'pending', pesapalOrderTrackingId: result.providerReference },
      overrideAccess: true,
    });

    return Response.json({ redirectUrl: result.redirectUrl, orderTrackingId: result.providerReference });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
