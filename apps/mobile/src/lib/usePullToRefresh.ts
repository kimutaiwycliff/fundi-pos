import { useCallback, useState } from 'react';

// Every screen this wires into already keeps its data current via
// PowerSync's continuous connection (see db/database.ts's connect() - a
// live stream, not polling), so pulling down never has a real "fetch" step
// to wait on; it just re-runs that screen's own local query and gives a
// brief, visible confirmation that what's on screen really is the latest
// synced state, rather than the gesture appearing to do nothing.
export function usePullToRefresh(refresh: () => void) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 400);
  }, [refresh]);

  return { refreshing, onRefresh };
}
