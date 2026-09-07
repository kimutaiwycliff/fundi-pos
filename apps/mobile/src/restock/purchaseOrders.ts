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
