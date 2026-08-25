import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { verifyPin } from '@/lib/pin';
import { isTenantUser, toID } from '@/lib/relations';

// Marks a credit ("pay later") sale as paid - manager/owner only, per the
// user's own instruction. Two authorization paths, both ending up at the
// same overrideAccess update + audit trail:
//   - The requesting session is already a manager/owner (the web dashboard's
//     normal case - a real back-office login already proves this, no PIN
//     needed) - settle under their own identity.
//   - The requesting session is a cashier (the till's case - a customer
//     paying off their tab at the counter) - same manager-PIN pattern as
//     authorize-status/route.ts, re-verified server-side regardless of any
//     local pre-check.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const requestingTenant = toID(user.tenant);

  let authorizedById: number;
  if (user.role === 'owner' || user.role === 'manager') {
    authorizedById = user.id;
  } else {
    const { managerId, pin } = await request.json().catch(() => ({}));
    if (typeof managerId !== 'number' && typeof managerId !== 'string') {
      return Response.json({ error: 'managerId is required' }, { status: 400 });
    }
    if (typeof pin !== 'string' || pin.length === 0) {
      return Response.json({ error: 'pin is required' }, { status: 400 });
    }

    const manager = await payload.findByID({ collection: 'users', id: managerId, overrideAccess: true }).catch(() => null);
    if (
      !manager ||
      toID(manager.tenant) !== requestingTenant ||
      (manager.role !== 'manager' && manager.role !== 'owner')
    ) {
      return Response.json({ error: 'Manager not found for this tenant' }, { status: 403 });
    }
    if (!manager.pinHash || !verifyPin(pin, manager.pinHash)) {
      return Response.json({ error: 'Invalid manager PIN' }, { status: 403 });
    }
    authorizedById = manager.id;
  }

  const order = await payload.findByID({ collection: 'orders', id, overrideAccess: true }).catch(() => null);
  if (!order || toID(order.tenant) !== requestingTenant) {
    return Response.json({ error: 'Order not found' }, { status: 404 });
  }
  if (order.tenderType !== 'credit') {
    return Response.json({ error: 'Only credit sales can be settled' }, { status: 409 });
  }
  if (order.status !== 'completed') {
    return Response.json({ error: `Order is ${order.status}, not completed` }, { status: 409 });
  }
  if (order.paymentStatus !== 'pending') {
    return Response.json({ error: `Order is already ${order.paymentStatus}` }, { status: 409 });
  }

  const updated = await payload.update({
    collection: 'orders',
    id,
    data: { paymentStatus: 'paid', settledAt: new Date().toISOString(), settledBy: authorizedById },
    overrideAccess: true,
    // Read by Orders.ts's settlement audit-log hook. Always set (not just
    // for the cashier+PIN path) - authorizedById is already correct either
    // way, and a Local API call like this one never populates req.user in
    // hooks unless a `user` option is passed explicitly, so relying on that
    // fallback here (as this route originally did) silently dropped the
    // audit entry for the owner/manager-direct case - caught live: settling
    // an order via the dashboard succeeded but wrote nothing to audit-log.
    context: { authorizedByManagerId: authorizedById },
  });

  return Response.json({ doc: updated });
}
