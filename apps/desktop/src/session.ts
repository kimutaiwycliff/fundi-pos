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

// 30 days, matching the server's own TILL_TOKEN_TTL_SECONDS
// (apps/api/src/lib/tillAuth.ts) and mobile's session.ts exactly - a till
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
