import { useState } from 'react';

interface StoreOption {
  id: number;
  name: string;
}

interface BranchSwitcherProps {
  stores: StoreOption[];
  activeStoreId: number | null;
  // False for a cashier/manager with a single fixed store (Users.store set)
  // - they never see a toggle at all, just their branch name as plain text.
  // True only for an owner/manager overseeing multiple stores.
  canSelectStore: boolean;
  shiftOpen: boolean;
  switching: boolean;
  onSwitch: (storeId: number) => void;
  onBlocked: () => void;
}

export function BranchSwitcher({
  stores,
  activeStoreId,
  canSelectStore,
  shiftOpen,
  switching,
  onSwitch,
  onBlocked,
}: BranchSwitcherProps) {
  const [open, setOpen] = useState(false);
  const activeName = stores.find((s) => s.id === activeStoreId)?.name ?? (activeStoreId == null ? 'Select a branch' : `Store #${activeStoreId}`);

  if (!canSelectStore) {
    return <span className="branch-tag">{activeName}</span>;
  }

  function handleToggleClick() {
    if (shiftOpen) {
      onBlocked();
      return;
    }
    setOpen((prev) => !prev);
  }

  return (
    <div className="branch-switcher">
      <button className="btn btn-secondary btn-sm" onClick={handleToggleClick} disabled={switching}>
        {switching ? 'Switching...' : activeName}
      </button>
      {open && (
        <div className="branch-switcher-menu">
          {stores.length === 0 ? (
            <p className="pane-empty-state-hint">No stores found yet.</p>
          ) : (
            stores.map((store) => (
              <button
                key={store.id}
                className={`branch-switcher-item ${store.id === activeStoreId ? 'is-active' : ''}`}
                onClick={() => {
                  setOpen(false);
                  if (store.id !== activeStoreId) onSwitch(store.id);
                }}
              >
                {store.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
