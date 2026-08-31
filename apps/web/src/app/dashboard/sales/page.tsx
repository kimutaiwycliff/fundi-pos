import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { SalesTable } from './sales-table';

export type StoreRef = { id: number; name: string };
export type UserRef = { id: number; name: string | null; email: string };
export type ManagerRef = { id: number; name: string | null; email: string };
export type CustomerRef = { id: number; name: string; phone: string };
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

export default async function SalesPage() {
  const me = await getCurrentUser();
  const tenantId = typeof me.tenant === 'object' ? me.tenant.id : me.tenant;

  const [{ docs: orders }, tenant, { docs: managers }] = await Promise.all([
    payloadFetch<{ docs: Order[] }>('/api/orders?sort=-createdAt&limit=200'),
    payloadFetch<TenantReceiptInfo>(`/api/tenants/${tenantId}`),
    // Void/refund (VoidOrderDialog) requires picking a real manager/owner to
    // authorize with - authorize-status always PIN-checks server-side
    // regardless of who's asking, so every role can attempt it.
    payloadFetch<{ docs: ManagerRef[] }>(
      '/api/users?where[role][in]=manager,owner&where[status][equals]=active&sort=name&limit=100',
    ),
  ]);

  // Only a manager/owner may settle a credit tab from the dashboard - the
  // settle endpoint itself authorizes off the session's role (no PIN, since
  // this isn't the offline cashier flow), so the button is hidden here as
  // the UI-side half of that same rule.
  const canSettle = me.role === 'owner' || me.role === 'manager';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Sales</h1>
      </div>
      <SalesTable orders={orders} tenant={tenant} canSettle={canSettle} managers={managers} />
    </div>
  );
}
