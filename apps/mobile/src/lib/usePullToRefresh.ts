import { useCallback, useState } from 'react';
import { ensureConnected } from '../db/database';

// Every screen this wires into keeps its data current via PowerSync's
// continuous connection (see db/database.ts's connect() - a live stream,
// not polling) - but nothing else in the app watches for that connection
// dropping (backgrounding, a wifi blip) and reconnecting it, so pulling
// down is also this app's only recovery path: ensureConnected() first
// re-establishes the socket if it's stalled, then `refresh()` re-runs (or,
// for a screen on PowerSync's reactive useQuery, just confirms) that
// screen's own query, giving a brief, visible confirmation that what's on
// screen really is the latest synced state.
export function usePullToRefresh(refresh: () => void | Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await ensureConnected();
      await refresh();
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  }, [refresh]);

  return { refreshing, onRefresh };
}
