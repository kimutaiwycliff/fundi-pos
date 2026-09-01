import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { verifyPin } from '@/lib/pin';
import { isTenantUser, toID } from '@/lib/relations';

// Records one installment against a credit ("pay later") sale - most
// customers don't clear the whole tab in one visit. amountPaid/balance are
// always derived by summing credit-payments for this order (see
// CreditPayments.ts), never stored on the order itself, so this route's only
// job is: validate the amount against what's actually still owed, write one
// ledger row, and - only once the running total reaches the order's total -
// flip paymentStatus to 'paid' the same way settle/route.ts always has (which
// is what fires Orders.ts's existing "sale_settled" audit hook, unchanged).
// Same two-path authorization as settle: an owner/manager session needs
// nothing else; a cashier session (the till's case) re-proves a manager PIN
// server-side regardless of any local pre-check.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const requestingTenant = toID(user.tenant);
  const body = await request.json().catch(() => ({}));
  const { amount, method, note } = body as { amount?: unknown; method?: unknown; note?: unknown };

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return Response.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  let authorizedById: number;
  if (user.role === 'owner' || user.role === 'manager') {
    authorizedById = user.id;
  } else {
    const { managerId, pin } = body as { managerId?: unknown; pin?: unknown };
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
    return Response.json({ error: 'Only credit sales accept payments' }, { status: 409 });
  }
  if (order.status !== 'completed') {
    return Response.json({ error: `Order is ${order.status}, not completed` }, { status: 409 });
  }
  if (order.paymentStatus !== 'pending') {
    return Response.json({ error: `Order is already ${order.paymentStatus}` }, { status: 409 });
  }

  const existingPayments = await payload.find({
    collection: 'credit-payments',
    where: { order: { equals: id } },
    limit: 1000,
    overrideAccess: true,
  });
  const amountPaidSoFar = existingPayments.docs.reduce((sum, p) => sum + (p.amount as number), 0);
  const balance = Math.round((order.total - amountPaidSoFar) * 100) / 100;

  // A cent of float slop shouldn't block the final installment from
  // clearing the tab, but a genuine overpayment attempt should be rejected
  // rather than silently accepted or clamped - the cashier typed something
  // wrong and should see that, not have it quietly capped.
  if (amount - balance > 0.01) {
    return Response.json({ error: `Amount exceeds the remaining balance of ${balance.toFixed(2)}` }, { status: 400 });
  }

  const VALID_METHODS = ['cash', 'mpesa', 'card', 'other'] as const;
  const resolvedMethod = VALID_METHODS.find((m) => m === method) ?? 'cash';

  const now = new Date().toISOString();
  const payment = await payload.create({
    collection: 'credit-payments',
    data: {
      tenant: Number(requestingTenant),
      order: id,
      amount,
      method: resolvedMethod,
      note: typeof note === 'string' && note ? note : undefined,
      recordedBy: authorizedById,
      paidAt: now,
    },
    overrideAccess: true,
  });

  const newAmountPaid = Math.round((amountPaidSoFar + amount) * 100) / 100;
  const fullySettled = order.total - newAmountPaid <= 0.01;

  let updatedOrder = order;
  if (fullySettled) {
    updatedOrder = await payload.update({
      collection: 'orders',
      id,
      data: { paymentStatus: 'paid', settledAt: now, settledBy: authorizedById },
      overrideAccess: true,
      // Read by Orders.ts's settlement audit-log hook - same reasoning as
      // settle/route.ts: a Local API call never populates req.user in hooks
      // unless `user` is passed explicitly, so this context is what lets
      // that hook attribute the resulting "sale_settled" entry correctly.
      context: { authorizedByManagerId: authorizedById },
    });
  }

  await payload.create({
    collection: 'audit-log',
    data: {
      tenant: Number(requestingTenant),
      actor: authorizedById,
      action: 'credit_payment_recorded',
      entityType: 'order',
      entityId: String(id),
      summary: `Order ${String(id).slice(0, 8)}: ${amount.toFixed(2)} paid (${newAmountPaid.toFixed(2)} of ${order.total.toFixed(2)})`,
      metadata: { amount, amountPaid: newAmountPaid, total: order.total, fullySettled },
    },
    overrideAccess: true,
  });

  return Response.json({ payment, order: updatedOrder, amountPaid: newAmountPaid, balance: order.total - newAmountPaid });
}
