import AsyncStorage from '@react-native-async-storage/async-storage';
import { uuid } from '../lib/uuid';

// Held/parked sales are a till-local convenience, not business data other
// stores/the dashboard need to see - previously a plain SQL table created on
// the same PowerSync-managed SQLite instance every other local read used,
// even though this table itself was never part of the synced schema. Now
// that this app is online-only (no local database of any kind), a small
// JSON array in AsyncStorage is the simplest local-only store for the same
// data - same exported shape/signatures as before, so SellScreen.tsx/
// HeldSalesModal.tsx need no changes beyond whatever else touches them.
export interface HeldSale {
  id: string;
  createdAt: string;
  cartJson: string;
}

const STORAGE_KEY = 'hardware-pos-held-sales';

async function readAll(): Promise<HeldSale[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HeldSale[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(sales: HeldSale[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sales));
}

export async function holdSale(cartJson: string): Promise<void> {
  const sales = await readAll();
  sales.unshift({ id: uuid(), createdAt: new Date().toISOString(), cartJson });
  await writeAll(sales);
}

export async function listHeldSales(): Promise<HeldSale[]> {
  const sales = await readAll();
  return [...sales].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function deleteHeldSale(id: string): Promise<void> {
  const sales = await readAll();
  await writeAll(sales.filter((s) => s.id !== id));
}
