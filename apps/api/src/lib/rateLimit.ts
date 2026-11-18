// In-memory sliding-window limiter (the API is a single process; a restart
// just resets the counters). Returns false once `limit` hits within `windowMs`.
const hits = new Map<string, number[]>();

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 50_000) hits.clear();
  return true;
}

export function resetLimit(key: string): void {
  hits.delete(key);
}
