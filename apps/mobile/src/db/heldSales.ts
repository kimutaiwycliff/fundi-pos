import { getDb } from './database';
import { uuid } from '../lib/uuid';

// Held/parked sales are deliberately terminal-local and NOT part of the
// synced PowerSync schema (see schema.ts/AppSchema) - a parked cart is a
// till-local convenience, not business data other stores/the dashboard need
// to see. Ported 1:1 from apps/desktop/src/heldSales.ts (same PowerSync raw
// SQL API), swapping crypto.randomUUID() for lib/uuid.ts's RFC4122 v4
// generator (RN has no Web Crypto API - see uuid.ts).
export interface HeldSale {
  id: string;
  createdAt: string;
  cartJson: string;
}

let ensured = false;

export async function ensureHeldSalesTable(): Promise<void> {
  if (ensured) return;
  const db = getDb();
  await db.execute(
    `CREATE TABLE IF NOT EXISTS local_held_sales (
       id TEXT PRIMARY KEY,
       created_at TEXT NOT NULL,
       cart_json TEXT NOT NULL
     )`,
  );
  ensured = true;
}

export async function holdSale(cartJson: string): Promise<void> {
  await ensureHeldSalesTable();
  const db = getDb();
  await db.execute(`INSERT INTO local_held_sales (id, created_at, cart_json) VALUES (?, ?, ?)`, [
    uuid(),
    new Date().toISOString(),
    cartJson,
  ]);
}

export async function listHeldSales(): Promise<HeldSale[]> {
  await ensureHeldSalesTable();
  const db = getDb();
  const rows = await db.getAll<{ id: string; created_at: string; cart_json: string }>(
    `SELECT id, created_at, cart_json FROM local_held_sales ORDER BY created_at DESC`,
  );
  return rows.map((r) => ({ id: r.id, createdAt: r.created_at, cartJson: r.cart_json }));
}

export async function deleteHeldSale(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM local_held_sales WHERE id = ?`, [id]);
}
