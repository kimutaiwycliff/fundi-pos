import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { getDb } from './database';
import { API_BASE_URL } from './auth';

interface LocalManagerCandidate {
  id: number;
  email: string;
  role: string;
  pin_hash: string | null;
}

/**
 * Fast, fully-offline pre-check against the manager/owner's pin_hash
 * already synced down locally (spec Section 6.1's PIN gate is meant to be
 * instant, not wait on a round-trip). This is NOT the actual authorization -
 * see authorizeOrderStatusChange below, which the server independently
 * re-verifies before committing anything (a tampered client could otherwise
 * fake this local check).
 */
export async function findManagerAndCheckPinLocally(
  managerEmail: string,
  pin: string,
): Promise<{ managerId: number; valid: boolean } | null> {
  const db = getDb();
  const rows = await db.getAll<LocalManagerCandidate>(
    `SELECT id, email, role, pin_hash FROM users WHERE email = ? AND (role = 'manager' OR role = 'owner')`,
    [managerEmail],
  );
  const candidate = rows[0];
  if (!candidate || !candidate.pin_hash) return null;

  const valid = await invoke<boolean>('verify_manager_pin', { pin, storedHash: candidate.pin_hash });
  return { managerId: candidate.id, valid };
}

/**
 * The actual authorization: requires connectivity (Option A - see
 * apps/api/src/app/api/orders/[id]/authorize-status/route.ts), which
 * re-verifies the manager's PIN server-side before changing the order's
 * status. This is what a cashier's own session can't do on its own.
 */
export async function authorizeOrderStatusChange(
  payloadToken: string,
  orderId: string,
  status: 'refunded' | 'voided',
  managerId: number,
  pin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await tauriFetch(`${API_BASE_URL}/api/orders/${orderId}/authorize-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
    body: JSON.stringify({ status, managerId, pin }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body?.error ?? `Request failed (HTTP ${res.status})` };
  }
  return { ok: true };
}
