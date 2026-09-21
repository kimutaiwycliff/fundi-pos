import { useEffect, useState } from 'react';
import { getDb } from './database';

/**
 * Desktop's own equivalent of mobile's `@powersync/react` `useQuery` hook
 * (that package doesn't work in a Tauri WebView - see this repo's top-level
 * notes). PowerSync's own `db.watch()` (see
 * node_modules/@powersync/tauri-plugin's shared-internals'
 * BasePowerSyncDatabase.ts - `@powersync/tauri-plugin`'s `PowerSyncTauriDatabase`
 * extends it) already re-runs a query and re-notifies whenever one of the
 * tables it reads from changes locally - a new row landing via sync, or a
 * local write via db.execute/writeTransaction - so this hook is only the
 * thin React binding around that callback form of `watch`:
 * `db.watch(sql, params, { onResult, onError }, { signal })`. The `signal`
 * (a plain AbortController/AbortSignal, not anything PowerSync-specific) is
 * how a subscription is torn down - `watchWithCallback`'s only cleanup path
 * is `signal.addEventListener('abort', ...)`, there's no dispose function
 * returned directly.
 *
 * Every screen before this hook did a one-shot `db.getAll()` inside a
 * `useEffect` keyed on its own dependency array, so results only ever
 * refreshed when that effect re-ran (a keystroke, a prop change) - never
 * when the underlying data itself changed, e.g. another till selling the
 * last unit of something already on screen. This hook fixes that class of
 * staleness everywhere it's used.
 *
 * `params` identity matters for the effect dependency: a fresh array/object
 * literal on every render (the common case - most call sites build params
 * inline) would otherwise re-subscribe on every single render, not just
 * when the actual values change. Comparing by a stringified key sidesteps
 * that without requiring every caller to remember to `useMemo` its params.
 */
export function useWatchedQuery<T>(sql: string, params: unknown[] = []): { data: T[] } {
  const [data, setData] = useState<T[]>([]);
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    getDb().watch(
      sql,
      // Deliberately re-parsed from paramsKey rather than closing over the
      // outer `params` - the effect's own deps are [sql, paramsKey], so on
      // a re-run triggered by some *other* render's params (same key,
      // different reference - shouldn't happen given JSON.stringify, but
      // keeps this effect's inputs unambiguous) this always reflects
      // exactly the params paramsKey was derived from.
      JSON.parse(paramsKey),
      {
        onResult: (result) => {
          if (!cancelled) setData(result.array as T[]);
        },
        onError: (error) => {
          if (!cancelled) {
            console.error(`useWatchedQuery failed for: ${sql}`, error);
          }
        },
      },
      { signal: controller.signal },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sql, paramsKey]);

  return { data };
}
