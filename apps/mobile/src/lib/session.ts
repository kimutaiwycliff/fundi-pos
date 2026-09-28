import * as SecureStore from 'expo-secure-store';
import type { PayloadUser } from './auth';

// Persists a logged-in till session so a cold start (including Android
// reclaiming the app's process while it's backgrounded, which is normal,
// frequent OS behavior - not something a shared-till app should treat as a
// sign-out) can resume straight into the till UI instead of forcing a fresh
// phone+PIN/email+password login every time. Briefly deleted alongside
// PowerSync (commit e6266dc) as an over-broad side effect of that removal -
// restored here since the underlying problem (session state living only in
// React state, wiped whenever the process dies) was never actually tied to
// PowerSync itself.
//
// expo-secure-store (Keystore-backed EncryptedSharedPreferences on Android,
// Keychain on iOS), not AsyncStorage - this record holds a live Payload
// session JWT, same sensitivity tier as terminal.ts's PIN-adjacent
// identifiers.
const SESSION_KEY = 'hardware-pos-offline-session';

// 30 days, matching the server's own TILL_TOKEN_TTL_SECONDS
// (apps/api/src/lib/tillAuth.ts) and desktop's identical session-lifetime
// reasoning - a till connected once can keep resuming for up to this long
// without a fresh login. App.tsx's own periodic refresh (and the
// immediate post-login refresh added alongside this file) slides this
// window forward while the app has any connectivity at all, so hitting this
// bound in practice means the till has been fully offline for the entire 30
// days, not the typical case.
const OFFLINE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface PersistedSession {
  payloadToken: string;
  user: PayloadUser;
  storeId: number | null;
  /** Date.now() at the moment this record was last written (login or a successful refresh). */
  savedAt: number;
}

export async function saveSession(payloadToken: string, user: PayloadUser, storeId: number | null): Promise<void> {
  const record: PersistedSession = { payloadToken, user, storeId, savedAt: Date.now() };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(record));
}

/** Updates just the store scope of an already-saved session (branch switch), without resetting the 30-day clock. */
export async function updateSessionStore(storeId: number | null): Promise<void> {
  const existing = await loadSessionRaw();
  if (!existing) return;
  existing.storeId = storeId;
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(existing));
}

async function loadSessionRaw(): Promise<PersistedSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
}

/** Returns null (and clears the record) once the 30-day resume window has passed - a fresh online login is required after that, not just a stale one. */
export async function loadSession(): Promise<PersistedSession | null> {
  const record = await loadSessionRaw();
  if (!record) return null;
  if (Date.now() - record.savedAt > OFFLINE_SESSION_TTL_MS) {
    await clearSession();
    return null;
  }
  return record;
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
