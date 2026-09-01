import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { nairobiDateToUTC } from '@/lib/format-date';
import { SalesTable } from './sales-table';
import { DateRangeFilter } from './date-range-filter';

export type StoreRef = { id: number; name: string };
export type UserRef = { id: number; name: string | null; email: string };
export type ManagerRef = { id: number; name: string | null; email: string };
export type CustomerRef = { id: number; name: string; phone: string | null; email: string | null };
export type ProductRef = { id: number; name: string; sku: string };

export type Order = {
  id: string;
  createdAt: string;
  store: StoreRef | number;
  terminal: string;
  terminalName: string | null;
  cashier: UserRef | number;
  customer: CustomerRef | number | null;
  lineItems: Array<{
    product: ProductRef | number;
    variant: string | null;
    quantity: number;
    unitPrice: number;
    discount: number;
  }>;
  taxTotal: number;
  discountTotal: number;
  total: number;
  tenderType: 'cash' | 'mpesa' | 'card' | 'credit';
  paymentStatus: 'paid' | 'pending' | 'failed';
  status: 'completed' | 'refunded' | 'voided';
  settledAt: string | null;
  settledBy: UserRef | number | null;
};

export type TenantReceiptInfo = {
  name: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
};

export type CreditPayment = {
  id: number;
  order: string;
  amount: number;
  method: 'cash' | 'mpesa' | 'card' | 'other';
  note: string | null;
  recordedBy: number;
  paidAt: string;
};

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const me = await getCurrentUser();
  const tenantId = typeof me.tenant === 'object' ? me.tenant.id : me.tenant;
  const { from, to } = await searchParams;

  // Nairobi calendar days, not UTC-shifted slices of them - see
  // nairobiDateToUTC's own comment. `to` is inclusive of that whole day, so
  // the upper bound is midnight at the START of the day AFTER it.
  let ordersQuery = '/api/orders?sort=-createdAt&limit=200';
  const [fromYear, fromMonth, fromDay] = from ? from.split('-').map(Number) : [];
  const [toYear, toMonth, toDay] = to ? to.split('-').map(Number) : [];
  if (fromYear) {
    ordersQuery += `&where[createdAt][greater_than_equal]=${encodeURIComponent(nairobiDateToUTC(fromYear, fromMonth, fromDay).toISOString())}`;
  }
  if (toYear) {
    const exclusiveUpperBound = new Date(nairobiDateToUTC(toYear, toMonth, toDay).getTime() + 24 * 60 * 60 * 1000);
    ordersQuery += `&where[createdAt][less_than]=${encodeURIComponent(exclusiveUpperBound.toISOString())}`;
  }

  const [{ docs: orders }, tenant, { docs: managers }, { docs: creditPayments }] = await Promise.all([
    payloadFetch<{ docs: Order[] }>(ordersQuery),
    payloadFetch<TenantReceiptInfo>(`/api/tenants/${tenantId}`),
    // Void/refund (VoidOrderDialog) requires picking a real manager/owner to
    // authorize with - authorize-status always PIN-checks server-side
    // regardless of who's asking, so every role can attempt it.
    payloadFetch<{ docs: ManagerRef[] }>(
      '/api/users?where[role][in]=manager,owner&where[status][equals]=active&sort=name&limit=100',
    ),
    // Installment history - amountPaid/balance per order is always derived
    // from this ledger (never stored on the order), same "sum the movements"
    // pattern as stock levels. depth=0 deliberately - a populated depth
    // would inflate `order` into a full Order object too (Payload's depth
    // applies to every relationship field on the doc, not just the one you
    // want), which silently breaks the paymentsByOrder grouping below since
    // it keys off payment.order as a plain string id. recordedBy is
    // resolved against `managers` (fetched above) instead of populating it.
    payloadFetch<{ docs: CreditPayment[] }>('/api/credit-payments?sort=-paidAt&limit=1000&depth=0'),
  ]);

  // Only a manager/owner may settle a credit tab from the dashboard - the
  // record-payment endpoint itself authorizes off the session's role (no
  // PIN, since this isn't the offline cashier flow), so the button is
  // hidden here as the UI-side half of that same rule.
  const canSettle = me.role === 'owner' || me.role === 'manager';

  const paymentsByOrder = new Map<string, CreditPayment[]>();
  for (const payment of creditPayments) {
    const list = paymentsByOrder.get(payment.order) ?? [];
    list.push(payment);
    paymentsByOrder.set(payment.order, list);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Sales</h1>
        <DateRangeFilter />
      </div>
      {orders.length === 200 ? (
        <p className="text-xs text-muted-foreground">
          Showing the most recent 200 orders{from || to ? ' in this range' : ''} - narrow the date filter to see more.
        </p>
      ) : null}
      <SalesTable
        orders={orders}
        tenant={tenant}
        canSettle={canSettle}
        managers={managers}
        paymentsByOrder={Object.fromEntries(paymentsByOrder)}
      />
    </div>
  );
}
