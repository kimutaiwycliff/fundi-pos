import { apiFetch, API_BASE_URL } from './auth';

// Orders, read and written straight against apps/api's REST endpoints - the
// desktop counterpart of what apps/web's dashboard/sales pages and
// apps/mobile's (now-converted) sell screen already do. Shared by Till.tsx
// (completing a sale, today's stats), FindSalePanel.tsx (reprint/settle) and
// VoidOrderPanel.tsx (void/refund), so the request shapes only live once.

export interface OrderLineItemRecord {
  product: { id: number; name: string } | number;
  variant: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
}

export interface OrderRecord {
  id: string;
  total: number;
  taxTotal: number;
  discountTotal: number;
  tenderType: string;
  paymentStatus: string;
  status: string;
  createdAt: string;
  settledAt: string | null;
  customer: { id: number; name: string } | number | null;
  lineItems: OrderLineItemRecord[];
}

export interface FetchOrdersOptions {
  status?: string;
  tenderType?: string;
  paymentStatus?: string;
  /** ISO timestamp - `where[createdAt][greater_than_equal]`. */
  createdAtGte?: string;
  limit?: number;
  /** depth=1 (the default) inlines `customer`/`lineItems[].product` as objects - depth=0 leaves them as bare ids. */
  depth?: number;
}

/**
 * Recent orders for one store - mirrors apps/web's own `/api/orders?where[...]`
 * query shape (dashboard/sales), fetched in bulk and filtered/searched
 * client-side by callers, same as web's sales-table.tsx does. Throws (rather
 * than swallowing) on failure so every call site can show a clear error
 * instead of a silently-empty list.
 */
export async function fetchOrdersForStore(payloadToken: string, storeId: number, opts: FetchOrdersOptions = {}): Promise<OrderRecord[]> {
  const params = new URLSearchParams({
    'where[store][equals]': String(storeId),
    sort: '-createdAt',
    limit: String(opts.limit ?? 200),
    depth: String(opts.depth ?? 1),
  });
  if (opts.status) params.set('where[status][equals]', opts.status);
  if (opts.tenderType) params.set('where[tenderType][equals]', opts.tenderType);
  if (opts.paymentStatus) params.set('where[paymentStatus][equals]', opts.paymentStatus);
  if (opts.createdAtGte) params.set('where[createdAt][greater_than_equal]', opts.createdAtGte);

  const res = await apiFetch(`${API_BASE_URL}/api/orders?${params.toString()}`, {
    headers: { Authorization: `JWT ${payloadToken}` },
  });
  if (!res.ok) {
    throw new Error(`Could not load sales (HTTP ${res.status})`);
  }
  const body = await res.json().catch(() => null);
  return (body?.docs ?? []) as OrderRecord[];
}

export interface NewOrderLineItem {
  product: number;
  variant: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
}

export interface NewOrder {
  id: string;
  tenant: number;
  store: number;
  terminal: string;
  terminalName: string | null;
  cashier: number;
  customer: number | null;
  lineItems: NewOrderLineItem[];
  taxTotal: number;
  discountTotal: number;
  total: number;
  tenderType: string;
  paymentStatus: string;
  status: 'completed';
  createdOffline: false;
}

/**
 * Completes a sale synchronously against the same idempotent-on-duplicate-id
 * ingestion endpoint the old PowerSync upload queue used
 * (`POST /api/sync/orders`, see apps/api/src/app/api/sync/orders/route.ts) -
 * a duplicate client-generated `id` (a double-click, or a retry after a
 * timeout whose first attempt actually landed) is a safe no-op that returns
 * the already-committed order instead of erroring. Throws on failure
 * (network or validation) - callers must leave the cart intact on catch,
 * never clear it before this resolves.
 */
export async function submitOrder(payloadToken: string, order: NewOrder): Promise<{ doc: OrderRecord; idempotentReplay: boolean }> {
  const res = await apiFetch(`${API_BASE_URL}/api/sync/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
    body: JSON.stringify(order),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.errors?.[0]?.message ?? body?.error ?? `Could not complete sale (HTTP ${res.status})`);
  }
  return body as { doc: OrderRecord; idempotentReplay: boolean };
}
