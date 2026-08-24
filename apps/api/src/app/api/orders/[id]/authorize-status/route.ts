import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { verifyPin } from '@/lib/pin';
import { isTenantUser, toID } from '@/lib/relations';

// spec Section 6.1: "returns/refunds/voids gated behind manager PIN". The
// requesting cashier's own session never has manager-level access
// (Orders.access.update is managerOrOwner - confirmed by the collections
// integration test that a cashier's own update attempt throws) - this
// route is the one place a cashier session can elevate a specific action,
// and only by proving a real manager/owner's PIN, re-verified here
// server-side even though the till may also pre-check it locally for fast
// UX feedback (see apps/desktop/src-tauri/src/pin.rs) - the server check is
// the actual authority, never the client's.
//
// Per the Option-A decision: this requires connectivity to commit (no
// offline queuing for status changes, only for new sales) - a cashier
// without a network path simply cannot process a refund/void until back
// online, which is normal behavior for most real POS systems.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { status, managerId, pin } = await request.json();

  if (status !== 'refunded' && status !== 'voided') {
    return Response.json({ error: "status must be 'refunded' or 'voided'" }, { status: 400 });
  }
  if (typeof managerId !== 'number' && typeof managerId !== 'string') {
    return Response.json({ error: 'managerId is required' }, { status: 400 });
  }
  if (typeof pin !== 'string' || pin.length === 0) {
    return Response.json({ error: 'pin is required' }, { status: 400 });
  }

  const requestingTenant = toID(user.tenant);

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

  const order = await payload.findByID({ collection: 'orders', id, overrideAccess: true }).catch(() => null);
  if (!order || toID(order.tenant) !== requestingTenant) {
    return Response.json({ error: 'Order not found' }, { status: 404 });
  }
  if (order.status !== 'completed') {
    return Response.json({ error: `Order is already ${order.status}` }, { status: 409 });
  }

  // overrideAccess: the cashier's own role wouldn't pass Orders'
  // managerOrOwner update check - authorization for THIS specific action
  // was just established above via the manager's PIN, which is the point
  // of this endpoint existing at all.
  const updated = await payload.update({
    collection: 'orders',
    id,
    data: { status },
    overrideAccess: true,
    // Read by Orders.ts's audit-log afterChange hook - the actual
    // authorizing manager, not whoever's session (the cashier's) issued
    // this HTTP request.
    context: { authorizedByManagerId: manager.id },
  });

  return Response.json({ doc: updated });
}
