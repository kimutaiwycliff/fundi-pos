import type { PayloadUser } from './auth';

// Lets a till that has already authenticated once online resume straight
// into the Till UI on a later cold start, even with zero connectivity - a
// blackout that also reboots the till's own computer shouldn't force
// waiting for internet just to log back in, when everything past login is
// already designed to work offline. Re-entry is still gated by the
// existing local PIN check (pin.ts), never a bare "was logged in before".
//
// localStorage, not a new persistence mechanism - same pattern terminal.ts
// already uses for this till's own id/name.
const SESSION_KEY = 'hardware-pos-offline-session';

// User's own call: 24h balances covering a single offline business day/
// overnight outage against how long a lost or stolen till could keep
// working before the server gets a chance to notice (banned staff,
// role changes, etc) via a fresh online login.
const OFFLINE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface PersistedSession {
  payloadToken: string;
  user: PayloadUser;
  storeId: number | null;
  /** Date.now() at the moment of the last successful ONLINE login. */
  savedAt: number;
}

export function saveSession(payloadToken: string, user: PayloadUser, storeId: number | null): void {
  const record: PersistedSession = { payloadToken, user, storeId, savedAt: Date.now() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(record));
}

/** Updates just the store scope of an already-saved session (branch switch), without resetting the 24h clock. */
export function updateSessionStore(storeId: number | null): void {
  const existing = loadSessionRaw();
  if (!existing) return;
  existing.storeId = storeId;
  localStorage.setItem(SESSION_KEY, JSON.stringify(existing));
}

function loadSessionRaw(): PersistedSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
}

/** Returns null (and clears the record) once the 24h resume window has passed - a fresh online login is required after that, not just a stale one. */
export function loadSession(): PersistedSession | null {
  const record = loadSessionRaw();
  if (!record) return null;
  if (Date.now() - record.savedAt > OFFLINE_SESSION_TTL_MS) {
    clearSession();
    return null;
  }
  return record;
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
