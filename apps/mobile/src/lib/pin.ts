import { normalizeKenyanPhone } from '@hardware-pos/business-logic';
import { API_BASE_URL, OFFLINE_MESSAGE } from './auth';

// This file used to also do fully-offline PIN verification (scrypt against
// a locally-synced `users.pin_hash` row) for three things: offline session
// resume, fast cashier-switching, and a manager-authorization *pre-check*
// ahead of a void/refund or credit-settlement. Now that this app is
// online-only (no local database at all), none of that local verification
// is possible any more - offline resume is removed outright (see App.tsx),
// and the manager-authorization pre-check below is replaced with a plain
// REST lookup of the manager's id by phone. This was never the actual
// authorization anyway (see authorizeOrderStatusChange/recordCreditPayment
// below, which the server always independently re-verifies the PIN
// against) - only a fast local check for immediate "wrong PIN" feedback
// before spending a round trip. Losing that early feedback (a wrong PIN now
// surfaces via the server's own error response instead of instantly) is an
// accepted, minor consequence of going online-only, not a security change:
// the server-side re-check this always depended on for the real decision is
// untouched.

/** Till PINs are 4-6 digits (see StaffScreen.tsx's "Till PIN (4-6 digits)" field) - shared so PinPad's dot count and early-submit threshold stay in sync with the actual policy. */
export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 6;

/**
 * Resolves a manager/owner's user id from their phone number via Payload's
 * own REST list endpoint for `users` (read access is ownTenantOnly - any
 * authenticated staff member of this tenant can look up another by phone,
 * same as StaffScreen.tsx's staff list). Does NOT verify the PIN at all -
 * that happens server-side in authorizeOrderStatusChange/recordCreditPayment
 * below, which is the actual security boundary.
 */
export async function findManagerByPhone(
  payloadToken: string,
  phone: string,
): Promise<{ managerId: number; name: string | null } | null> {
  const normalized = normalizeKenyanPhone(phone);
  if (!normalized) return null;
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/users?where[phone][equals]=${encodeURIComponent(normalized)}&where[role][in]=manager,owner&where[status][equals]=active&limit=1&depth=0`,
      { headers: { Authorization: `JWT ${payloadToken}` } },
    );
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    const doc = body?.docs?.[0];
    if (!doc) return null;
    return { managerId: doc.id, name: doc.name ?? null };
  } catch {
    return null;
  }
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
