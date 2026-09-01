import * as SecureStore from 'expo-secure-store';
import type { PayloadUser } from './auth';

// Lets a till that has already authenticated once online resume straight
// into the till UI on a later cold start, even with zero connectivity - a
// blackout that also reboots the till's own phone shouldn't force waiting
// for internet just to log back in, when everything past login is already
// designed to work offline. Re-entry is still gated by the existing local
// PIN check (pin.ts), never a bare "was logged in before".
//
// expo-secure-store (Keychain on iOS, Keystore-backed EncryptedSharedPreferences
// on Android), not AsyncStorage - this record holds a live Payload session
// JWT, same sensitivity tier as terminal.ts's PIN-adjacent identifiers.
const SESSION_KEY = 'hardware-pos-offline-session';

// User's own call: 24h balances covering a single offline business day/
// overnight outage against how long a lost or stolen till could keep
// working before the server gets a chance to notice (banned staff, role
// changes, etc) via a fresh online login. Matches desktop's session.ts exactly.
const OFFLINE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface PersistedSession {
  payloadToken: string;
  user: PayloadUser;
  storeId: number | null;
  /** Date.now() at the moment of the last successful ONLINE login. */
  savedAt: number;
}

export async function saveSession(payloadToken: string, user: PayloadUser, storeId: number | null): Promise<void> {
  const record: PersistedSession = { payloadToken, user, storeId, savedAt: Date.now() };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(record));
}

/** Updates just the store scope of an already-saved session (branch switch), without resetting the 24h clock. */
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

/** Returns null (and clears the record) once the 24h resume window has passed - a fresh online login is required after that, not just a stale one. */
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
