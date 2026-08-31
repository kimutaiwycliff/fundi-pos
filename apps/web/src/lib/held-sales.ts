import type { CartLine } from '@/app/dashboard/sell/types';

// Held/parked sales, web equivalent of apps/desktop/src/heldSales.ts:
// deliberately terminal(browser)-local only, never synced to the backend -
// a parked cart is a till-local convenience, not business data.
const KEY = 'hardware-pos-web-held-sales';

export interface HeldSale {
  id: string;
  createdAt: string;
  cart: CartLine[];
}

function readAll(): HeldSale[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HeldSale[]) : [];
  } catch {
    return [];
  }
}

function writeAll(sales: HeldSale[]): void {
  localStorage.setItem(KEY, JSON.stringify(sales));
}

export function listHeldSales(): HeldSale[] {
  return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function holdSale(cart: CartLine[]): void {
  const sales = readAll();
  sales.push({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), cart });
  writeAll(sales);
}

export function deleteHeldSale(id: string): void {
  writeAll(readAll().filter((sale) => sale.id !== id));
}
