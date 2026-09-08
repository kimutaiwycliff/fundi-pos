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

// 30 days, matching the server's own TILL_TOKEN_TTL_SECONDS
// (apps/api/src/lib/tillAuth.ts) and desktop's session.ts exactly - a till
// connected once can keep resuming fully offline for up to this long. Kept
// well short of "forever" for the same reason it was ever bounded at all:
// how long a lost/stolen till or a since-banned staff member could keep
// working before a fresh online login (or the periodic background refresh
// in App.tsx, which slides this window forward on its own while online)
// would catch it. PowerSync's own ~1hr credential re-check (see
// /api/powersync/token) independently re-verifies banned/billing status
// too, so a till with ANY connectivity during those 30 days is caught much
// sooner than this bound alone suggests - it's a true worst case, not the
// typical one.
const OFFLINE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
