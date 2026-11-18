// The /api/platform-stats response is cached for a minute (it scans every
// tenant), but anything an operator just changed must show up immediately -
// recording a payment that then still reads "Overdue" on the next page load
// would be worse than no cache. So every write that feeds those numbers
// (tenants, subscription payments, follow-up notes) clears it. Activity
// pings and synced sales don't: a minute's lag there is harmless.
const TTL_MS = 60 * 1000;
let entry: { at: number; body: unknown } | null = null;

export function getCachedStats(): unknown | null {
  return entry && Date.now() - entry.at < TTL_MS ? entry.body : null;
}

export function setCachedStats(body: unknown): void {
  entry = { at: Date.now(), body };
}

export function invalidatePlatformStats(): void {
  entry = null;
}
