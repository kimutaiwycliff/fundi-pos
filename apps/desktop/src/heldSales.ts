// Held/parked sales (spec Section 6.1) are deliberately terminal-local and
// were never part of the synced PowerSync schema - a parked cart is a
// till-local convenience, not business data other stores/the dashboard need
// to see. Previously a plain SQLite table PowerSync itself didn't know
// about; now that there's no local database at all, this is a small JSON
// array in localStorage instead (a Tauri WebView supports it natively - see
// terminal.ts/printer.ts's own settings, which already use it the same way).
// Mirrors apps/mobile/src/db/heldSales.ts's identical AsyncStorage-based
// conversion - same shape, same three exported function names/signatures,
// just a different storage primitive, so callers (Till.tsx) needed no changes.
export interface HeldSale {
  id: string;
  createdAt: string;
  cartJson: string;
}

const STORAGE_KEY = 'hardware-pos-held-sales';

function readAll(): HeldSale[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HeldSale[]) : [];
  } catch {
    return [];
  }
}

function writeAll(sales: HeldSale[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sales));
}

export async function holdSale(cartJson: string): Promise<void> {
  const sales = readAll();
  sales.unshift({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), cartJson });
  writeAll(sales);
}

export async function listHeldSales(): Promise<HeldSale[]> {
  const sales = readAll();
  return [...sales].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function deleteHeldSale(id: string): Promise<void> {
  const sales = readAll();
  writeAll(sales.filter((s) => s.id !== id));
}
