import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { getDb } from './database';
import { API_BASE_URL } from './auth';

interface LocalUserCandidate {
  id: number;
  email: string;
  name: string | null;
  role: string;
  pin_hash: string | null;
}

/**
 * Fully-offline PIN check against a specific role subset's pin_hash,
 * already synced down locally (spec Section 6.1: PIN login must be
 * instant, zero network). Shared by the manager-authorization pre-check
 * (findManagerAndCheckPinLocally) and fast cashier switching
 * (findStaffAndCheckPinLocally) below - same mechanism, different role
 * filter, so it's factored out once rather than duplicated.
 */
async function findUserAndCheckPinLocally(
  email: string,
  pin: string,
  allowedRoles: string[],
): Promise<{ userId: number; role: string; name: string | null; valid: boolean } | null> {
  const db = getDb();
  const placeholders = allowedRoles.map(() => '?').join(', ');
  const rows = await db.getAll<LocalUserCandidate>(
    `SELECT id, email, name, role, pin_hash FROM users WHERE email = ? AND role IN (${placeholders})`,
    [email, ...allowedRoles],
  );
  const candidate = rows[0];
  if (!candidate || !candidate.pin_hash) return null;

  const valid = await invoke<boolean>('verify_manager_pin', { pin, storedHash: candidate.pin_hash });
  return { userId: candidate.id, role: candidate.role, name: candidate.name, valid };
}

/**
 * NOT the actual authorization for a refund/void - see
 * authorizeOrderStatusChange below, which the server independently
 * re-verifies before committing anything (a tampered client could
 * otherwise fake this local check). This is only the fast local pre-check
 * for immediate UX feedback on a wrong PIN.
 */
export async function findManagerAndCheckPinLocally(
  managerEmail: string,
  pin: string,
): Promise<{ managerId: number; name: string | null; valid: boolean } | null> {
  const result = await findUserAndCheckPinLocally(managerEmail, pin, ['manager', 'owner']);
  return result ? { managerId: result.userId, name: result.name, valid: result.valid } : null;
}

/**
 * Fast cashier switching (spec Section 6.1): any staff member - cashier,
 * manager, or owner - can "clock in" as the active cashier for subsequent
 * sales via PIN alone, without a full logout/login cycle or losing the
 * underlying PowerSync connection (which stays authenticated as whoever
 * did the original login).
 */
export async function findStaffAndCheckPinLocally(
  email: string,
  pin: string,
): Promise<{ userId: number; role: string; name: string | null; valid: boolean } | null> {
  return findUserAndCheckPinLocally(email, pin, ['cashier', 'manager', 'owner']);
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

/**
 * Marks a credit sale as settled - manager/owner only, per the user's own
 * instruction. Same Option-A shape as authorizeOrderStatusChange above (a
 * cashier's local PIN check is only ever a fast pre-check; the server
 * re-verifies the PIN itself and is the actual authority).
 */
export async function authorizeSettlement(
  payloadToken: string,
  orderId: string,
  managerId: number,
  pin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await tauriFetch(`${API_BASE_URL}/api/orders/${orderId}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
    body: JSON.stringify({ managerId, pin }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body?.error ?? `Request failed (HTTP ${res.status})` };
  }
  return { ok: true };
}
