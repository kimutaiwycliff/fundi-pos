import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { API_BASE_URL } from './auth';

// The stock-level display and the adjustment form's own product picker both
// moved to the shared catalog.ts fetchers (fetchCatalog/fetchStockLevels) -
// see InventoryScreen.tsx. Only the actual write (recordStockMovement below)
// stays here, unchanged - it was always online-only REST, no PowerSync ties.

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
