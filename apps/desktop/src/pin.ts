import { normalizeKenyanPhone } from '@hardware-pos/business-logic';
import { apiFetch, API_BASE_URL, OFFLINE_MESSAGE } from './auth';

// This file used to also do fully-offline PIN verification (scrypt against a
// locally-synced users.pin_hash row, via the Rust-side verify_manager_pin
// command in src-tauri/src/pin.rs - both now deleted) for three things:
// offline session resume, fast cashier-switching, and a manager-
// authorization *pre-check* ahead of a void/refund or credit-settlement. Now
// that this app is online-only (no local database at all), none of that
// local verification is possible any more - offline resume is removed
// outright (see App.tsx), fast cashier-switching now goes through a real
// loginWithPin call instead (see CashierSwitcher.tsx), and the manager-
// authorization pre-check below is replaced with a plain REST lookup of the
// manager's id by phone. This mirrors apps/mobile/src/lib/pin.ts's identical
// simplification. The lookup below was never the actual authorization
// anyway (see authorizeOrderStatusChange/authorizeSettlement, which the
// server always independently re-verifies the PIN against) - only a fast
// local check for immediate "wrong PIN" feedback before spending a round
// trip. Losing that early feedback (a wrong PIN now surfaces via the
// server's own error response instead of instantly) is an accepted, minor
// consequence of going online-only, not a security change: the server-side
// re-check this always depended on for the real decision is untouched.

/**
 * Looks up a manager/owner by phone - does NOT verify a PIN at all (there's
 * nothing local left to check it against). Used ahead of
 * authorizeOrderStatusChange/authorizeSettlement purely to resolve a phone
 * number typed at the till into the managerId those calls need; the actual
 * PIN check happens server-side inside those calls.
 */
export async function findManagerByPhone(
  payloadToken: string,
  phone: string,
): Promise<{ managerId: number; name: string | null } | null> {
  const normalized = normalizeKenyanPhone(phone);
  if (!normalized) return null;
  try {
    const res = await apiFetch(
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
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/orders/${orderId}/authorize-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
      body: JSON.stringify({ status, managerId, pin }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body?.error ?? `Request failed (HTTP ${res.status})` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : OFFLINE_MESSAGE };
  }
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
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/orders/${orderId}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
      body: JSON.stringify({ managerId, pin }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body?.error ?? `Request failed (HTTP ${res.status})` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : OFFLINE_MESSAGE };
  }
}
