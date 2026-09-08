import { API_BASE_URL } from '../lib/auth';

// Every function below already returns a sentinel (null/false/[]) on an
// HTTP-level failure rather than throwing - but until this fix, a network-
// layer failure (fetch() itself throwing - offline, DNS, timeout) escaped
// UNCAUGHT past that same `if (!res.ok)` line, propagating out of the
// function entirely. Callers here (RestockScreen.tsx, PurchaseOrderDetail-
// Screen.tsx) already do `setBusy(true); const x = await thisFn(); setBusy
// (false); if (!x) { Alert... }` - correct sequential code that the escaped
// exception was jumping straight past, leaving "Saving.../Confirming..."
// stuck forever with zero feedback. Wrapping each function body in try/
// catch so it returns its OWN existing sentinel on any failure (network
// included) fixes every caller for free, with no caller-side changes.

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
  try {
    const res = await fetch(`${API_BASE_URL}/api/suppliers?limit=100&sort=name`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    });
    if (!res.ok) return [];
    const body = await res.json().catch(() => null);
    return body?.docs ?? [];
  } catch {
    return [];
  }
}

export async function createSupplier(payloadToken: string, name: string): Promise<Supplier | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/suppliers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    return body?.doc ?? null;
  } catch {
    return null;
  }
}

export async function fetchRestockSuggestions(payloadToken: string, storeId: number): Promise<RestockSuggestion[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/reports/restock-suggestions?store=${storeId}`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    });
    if (!res.ok) return [];
    const body = await res.json().catch(() => null);
    return body?.suggestions ?? [];
  } catch {
    return [];
  }
}

export async function createPurchaseOrder(
  payloadToken: string,
  args: {
    store: number;
    supplier: number;
    lineItems: Array<{ product: number; variant?: string; quantity: number; unitCost: number }>;
  },
): Promise<{ id: number } | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/purchase-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
      body: JSON.stringify({ store: args.store, supplier: args.supplier, status: 'draft', lineItems: args.lineItems }),
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    return body?.doc ?? null;
  } catch {
    return null;
  }
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
  try {
    const res = await fetch(`${API_BASE_URL}/api/purchase-orders?sort=-createdAt&limit=50&depth=1`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    });
    if (!res.ok) return [];
    const body = await res.json().catch(() => null);
    return body?.docs ?? [];
  } catch {
    return [];
  }
}

export async function fetchPurchaseOrder(payloadToken: string, id: number): Promise<PurchaseOrderDetail | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/purchase-orders/${id}?depth=1`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

// Draft-only, enforced server-side by PurchaseOrders.ts's access.delete -
// this is just the client call, the actual guard lives in the collection.
export async function deletePurchaseOrder(payloadToken: string, id: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/purchase-orders/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `JWT ${payloadToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function receivePurchaseOrder(
  payloadToken: string,
  id: number,
  items: Array<{ index: number; quantity: number }>,
): Promise<PurchaseOrderDetail | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/purchase-orders/${id}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    return body?.doc ?? null;
  } catch {
    return null;
  }
}
