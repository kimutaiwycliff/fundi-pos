import { scrypt } from 'scrypt-js';
import { API_BASE_URL, OFFLINE_MESSAGE } from './auth';
import { getDb } from '../db/database';

// Offline cashier/manager PIN verification, matching
// apps/api/src/lib/pin.ts's hashPin() exactly (Node's crypto.scryptSync
// with default cost params: N=16384, r=8, p=1, keylen=64), stored as
// "salt:hash" hex. Ported from apps/desktop/src/pin.ts + src-tauri/src/pin.rs
// (same algorithm, no native Rust available in RN - scrypt-js's async
// `scrypt` is pure JS and yields periodically rather than blocking the JS
// thread the way a naive synchronous implementation would).
//
// Node treats a string `salt`/`password` argument to scryptSync via its
// default 'utf8' encoding - i.e. the salt actually used is the UTF-8 BYTES
// of the 32-character hex STRING (32 bytes), not the 16 raw bytes you'd get
// by hex-decoding it. Confirmed against desktop's own real-hash test vector
// (pin.rs's verify_pin_matches_a_real_node_generated_hash) - getting this
// wrong would silently reject every valid PIN.
const KEY_LENGTH = 64;
const N = 16384;
const R = 8;
const P = 1;

/** Till PINs are 4-6 digits (see StaffScreen.tsx's "Till PIN (4-6 digits)" field) - shared so PinPad's dot count and early-submit threshold stay in sync with the actual policy. */
export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 6;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function scryptHex(pin: string, saltHex: string): Promise<string> {
  const password = new TextEncoder().encode(pin);
  const salt = new TextEncoder().encode(saltHex);
  const derived = await scrypt(password, salt, N, R, P, KEY_LENGTH);
  return bytesToHex(derived);
}

/** `stored` is the "salt:hash" format written by hashPin() in apps/api/src/lib/pin.ts (and synced down as the `pin_hash` column). */
async function verifyPinHash(pin: string, stored: string): Promise<boolean> {
  const [saltHex, expectedHash] = stored.split(':');
  if (!saltHex || !expectedHash) return false;
  const actualHash = await scryptHex(pin, saltHex);
  // Constant-time-ish compare, not full timing-attack hardening - same
  // priority call desktop's pin.rs already made for a 4-6 digit till PIN
  // checked locally: correctness over side-channel resistance.
  if (actualHash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHash.length; i++) {
    diff |= actualHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}

interface LocalUserCandidate {
  id: number;
  phone: string | null;
  name: string | null;
  role: string;
  pin_hash: string | null;
}

type Identifier = { phone: string } | { userId: number };

/**
 * Fully-offline PIN check against a specific role subset's pin_hash,
 * already synced down locally. Shared by manager-authorization pre-check
 * (findManagerAndCheckPinLocally), fast cashier switching
 * (findStaffAndCheckPinLocally), and offline session resume
 * (checkPinLocallyById) below - same mechanism, different role filter/
 * identifier, so it's factored out once rather than duplicated.
 */
async function findUserAndCheckPinLocally(
  identifier: Identifier,
  pin: string,
  allowedRoles: string[],
): Promise<{ userId: number; role: string; name: string | null; valid: boolean } | null> {
  const db = getDb();
  const placeholders = allowedRoles.map(() => '?').join(', ');
  const [whereColumn, whereValue] = 'phone' in identifier ? ['phone', identifier.phone] : ['id', identifier.userId];
  // status = 'active' excludes a banned staff member from the candidate
  // pool entirely, the same way a not-found phone would - this is the
  // offline half of banning someone; the online half (blocking password/
  // PIN login, and kicking an already-connected till within its token's
  // ~1hr lifetime) lives server-side. Takes effect here as soon as this
  // till's `users` bucket has synced since the ban.
  const rows = await db.getAll<LocalUserCandidate>(
    `SELECT id, phone, name, role, pin_hash FROM users WHERE ${whereColumn} = ? AND role IN (${placeholders}) AND status = 'active'`,
    [whereValue, ...allowedRoles],
  );
  const candidate = rows[0];
  if (!candidate || !candidate.pin_hash) return null;

  const valid = await verifyPinHash(pin, candidate.pin_hash);
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
  managerPhone: string,
  pin: string,
): Promise<{ managerId: number; name: string | null; valid: boolean } | null> {
  const result = await findUserAndCheckPinLocally({ phone: managerPhone }, pin, ['manager', 'owner']);
  return result ? { managerId: result.userId, name: result.name, valid: result.valid } : null;
}

/**
 * Fast cashier switching: any staff member - cashier, manager, or owner -
 * can "clock in" as the active cashier for subsequent sales via PIN alone,
 * without a full logout/login cycle or losing the underlying PowerSync
 * connection. Identified by phone (the till's fast-login identifier
 * everywhere else), not email.
 */
export async function findStaffAndCheckPinLocally(
  phone: string,
  pin: string,
): Promise<{ userId: number; role: string; name: string | null; valid: boolean } | null> {
  return findUserAndCheckPinLocally({ phone }, pin, ['cashier', 'manager', 'owner']);
}

/**
 * Offline session resume (App.tsx/session.ts) - re-verifies the specific
 * cached user's own PIN on a cold start, not a general "who is this"
 * lookup like the two functions above.
 */
export async function checkPinLocallyById(
  userId: number,
  pin: string,
): Promise<{ userId: number; role: string; name: string | null; valid: boolean } | null> {
  return findUserAndCheckPinLocally({ userId }, pin, ['cashier', 'manager', 'owner']);
}

/**
 * The actual authorization: requires connectivity, re-verifies the
 * manager's PIN server-side before changing the order's status. This is
 * what a cashier's own session can't do on its own.
 */
export async function authorizeOrderStatusChange(
  payloadToken: string,
  orderId: string,
  status: 'refunded' | 'voided',
  managerId: number,
  pin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/orders/${orderId}/authorize-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
      body: JSON.stringify({ status, managerId, pin }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body?.error ?? `Request failed (HTTP ${res.status})` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: OFFLINE_MESSAGE };
  }
}

/**
 * Marks a credit sale as settled - manager/owner only. Same Option-A shape
 * as authorizeOrderStatusChange above (a cashier's local PIN check is only
 * ever a fast pre-check; the server re-verifies the PIN itself and is the
 * actual authority).
 */
export async function authorizeSettlement(
  payloadToken: string,
  orderId: string,
  managerId: number,
  pin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/orders/${orderId}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
      body: JSON.stringify({ managerId, pin }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body?.error ?? `Request failed (HTTP ${res.status})` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: OFFLINE_MESSAGE };
  }
}

/**
 * Records one installment against a credit sale - same Option-A shape as
 * authorizeSettlement (managerId/pin are only actually read server-side when
 * the requesting session's own role is cashier; an owner/manager session
 * settles under its own identity and these are ignored, but are still sent
 * unconditionally by callers here for one uniform call shape).
 */
export async function recordCreditPayment(
  payloadToken: string,
  orderId: string,
  amount: number,
  method: 'cash' | 'mpesa' | 'card' | 'other',
  note: string | undefined,
  managerId: number,
  pin: string,
): Promise<{ ok: true; amountPaid: number; balance: number } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/orders/${orderId}/record-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
      body: JSON.stringify({ amount, method, note, managerId, pin }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body?.error ?? `Request failed (HTTP ${res.status})` };
    }
    return { ok: true, amountPaid: body.amountPaid, balance: body.balance };
  } catch {
    return { ok: false, error: OFFLINE_MESSAGE };
  }
}
