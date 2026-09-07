import { API_BASE_URL } from '../lib/auth';

// Restocking is online-only by design - purchase-orders/suppliers aren't in
// PowerSync's sync-config.yaml bucket list (this is a back-office planning
// task, not something that must survive a mid-sale blackout), so this talks
// straight to the API the same way shifts.ts does, rather than through the
// local SQLite/PowerSync path everything else on this screen reads from.

export interface Supplier {
  id: number;
  name: string;
}

export interface RestockSuggestion {
  productId: number;
  variant: string | null;
  productName: string;
  variantLabel: string | null;
  costPrice: number | null;
  sellPrice: number;
  reason: 'low-stock' | 'fast-moving' | 'both';
}

export async function fetchSuppliers(payloadToken: string): Promise<Supplier[]> {
  const res = await fetch(`${API_BASE_URL}/api/suppliers?limit=100&sort=name`, {
    headers: { Authorization: `JWT ${payloadToken}` },
  });
  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  return body?.docs ?? [];
}

export async function createSupplier(payloadToken: string, name: string): Promise<Supplier | null> {
  const res = await fetch(`${API_BASE_URL}/api/suppliers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body?.doc ?? null;
}

export async function fetchRestockSuggestions(payloadToken: string, storeId: number): Promise<RestockSuggestion[]> {
  const res = await fetch(`${API_BASE_URL}/api/reports/restock-suggestions?store=${storeId}`, {
    headers: { Authorization: `JWT ${payloadToken}` },
  });
  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  return body?.suggestions ?? [];
}

export async function createPurchaseOrder(
  payloadToken: string,
  args: {
    store: number;
    supplier: number;
    lineItems: Array<{ product: number; variant?: string; quantity: number; unitCost: number }>;
  },
): Promise<{ id: number } | null> {
  const res = await fetch(`${API_BASE_URL}/api/purchase-orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
    body: JSON.stringify({ store: args.store, supplier: args.supplier, status: 'draft', lineItems: args.lineItems }),
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body?.doc ?? null;
}

export interface PurchaseOrderListItem {
  id: number;
  store: { id: number; name: string } | number;
  supplier: { id: number; name: string } | number;
  status: 'draft' | 'sent' | 'partially_received' | 'received';
  lineItems: Array<{ quantity: number }>;
  createdAt: string;
}

export interface PurchaseOrderDetail extends Omit<PurchaseOrderListItem, 'lineItems'> {
  lineItems: Array<{
    product: { id: number; name: string; variants?: Array<{ id: string; label: string }> };
    variant: string | null;
    quantity: number;
    unitCost: number;
    receivedQuantity: number;
  }>;
}

export async function fetchPurchaseOrders(payloadToken: string): Promise<PurchaseOrderListItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/purchase-orders?sort=-createdAt&limit=50&depth=1`, {
    headers: { Authorization: `JWT ${payloadToken}` },
  });
  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  return body?.docs ?? [];
}

export async function fetchPurchaseOrder(payloadToken: string, id: number): Promise<PurchaseOrderDetail | null> {
  const res = await fetch(`${API_BASE_URL}/api/purchase-orders/${id}?depth=1`, {
    headers: { Authorization: `JWT ${payloadToken}` },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// Draft-only, enforced server-side by PurchaseOrders.ts's access.delete -
// this is just the client call, the actual guard lives in the collection.
export async function deletePurchaseOrder(payloadToken: string, id: number): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/api/purchase-orders/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `JWT ${payloadToken}` },
  });
  return res.ok;
}

export async function receivePurchaseOrder(
  payloadToken: string,
  id: number,
  items: Array<{ index: number; quantity: number }>,
): Promise<PurchaseOrderDetail | null> {
  const res = await fetch(`${API_BASE_URL}/api/purchase-orders/${id}/receive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body?.doc ?? null;
}
