import { useMemo, useState } from 'react';
import { Till } from './Till';
import { Reports } from './ReportsScreen';
import { Inventory } from './InventoryScreen';
import { Restock } from './RestockScreen';
import { Quotations } from './QuotationsScreen';
import type { PayloadUser } from './auth';
import { BoxIcon, CartIcon, ChartIcon, ReceiptIcon, TruckIcon } from './icons';

type Section = 'sell' | 'reports' | 'inventory' | 'restock' | 'quotations';

const NAV_ITEMS: { key: Section; label: string; Icon: (props: { className?: string }) => React.ReactElement; managerOnly?: boolean }[] = [
  { key: 'sell', label: 'Sell', Icon: CartIcon },
  { key: 'reports', label: 'Reports', Icon: ChartIcon },
  { key: 'inventory', label: 'Inventory', Icon: BoxIcon },
  { key: 'restock', label: 'Restock', Icon: TruckIcon },
  // Matches Quotations.ts's own access control server-side (manager/owner
  // only for every operation, a cashier session gets a 403) - hidden here
  // rather than left to fail loudly against a section a cashier can't use.
  { key: 'quotations', label: 'Quotations', Icon: ReceiptIcon, managerOnly: true },
];

interface AppShellProps {
  user: PayloadUser;
  terminalId: string;
  terminalName: string | null;
  onRenameTerminal: (name: string) => void;
  payloadToken: string;
  onDisconnect: () => void;
  activeStoreId: number | null;
  canSelectStore: boolean;
  onSwitchStore: (storeId: number) => Promise<void>;
  switchingStore: boolean;
}

// Top-level view switcher added on top of what used to be a bare <Till>
// render in App.tsx's "connected" branch - App.tsx's own login state
// machine is untouched, this just takes over what it renders once logged
// in. Every section stays mounted once first visited (not unmounted when
// you tab away) so an in-progress cart/restock draft/report filter isn't
// silently lost by glancing at another tab - same reasoning as why Till's
// own held-sales exist, just applied one level up.
export function AppShell(props: AppShellProps) {
  const [section, setSection] = useState<Section>('sell');
  const [visited, setVisited] = useState<Set<Section>>(() => new Set<Section>(['sell']));
  // Matches RestockScreen.tsx's/InventoryScreen.tsx's own canSeeCost/canManage
  // checks - owner and manager only.
  const canSeeManagerSections = props.user.role === 'owner' || props.user.role === 'manager';
  const navItems = useMemo(() => NAV_ITEMS.filter((item) => !item.managerOnly || canSeeManagerSections), [canSeeManagerSections]);

  function selectSection(key: Section) {
    setSection(key);
    setVisited((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }

  return (
    <div className="app-shell">
      <nav className="app-sidebar">
        {navItems.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            className={`app-sidebar-item ${section === key ? 'is-active' : ''}`}
            onClick={() => selectSection(key)}
          >
            <Icon className="icon" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="app-shell-content">
        <div className="app-shell-pane" hidden={section !== 'sell'}>
          <Till
            user={props.user}
            terminalId={props.terminalId}
            terminalName={props.terminalName}
            onRenameTerminal={props.onRenameTerminal}
            payloadToken={props.payloadToken}
            onDisconnect={props.onDisconnect}
            activeStoreId={props.activeStoreId}
            canSelectStore={props.canSelectStore}
            onSwitchStore={props.onSwitchStore}
            switchingStore={props.switchingStore}
          />
        </div>

        {visited.has('reports') ? (
          <div className="app-shell-pane app-shell-pane-padded" hidden={section !== 'reports'}>
            <Reports user={props.user} payloadToken={props.payloadToken} />
          </div>
        ) : null}

        {visited.has('inventory') ? (
          <div className="app-shell-pane app-shell-pane-padded" hidden={section !== 'inventory'}>
            <Inventory user={props.user} storeId={props.activeStoreId} payloadToken={props.payloadToken} />
          </div>
        ) : null}

        {visited.has('restock') ? (
          <div className="app-shell-pane app-shell-pane-padded" hidden={section !== 'restock'}>
            <Restock user={props.user} storeId={props.activeStoreId} payloadToken={props.payloadToken} />
          </div>
        ) : null}

        {visited.has('quotations') && canSeeManagerSections ? (
          <div className="app-shell-pane app-shell-pane-padded" hidden={section !== 'quotations'}>
            <Quotations user={props.user} storeId={props.activeStoreId} payloadToken={props.payloadToken} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
