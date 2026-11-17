// Fire-and-forget work that must never block - or deadlock - the request
// it's started from (see lib/activity.ts for why awaiting a separate-
// connection write inside a Payload hook hangs). Errors are logged, never
// thrown. Tests call flushBackground() to wait for everything started.
const pending = new Set<Promise<unknown>>();

export function background(label: string, task: () => Promise<unknown>): void {
  const job: Promise<unknown> = task()
    .catch((err) => console.warn(`[${label}] failed`, err))
    .finally(() => pending.delete(job));
  pending.add(job);
}

export async function flushBackground(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending]);
}
