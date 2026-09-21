import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { API_BASE_URL } from './auth';

// Stock levels used to come from the same tenant-wide
// /api/reports/stock-levels endpoint web/mobile use - InventoryScreen.tsx
// now queries the locally-synced products/products_variants/stock_movements
// tables directly instead (see its own StockLevel type and useWatchedQuery
// call), mirroring mobile's already-local equivalent, so that type/function
// pair no longer lives here.

export interface PickableProduct {
  id: number;
  name: string;
  sku: string;
  variants: Array<{ id: string; label: string }>;
}

// Product picker for the adjustment form below - a plain Payload list call
// (tenant-scoped server-side by the collection's own access rule, same as
// every other list call in this file), not a local query. Only the
// *display* side of this screen (StockLevel, in InventoryScreen.tsx) moved
// to a local reactive query this round - this picker and the write it feeds
// (recordStockMovement below) are untouched, still online-only.
export async function fetchProductCatalog(payloadToken: string): Promise<PickableProduct[]> {
  try {
    const res = await tauriFetch(`${API_BASE_URL}/api/products?limit=2000&depth=0&sort=name&where[isActive][equals]=true`, {
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
