import { useCallback, useState } from 'react';

// Every screen this wires into now reads straight from the Payload API
// (plain REST fetch, no local database) rather than PowerSync's continuous
// sync connection - so unlike before, there's no separate "connection" to
// re-establish before refreshing; pulling down just re-runs the screen's own
// fetch. The brief minimum-visible-time delay is kept purely for a visible,
// deliberate confirmation that the pull actually did something, even when
// the underlying fetch resolves near-instantly.
export function usePullToRefresh(refresh: () => void | Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  }, [refresh]);

  return { refreshing, onRefresh };
}
