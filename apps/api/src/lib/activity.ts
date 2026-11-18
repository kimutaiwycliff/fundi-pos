import type { Payload } from 'payload';
import { sql } from 'drizzle-orm';

// Records that someone used Fundi POS today, for the /platform console's
// activity and health columns (collections/TenantActivityDays.ts). One
// upsert per person per Nairobi day:
//   - a sign-in adds to `logins` (always counted),
//   - anything else adds a "ping" - at most one per 5 minutes per person
//     per app, so pings ~ the number of 5-minute stretches they were active.
// Best effort: never throws, never fails the request it rides on.
//
// Fire-and-forget, deliberately NOT awaited by callers: the hooks that call
// this (afterLogin, afterChange...) run inside the request's own database
// transaction, which holds a row lock on the user. This upsert runs on a
// separate pooled connection and its foreign key to users needs that same
// row - awaiting it inside the hook deadlocked every login (the hook waits
// on the insert, the insert waits on the transaction the hook belongs to).
// Unawaited, it simply lands once the request's transaction commits.

export type ActivitySource = 'web' | 'desktop' | 'mobile';

const PING_WINDOW_MS = 5 * 60 * 1000;
// Single API process, so an in-memory throttle is enough; a restart just
// lets one extra ping through.
const lastPing = new Map<string, number>();

// Tills and the web dashboard send X-Fundi-Client; older till builds don't,
// so fall back to a user-agent guess.
export function activitySource(headers: Headers | null | undefined): ActivitySource {
  const declared = headers?.get('x-fundi-client');
  if (declared === 'web' || declared === 'desktop' || declared === 'mobile') return declared;
  const ua = headers?.get('user-agent') ?? '';
  if (/okhttp|Expo|ReactNative|Dalvik|CFNetwork/i.test(ua)) return 'mobile';
  if (/tauri/i.test(ua)) return 'desktop';
  return 'web';
}

type ActivityArgs = { userId: number | string; tenantId: number | string | null | undefined; source: ActivitySource; login?: boolean };

const pending = new Set<Promise<void>>();

export function recordActivity(payload: Payload, args: ActivityArgs): void {
  const job = writeActivity(payload, args).finally(() => pending.delete(job));
  pending.add(job);
}

// Waits for every activity write started so far (tests).
export async function flushActivity(): Promise<void> {
  await Promise.all([...pending]);
}

async function writeActivity(payload: Payload, args: ActivityArgs): Promise<void> {
  try {
    if (args.tenantId == null) return;
    const login = args.login ? 1 : 0;
    if (!login) {
      const key = `${args.userId}:${args.source}`;
      const now = Date.now();
      if (now - (lastPing.get(key) ?? 0) < PING_WINDOW_MS) return;
      lastPing.set(key, now);
      if (lastPing.size > 10_000) lastPing.clear();
    }
    await payload.db.drizzle.execute(sql`
      INSERT INTO tenant_activity_days (tenant_id, user_id, day, logins, pings, sources, first_seen_at, last_seen_at, updated_at, created_at)
      VALUES (
        ${Number(args.tenantId)}, ${Number(args.userId)}, to_char(now() AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM-DD'),
        ${login}, ${login ? 0 : 1}, jsonb_build_array(${args.source}::text), now(), now(), now(), now()
      )
      ON CONFLICT (user_id, day) DO UPDATE SET
        logins = tenant_activity_days.logins + EXCLUDED.logins,
        pings = tenant_activity_days.pings + EXCLUDED.pings,
        sources = (
          SELECT jsonb_agg(DISTINCT s)
          FROM jsonb_array_elements_text(COALESCE(tenant_activity_days.sources, '[]'::jsonb) || EXCLUDED.sources) AS s
        ),
        last_seen_at = now(),
        updated_at = now()
    `);
  } catch (err) {
    console.warn('[activity] could not record activity', err);
  }
}
