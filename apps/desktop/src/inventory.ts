import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { API_BASE_URL } from './auth';

// Stock levels come from the same tenant-wide /api/reports/stock-levels
// endpoint web/mobile already use (derived from the stock_movements ledger
// server-side, not a stored count) rather than a local PowerSync query -
// desktop's own local schema.ts doesn't declare products_variants/media/
// reorder_point (see its header comment - it has drifted from mobile's),
// and this stays consistent with Reports/Restock's own online-only choice
// on desktop rather than half-porting a schema this app doesn't otherwise need.
export interface StockLevel {
  store: number;
  product: number;
  variant: string | null;
  productName: string;
  variantLabel: string | null;
  quantity: number;
  reorderPoint: number;
  lowStock: boolean;
}

export async function fetchStockLevels(payloadToken: string, storeId: number): Promise<StockLevel[]> {
  try {
    const res = await tauriFetch(`${API_BASE_URL}/api/reports/stock-levels?store=${storeId}`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    });
    if (!res.ok) return [];
    const body = await res.json().catch(() => null);
    return body?.levels ?? [];
  } catch {
    return [];
  }
}

export interface PickableProduct {
  id: number;
  name: string;
  sku: string;
  variants: Array<{ id: string; label: string }>;
}

// Product picker for the adjustment form below - a plain Payload list call
// (tenant-scoped server-side by the collection's own access rule, same as
// every other list call in this file), not a local query, for the same
// reason stock levels aren't local either.
export async function fetchProductCatalog(payloadToken: string): Promise<PickableProduct[]> {
  try {
    const res = await tauriFetch(`${API_BASE_URL}/api/products?limit=2000&depth=0&sort=name`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    });
    if (!res.ok) return [];
    const body = await res.json().catch(() => null);
    return (body?.docs ?? []).map((p: { id: number; name: string; sku?: string; variants?: Array<{ id?: string; label: string }> }) => ({
      id: p.id,
      name: p.name,
      sku: p.sku ?? '',
      variants: (p.variants ?? []).filter((v): v is { id: string; label: string } => Boolean(v.id)),
    }));
  } catch {
    return [];
  }
}

// Every manual stock change is a new StockMovements row, never a direct
// edit to a count (there is no stored count) - same write shape as web's
// stock-adjustment-dialog.tsx, called straight against Payload's REST API
// (like purchaseOrders.ts/shifts.ts already do) instead of through a
// Next.js proxy, since desktop has no server of its own.
export async function recordStockMovement(
  payloadToken: string,
  args: { product: number; variant: string | null; store: number; quantityDelta: number; reason: 'restock' | 'adjustment' | 'write_off' },
): Promise<boolean> {
  try {
    const res = await tauriFetch(`${API_BASE_URL}/api/stock-movements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        product: args.product,
        variant: args.variant,
        store: args.store,
        quantityDelta: args.quantityDelta,
        reason: args.reason,
        clientTimestamp: new Date().toISOString(),
        sourceTerminal: 'desktop-till',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
