// Date.prototype.toLocaleString() (and its …DateString/…TimeString
// siblings) without an explicit locale/timeZone use whatever the CURRENT
// RUNTIME defaults to - which differs between the server (Node, usually
// UTC in a Docker container) and the browser (whatever OS locale/timezone
// the user is in). For a component that's server-rendered once and then
// hydrated client-side, that mismatch throws a real hydration error and
// forces React to discard and rebuild the whole tree - caught live on the
// Sales page, where the server rendered "31/08/2026, 09:52:42" and the
// client immediately replaced it with "8/31/2026, 9:52:42 AM". Pinning
// both locale and timeZone here makes server and client render byte-
// identical output, and keeps every timestamp in this Kenya-only app on
// Kenya's actual wall-clock time regardless of which timezone the server
// process happens to run in.
const LOCALE = 'en-GB';
const TIME_ZONE = 'Africa/Nairobi';

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, { timeZone: TIME_ZONE });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, { timeZone: TIME_ZONE });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, { timeZone: TIME_ZONE });
}

// East Africa Time is a fixed UTC+3 offset year-round (no DST), so this is
// pure arithmetic - no Intl API needed, unlike converting an arbitrary
// instant BACK into a Nairobi calendar date (apps/api/src/lib/
// salesAggregate.ts's own nairobiDateToUTC does the same thing server-side,
// for the same reason: a "YYYY-MM-DD" typed into a date filter means that
// full Nairobi calendar day, not a UTC-shifted slice of it that could start
// or end 3 hours off from what the person actually meant).
export function nairobiDateToUTC(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, -3, 0, 0));
}
