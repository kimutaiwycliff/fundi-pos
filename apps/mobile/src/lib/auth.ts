// Auth flow against the Payload API (apps/api), ported from
// apps/desktop/src/auth.ts. RN's built-in `fetch` isn't subject to a
// webview's CORS policy the way desktop's Tauri webview is (there's no
// browser origin here at all), so this uses plain `fetch` instead of
// desktop's @tauri-apps/plugin-http workaround.
//
// EXPO_PUBLIC_-prefixed env vars are inlined into the JS bundle at build
// time by Expo's own env system (same public-config precedent as
// apps/desktop's VITE_-prefixed vars / apps/web's NEXT_PUBLIC_-prefixed
// ones) - falls back to the dev machine's LAN-reachable ports when unset,
// since `localhost` from a physical device/emulator means the device
// itself, not the dev machine.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3011';
export const POWERSYNC_URL = process.env.EXPO_PUBLIC_POWERSYNC_URL ?? 'http://localhost:8080';

export interface PayloadUser {
  id: number;
  email: string;
  phone?: string | null;
  name?: string | null;
  role: string;
  tenant: number | { id: number };
  store?: number | { id: number } | null;
}

export interface LoginResult {
  payloadToken: string;
  user: PayloadUser;
}

/** POST /api/users/login - standard Payload email/password auth. */
export async function loginToPayload(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${API_BASE_URL}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.errors?.[0]?.message ?? body?.error ?? `Login failed (HTTP ${res.status})`);
  }
  if (!body?.token) {
    throw new Error('Payload login response did not include a token');
  }

  return { payloadToken: body.token as string, user: body.user as PayloadUser };
}

/**
 * POST /api/auth/pin-login - fast till login: phone + PIN instead of
 * email + password. Still requires connectivity (mints a real, fresh
 * Payload session server-side) - NOT the same thing as the fully-offline
 * PIN check in pin.ts used for cashier-switching/manager-authorization
 * within an already-connected session. Returns the identical shape as
 * loginToPayload so callers don't need to branch on which method was used.
 */
export async function loginWithPin(phone: string, pin: string): Promise<LoginResult> {
  const res = await fetch(`${API_BASE_URL}/api/auth/pin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, pin }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error ?? `PIN login failed (HTTP ${res.status})`);
  }
  if (!body?.token) {
    throw new Error('PIN login response did not include a token');
  }

  return { payloadToken: body.token as string, user: body.user as PayloadUser };
}

/**
 * POST /api/auth/till-refresh - slides this till's session forward another
 * TILL_TOKEN_TTL_SECONDS (30 days server-side, see apps/api/src/lib/
 * tillAuth.ts) without requiring a fresh phone+PIN login. Called
 * periodically from App.tsx while connected (see its own refresh-timer
 * effect) - a till that's regularly online this way never actually hits
 * its 30-day local resume cap (session.ts); only one that goes fully
 * offline for the entire window does. Requires the CURRENT token to still
 * be unexpired - this is a sliding renewal, not a way to resurrect an
 * already-lapsed session (that needs loginWithPin/loginToPayload again).
 */
export async function refreshTillToken(payloadToken: string): Promise<LoginResult> {
  const res = await fetch(`${API_BASE_URL}/api/auth/till-refresh`, {
    method: 'POST',
    headers: { Authorization: `JWT ${payloadToken}` },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error ?? `Session refresh failed (HTTP ${res.status})`);
  }
  if (!body?.token) {
    throw new Error('Refresh response did not include a token');
  }

  return { payloadToken: body.token as string, user: body.user as PayloadUser };
}

/**
 * GET /api/powersync/token - exchanges the Payload session JWT for a
 * short-lived (1hr) RS256 JWT scoped for PowerSync client auth (tenant_id/
 * store_id/role claims, see apps/api/src/lib/powersyncAuth.ts). Called once
 * here up front purely to fail fast with a readable error if login/
 * authorization is broken - the real connector (db/connector.ts) calls this
 * same endpoint itself every time PowerSync asks it for fresh credentials.
 */
export async function fetchPowerSyncToken(payloadToken: string, storeId?: number | null): Promise<string> {
  const url = storeId != null ? `${API_BASE_URL}/api/powersync/token?storeId=${storeId}` : `${API_BASE_URL}/api/powersync/token`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `JWT ${payloadToken}` },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error ?? `PowerSync token fetch failed (HTTP ${res.status})`);
  }
  if (!body?.token) {
    throw new Error('PowerSync token response did not include a token');
  }

  return body.token as string;
}
