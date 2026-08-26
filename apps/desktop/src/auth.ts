// Auth flow against the Payload API (apps/api), running on port 3011.
//
// Payload's payload.config.ts only allows CORS from http://localhost:3000
// (apps/web's dashboard). The Tauri dev webview serves from
// http://localhost:1420 (see src-tauri/tauri.conf.json's devUrl), so a
// browser-enforced `fetch()` call from the webview to port 3011 is blocked
// by CORS. `@tauri-apps/plugin-http`'s `fetch` issues the HTTP request from
// the Rust side instead of the webview's network stack, so it is not
// subject to the webview's CORS policy - confirmed via
// node_modules/@tauri-apps/plugin-http's guest-js, which just wraps a plain
// Fetch-API-shaped call proxied through a Tauri command.
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

// apps/api (Payload) and the PowerSync service. Vite-env-driven so a real
// distributed build points at the real production domains instead of a
// dev machine's own localhost - caught live: every installed till was
// silently trying to reach localhost:3011 on the CASHIER'S OWN computer,
// since these were plain hardcoded string literals before. `.env.production`
// (committed, not secret - these are public URLs, same as apps/web's own
// NEXT_PUBLIC_API_URL) supplies the real values; `vite build` (what
// `tauri build` runs via beforeBuildCommand) loads it automatically since
// production is its default mode. Falls back to the original dev ports
// when no .env.production is picked up (plain `vite dev`/`npm run dev`).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3011';
export const POWERSYNC_URL = import.meta.env.VITE_POWERSYNC_URL ?? 'http://localhost:8080';

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
  const res = await tauriFetch(`${API_BASE_URL}/api/users/login`, {
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
 * email + password. Still requires connectivity (it mints a real, fresh
 * Payload session server-side, the same way loginToPayload does) - this is
 * NOT the same thing as the fully-offline PIN check in pin.ts used for
 * cashier-switching/manager-authorization within an already-connected
 * session. Returns the identical shape as loginToPayload so callers don't
 * need to branch on which method was used.
 */
export async function loginWithPin(phone: string, pin: string): Promise<LoginResult> {
  const res = await tauriFetch(`${API_BASE_URL}/api/auth/pin-login`, {
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
 * GET /api/powersync/token - exchanges the Payload session JWT for a
 * short-lived (1hr) RS256 JWT scoped for PowerSync client auth (tenant_id/
 * store_id/role claims, see apps/api/src/lib/powersyncAuth.ts).
 *
 * Called once here up front purely to fail fast with a readable error if
 * login/authorization is broken. The Rust-side connector (see
 * src-tauri/src/connector.rs) calls this same endpoint itself, every time
 * PowerSync asks it for fresh credentials - which is also how the 1hr
 * expiry is handled: PowerSync re-invokes fetch_credentials() on
 * reconnect/expiry, so the connector just re-fetches a new token then.
 */
export async function fetchPowerSyncToken(payloadToken: string, storeId?: number | null): Promise<string> {
  const url = storeId != null ? `${API_BASE_URL}/api/powersync/token?storeId=${storeId}` : `${API_BASE_URL}/api/powersync/token`;
  const res = await tauriFetch(url, {
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
