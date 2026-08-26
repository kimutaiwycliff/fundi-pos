import { useEffect, useMemo, useRef, useState } from 'react';
import { computeOrderTotals, type LineInput } from '@hardware-pos/business-logic';
import { getDb } from './database';
import { type PayloadUser } from './auth';
import { VoidOrderPanel } from './VoidOrderPanel';
import { ShiftPanel } from './ShiftPanel';
import { CashierSwitcher } from './CashierSwitcher';
import { BranchSwitcher } from './BranchSwitcher';
import { CustomerPicker, type LocalCustomer } from './CustomerPicker';
import { FindSalePanel } from './FindSalePanel';
import { deleteHeldSale, holdSale, listHeldSales, type HeldSale } from './heldSales';
import { printReceipt } from './printer';
import { PrinterSettings } from './PrinterSettings';
import { Drawer } from './Drawer';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';
import type { Shift } from './shifts';
import {
  ArchiveIcon,
  ClockIcon,
  MinusIcon,
  PlusIcon,
  PrinterIcon,
  ReceiptIcon,
  SearchIcon,
  ShieldIcon,
  UndoIcon,
  WifiIcon,
  WifiOffIcon,
  WrenchIcon,
} from './icons';

interface LocalProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  sell_price: number;
  tax_rate: number;
  max_discount_percent: number;
  stock_on_hand: number;
}

interface LocalTenant {
  name: string;
  receipt_header: string | null;
  receipt_footer: string | null;
}

interface CartLine {
  product: LocalProduct;
  quantity: number;
  // A flat currency amount off this line's subtotal (not a percentage) -
  // cashiers think in "how many shillings off", not percentages. The
  // product's own max_discount_percent is still what a manager configures
  // (scales sensibly regardless of price/quantity) - maxDiscountAmount
  // below converts that cap into the equivalent shilling ceiling for
  // whatever's actually in the cart right now.
  discountAmount: number;
}

function lineDiscountAmount(line: CartLine): number {
  return line.discountAmount;
}

function maxDiscountAmountForLine(line: Pick<CartLine, 'quantity' | 'product'>): number {
  return (line.quantity * line.product.sell_price * line.product.max_discount_percent) / 100;
}

interface TillProps {
  user: PayloadUser;
  terminalId: string;
  terminalName: string | null;
  onRenameTerminal: (name: string) => void;
  payloadToken: string;
  onDisconnect: () => void;
  // Whichever store this till is currently scoped to for stock_movements/
  // orders sync (see /api/powersync/token) - null only while a multi-store
  // user hasn't picked a branch yet.
  activeStoreId: number | null;
  // True only for an owner/manager overseeing multiple stores (Users.store
  // is null) - a cashier/manager with one fixed store never sees a toggle.
  canSelectStore: boolean;
  onSwitchStore: (storeId: number) => Promise<void>;
  switchingStore: boolean;
}

interface LocalStore {
  id: number;
  name: string;
}

// Cash is first-class per spec Section 6.5 ("always available offline, no
// queuing needed"). M-Pesa is purely a tender-type label for how the
// customer actually paid (they pay the till/paybill number directly,
// outside this app) - per the user's own explicit instruction, this is
// deliberately NOT an STK-push integration; no phone number capture, no
// live call to Safaricom, no "pending until the customer approves"
// state. It behaves exactly like cash: settled the instant the sale is
// rung up. Card was removed from the tender list at the user's request -
// the tender type itself still supports 'card' in the schema if that
// changes later. Credit is a "pay later" tab, tied to a customer -
// always starts pending, settled later via FindSalePanel.
const TENDER_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'mpesa', label: 'M-Pesa' },
  { value: 'credit', label: 'Credit' },
] as const;

export function Till({
  user,
  terminalId,
  terminalName,
  onRenameTerminal,
  payloadToken,
  onDisconnect,
  activeStoreId,
  canSelectStore,
  onSwitchStore,
  switchingStore,
}: TillProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocalProduct[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [tenderType, setTenderType] = useState<(typeof TENDER_OPTIONS)[number]['value']>('cash');
  const [selectedCustomer, setSelectedCustomer] = useState<LocalCustomer | null>(null);
  const [completing, setCompleting] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [activeCashier, setActiveCashier] = useState({ id: user.id, phone: user.phone ?? null, name: user.name ?? null });
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [tenant, setTenant] = useState<LocalTenant | null>(null);
  const [stores, setStores] = useState<LocalStore[]>([]);
  const [heldSalesOpen, setHeldSalesOpen] = useState(false);
  const [voidPanelOpen, setVoidPanelOpen] = useState(false);
  const [findSaleOpen, setFindSaleOpen] = useState(false);
  const [terminalSettingsOpen, setTerminalSettingsOpen] = useState(false);
  const [terminalNameDraft, setTerminalNameDraft] = useState(terminalName ?? '');
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [shiftBlockOpen, setShiftBlockOpen] = useState(false);
  const showToast = useToast();

  const storeId = activeStoreId;
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;

  async function refreshHeldSales() {
    setHeldSales(await listHeldSales());
  }

  useEffect(() => {
    refreshHeldSales();
  }, []);

  // Business name + receipt header/footer, synced down via PowerSync's
  // tenants stream (docker/powersync/sync-config.yaml) - printing works
  // fully offline once this has synced once, same as everything else here.
  useEffect(() => {
    if (tenantId == null) return;
    const db = getDb();
    db.getAll<LocalTenant>('SELECT name, receipt_header, receipt_footer FROM tenants WHERE id = ?', [
      String(tenantId),
    ]).then((rows) => setTenant(rows[0] ?? null));
  }, [tenantId]);

  // stores is tenant-wide (not store-scoped) per sync-config.yaml, so this
  // is always available regardless of which branch is currently active -
  // exactly what lets a multi-store user see every branch to switch to
  // before/without having picked one yet.
  useEffect(() => {
    if (tenantId == null) return;
    const db = getDb();
    db.getAll<{ id: string; name: string }>('SELECT id, name FROM stores WHERE tenant_id = ? ORDER BY name', [tenantId]).then(
      (rows) => setStores(rows.map((r) => ({ id: Number(r.id), name: r.name }))),
    );
  }, [tenantId]);

  // A store-eligible user (owner/manager with no fixed store) who hasn't
  // picked a branch yet is connected with store_id: null in their
  // PowerSync token - every store-scoped stream (stock_movements, orders,
  // store_product_overrides - see sync-config.yaml) then matches zero
  // rows, while products still shows fine (tenant-wide, no store filter).
  // Caught live: every product searched fine but showed as out of stock,
  // with nothing in the UI explaining why - the till was sitting in this
  // exact unpicked-branch state the whole time. With only one store to
  // choose from there's no real decision to make, so pick it
  // automatically rather than leaving that choice for someone to notice.
  //
  // autoSelectAttempted is a ref, not state: onSwitchStore is a fresh
  // function reference on every App.tsx render (not memoized), so this
  // effect re-runs far more often than activeStoreId/stores actually
  // change. A failed switch leaves activeStoreId null - without a ref
  // tracking "already tried", every one of those re-runs would retry it
  // again, forever, with the failure itself invisible (App.tsx's error
  // state is never rendered once <Till> has mounted - the only place this
  // runs from). Caught live in production: repeated silent reconnects
  // over several minutes, stock never once actually synced.
  const autoSelectAttempted = useRef(false);
  useEffect(() => {
    if (!canSelectStore || activeStoreId != null || stores.length !== 1) return;
    if (autoSelectAttempted.current) return;
    autoSelectAttempted.current = true;
    onSwitchStore(stores[0].id).catch((err) => {
      showToast(`Couldn't connect to ${stores[0].name}: ${err instanceof Error ? err.message : String(err)}`, 'error');
    });
  }, [canSelectStore, activeStoreId, stores, onSwitchStore, showToast]);

  // A cart built against one store's stock/prices can't carry over to
  // another - cleared on every branch switch (including the initial one,
  // a harmless no-op since it starts empty anyway).
  useEffect(() => {
    setCart([]);
    setSelectedCustomer(null);
    setQuery('');
    setResults([]);
  }, [storeId]);

  async function handleHoldSale() {
    if (cart.length === 0) return;
    await holdSale(JSON.stringify(cart));
    setCart([]);
    await refreshHeldSales();
    showToast('Sale held', 'success');
  }

  async function handleResumeSale(held: HeldSale) {
    setCart(JSON.parse(held.cartJson) as CartLine[]);
    await deleteHeldSale(held.id);
    await refreshHeldSales();
    showToast('Sale resumed', 'success');
  }

  // Barcode scanners are plain USB-HID keyboard input (spec: "no plugin
  // needed") - they type into whatever has focus and end with Enter, so a
  // focused search box that submits on Enter already handles scans with no
  // special-case code.
  useEffect(() => {
    let active = true;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const db = getDb();
    // stock_on_hand is derived, never stored (the ledger is the only source
    // of truth - see stock-adjustment-dialog.tsx's own comment on the web
    // side) - summed here per product/store in the same query so search
    // results can both display it and gate against overselling.
    db.getAll<LocalProduct>(
      `SELECT p.id, p.name, p.sku, p.barcode, p.sell_price, p.tax_rate, p.max_discount_percent,
              COALESCE((SELECT SUM(sm.quantity_delta) FROM stock_movements sm
                        WHERE sm.product_id = p.id AND sm.store_id = ?), 0) AS stock_on_hand
       FROM products p
       WHERE p.tenant_id = ? AND (p.sku LIKE ? OR p.barcode = ? OR p.name LIKE ?)
       ORDER BY p.name LIMIT 20`,
      [storeId ?? null, tenantId, `%${trimmed}%`, trimmed, `%${trimmed}%`],
    ).then((rows) => {
      if (active) setResults(rows);
    });
    return () => {
      active = false;
    };
  }, [query, tenantId, storeId]);

  // navigator.onLine (+ the browser's online/offline events) instead of
  // PowerSync's own status.connected: that reflects the sync protocol's
  // own connection state, which only updates once PowerSync notices and
  // successfully reconnects - the same reconnect path already found to
  // silently get stuck (see the auto-select-store fix above). The OS-level
  // network interface signal is unconditionally reliable and updates the
  // instant the adapter actually goes up/down, regardless of whether
  // PowerSync's own sync stream has caught up yet.
  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    const db = getDb();
    const interval = setInterval(async () => {
      // ps_crud is PowerSync's own local upload-queue table (confirmed via
      // direct sqlite3 inspection during the Phase 0 spike) - counting it
      // directly is simpler and more robust than trying to derive a
      // pending-count from SyncStatus, which doesn't expose one.
      try {
        const rows = await db.getAll<{ c: number }>('SELECT COUNT(*) as c FROM ps_crud');
        setPendingSyncCount(rows[0]?.c ?? 0);
      } catch {
        setPendingSyncCount(null);
      }
    }, 2000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  const lineInputs: LineInput[] = useMemo(
    () =>
      cart.map((line) => ({
        quantity: line.quantity,
        unitPrice: line.product.sell_price,
        discount: lineDiscountAmount(line),
        taxRate: line.product.tax_rate,
      })),
    [cart],
  );
  const totals = useMemo(() => computeOrderTotals(lineInputs), [lineInputs]);

  // The till only knows about stock it has already searched for in this
  // session (product.stock_on_hand is a snapshot from the search query, not
  // re-queried live) - good enough to stop a cashier ringing up more of one
  // item than the shelf has, without a DB round-trip on every +/- click.
  function addToCart(product: LocalProduct) {
    const existing = cart.find((l) => l.product.id === product.id);
    const nextQuantity = (existing?.quantity ?? 0) + 1;
    if (nextQuantity > product.stock_on_hand) {
      showToast(`Only ${product.stock_on_hand} ${product.name} left in stock`, 'error');
      return;
    }
    setCart((prev) => {
      if (existing) {
        return prev.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { product, quantity: 1, discountAmount: 0 }];
    });
    setQuery('');
    setResults([]);
  }

  function updateQuantity(productId: string, quantity: number) {
    const line = cart.find((l) => l.product.id === productId);
    if (line && quantity > line.quantity && quantity > line.product.stock_on_hand) {
      showToast(`Only ${line.product.stock_on_hand} ${line.product.name} left in stock`, 'error');
      return;
    }
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.product.id !== productId)
        : prev.map((l) => {
            if (l.product.id !== productId) return l;
            // A quantity decrease can shrink the discount ceiling below
            // whatever flat amount was already entered - re-clamp so the
            // cart never ends up implying a bigger discount % than the
            // product actually allows.
            const max = maxDiscountAmountForLine({ quantity, product: l.product });
            return { ...l, quantity, discountAmount: Math.min(l.discountAmount, max) };
          }),
    );
  }

  function updateDiscountAmount(productId: string, rawValue: number) {
    const line = cart.find((l) => l.product.id === productId);
    if (!line) return;
    const max = maxDiscountAmountForLine(line);
    const clamped = Math.min(Math.max(rawValue, 0), max);
    if (rawValue > max) {
      showToast(`Max discount for ${line.product.name} is ${max.toFixed(2)}`, 'error');
    }
    setCart((prev) => prev.map((l) => (l.product.id === productId ? { ...l, discountAmount: clamped } : l)));
  }

  async function completeSale() {
    if (cart.length === 0 || storeId == null) return;
    if (activeShift == null) {
      showToast('Open a shift before completing a sale', 'error');
      return;
    }
    if (tenderType === 'credit' && !selectedCustomer) {
      showToast('Select a customer for a credit sale', 'error');
      return;
    }
    // Final authoritative check right before committing - a line's snapshot
    // stock could be stale if it sat in the cart a while (another till
    // selling the same product, a manual stock adjustment, etc.).
    const oversold = cart.find((line) => line.quantity > line.product.stock_on_hand);
    if (oversold) {
      showToast(`Only ${oversold.product.stock_on_hand} ${oversold.product.name} left in stock`, 'error');
      return;
    }
    setCompleting(true);
    try {
      const db = getDb();
      const orderId = crypto.randomUUID();
      const now = new Date().toISOString();
      // Cash and M-Pesa are both settled the moment the sale is rung up -
      // M-Pesa here is purely a tender-type label for how the customer
      // paid (they pay the till/paybill directly, outside this app), not
      // an integration that pushes a live payment request - per the
      // user's own explicit instruction, no STK push, no phone number
      // capture. Credit is the one real "not actually paid yet" case,
      // resolved by a manager/owner marking it settled later (see
      // FindSalePanel/authorizeSettlement).
      const paymentStatus = tenderType === 'credit' ? 'pending' : 'paid';

      // One local transaction for the order + all its line items, so
      // PowerSync's upload queue drains them together and the Rust
      // connector (src-tauri/src/connector.rs) can assemble one nested
      // POST to /api/sync/orders instead of racing partial state.
      await db.writeTransaction(async (tx) => {
        await tx.execute(
          `INSERT INTO orders
             (id, tenant_id, store_id, terminal, terminal_name, cashier_id, customer_id, tax_total, discount_total, total,
              tender_type, payment_status, status, created_offline, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', 1, ?)`,
          [
            orderId,
            tenantId,
            storeId,
            terminalId,
            terminalName,
            activeCashier.id,
            selectedCustomer ? Number(selectedCustomer.id) : null,
            totals.taxTotal,
            totals.discountTotal,
            totals.total,
            tenderType,
            paymentStatus,
            now,
          ],
        );

        for (let i = 0; i < cart.length; i++) {
          const line = cart[i];
          await tx.execute(
            `INSERT INTO orders_line_items (id, _parent_id, _order, product_id, variant, quantity, unit_price, discount)
             VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
            // Number(line.product.id): products.id is a PowerSync-implicit
            // TEXT primary key locally, but this column mirrors Postgres's
            // real INTEGER foreign key (schema.ts declares product_id as
            // column.integer) - binding the raw string here is what let a
            // "275" string leak into the sync queue and get rejected by
            // Payload's numeric relationship field server-side (see
            // src-tauri/src/connector.rs's to_number, which patches this up
            // defensively for anything already queued before this fix).
            [
              crypto.randomUUID(),
              orderId,
              i,
              Number(line.product.id),
              line.quantity,
              line.product.sell_price,
              lineDiscountAmount(line),
            ],
          );
        }
      });

      const tenderLabel = TENDER_OPTIONS.find((t) => t.value === tenderType)?.label ?? tenderType;
      showToast(`Sale completed - ${tenderLabel} ${totals.total.toFixed(2)}`, 'success');

      // Printing is best-effort and must never undo or block a completed
      // sale - the order above is already durably recorded regardless of
      // whether a receipt can be printed (spec's offline-first premise
      // would be undermined if the source of truth depended on a
      // peripheral). UNVERIFIED against real hardware.
      printReceipt({
        storeName: tenant?.name ?? 'Fundi',
        orderId,
        lines: cart.map((line) => ({
          name: line.product.name,
          quantity: line.quantity,
          unitPrice: line.product.sell_price,
          lineTotal: line.quantity * line.product.sell_price - lineDiscountAmount(line),
        })),
        taxTotal: totals.taxTotal,
        total: totals.total,
        tenderType,
        header: tenant?.receipt_header,
        footer: tenant?.receipt_footer,
        unpaidNotice: tenderType === 'credit' ? 'UNPAID - PAY LATER' : null,
      }).catch((err) => {
        showToast(`Receipt print failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
      });

      setCart([]);
      setSelectedCustomer(null);
    } catch (err) {
      showToast(`Error completing sale: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setCompleting(false);
    }
  }

  const trimmedQuery = query.trim();

  return (
    <div className="till-shell">
      <header className="till-topbar">
        <div className="till-identity">
          <span className="brand-mark">
            <WrenchIcon />
          </span>
          <div className="till-identity-text">
            <p className="till-identity-title">{tenant?.name ?? 'Fundi Till'}</p>
            <p className="till-identity-sub">
              {user.name || user.email} · {user.role} · {terminalName ?? terminalId}
            </p>
          </div>
        </div>

        <BranchSwitcher
          stores={stores}
          activeStoreId={activeStoreId}
          canSelectStore={canSelectStore}
          shiftOpen={activeShift != null}
          switching={switchingStore}
          onSwitch={(id) => {
            // Manual switch shares the same invisible-failure problem the
            // auto-select effect above had - BranchSwitcher itself has no
            // error UI of its own, so surface it the same way.
            onSwitchStore(id).catch((err) => {
              showToast(`Couldn't switch store: ${err instanceof Error ? err.message : String(err)}`, 'error');
            });
          }}
          onBlocked={() => setShiftBlockOpen(true)}
        />

        <div className="till-topbar-spacer" />

        <span className={`status-pill ${isOnline ? 'online' : 'offline'}`}>
          {isOnline ? <WifiIcon /> : <WifiOffIcon />}
          {isOnline ? 'Online' : 'Offline'}
          {pendingSyncCount != null && pendingSyncCount > 0 ? (
            <span className="sync-count">· {pendingSyncCount} pending</span>
          ) : null}
        </span>

        <div className="till-topbar-actions">
          <CashierSwitcher
            active={activeCashier}
            onSwitch={setActiveCashier}
            canSwitch={activeShift == null}
            onBlocked={() => setShiftBlockOpen(true)}
          />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => (activeShift != null ? setShiftBlockOpen(true) : setLogoutConfirmOpen(true))}
          >
            Log out
          </button>
        </div>
      </header>

      <div className="till-utilitybar">
        {storeId != null && tenantId != null && (
          <ShiftPanel
            payloadToken={payloadToken}
            tenantId={tenantId}
            storeId={storeId}
            onShiftChange={setActiveShift}
            terminalId={terminalId}
            cashierId={activeCashier.id}
          />
        )}

        <div className="quick-actions">
          <button className="btn btn-secondary btn-sm quick-action-btn" onClick={() => setHeldSalesOpen(true)}>
            <ClockIcon />
            Held sales
            {heldSales.length > 0 && <span className="badge-count">{heldSales.length}</span>}
          </button>
          {storeId != null && (
            <button className="btn btn-secondary btn-sm" onClick={() => setVoidPanelOpen(true)}>
              <ShieldIcon />
              Void / refund
            </button>
          )}
          {storeId != null && (
            <button className="btn btn-secondary btn-sm" onClick={() => setFindSaleOpen(true)}>
              <ReceiptIcon />
              Find a sale
            </button>
          )}
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => {
              setTerminalNameDraft(terminalName ?? '');
              setTerminalSettingsOpen(true);
            }}
            aria-label="Terminal settings"
          >
            <PrinterIcon />
          </button>
        </div>
      </div>

      <div className="till-body">
        <section className="till-search-pane">
          <div className="search-box">
            <SearchIcon />
            <input
              autoFocus
              placeholder="Scan barcode or search by name/SKU..."
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results.length > 0) addToCart(results[0]);
              }}
            />
          </div>

          {storeId == null ? (
            <div className="pane-empty-state">
              <WrenchIcon />
              <p className="pane-empty-state-title">Select a branch to start selling</p>
              <p className="pane-empty-state-hint">Use the branch switcher at the top of the screen to pick a store.</p>
            </div>
          ) : results.length > 0 ? (
            <div className="search-results-grid">
              {results.map((product) => {
                const outOfStock = product.stock_on_hand <= 0;
                return (
                  <button
                    key={product.id}
                    className={`product-card ${outOfStock ? 'is-out-of-stock' : ''}`}
                    disabled={outOfStock}
                    onClick={() => addToCart(product)}
                  >
                    <span className="product-card-name">{product.name}</span>
                    <span className="product-card-meta">{product.sku}</span>
                    <span className="product-card-row">
                      <span className="product-card-price">{product.sell_price.toFixed(2)}</span>
                      <span className={`product-card-stock ${outOfStock ? 'is-out' : ''}`}>
                        {outOfStock ? 'Out of stock' : `${product.stock_on_hand} in stock`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : trimmedQuery ? (
            <div className="pane-empty-state">
              <SearchIcon />
              <p className="pane-empty-state-title">No products match &ldquo;{trimmedQuery}&rdquo;</p>
              <p className="pane-empty-state-hint">Try a different name, SKU, or scan the barcode directly.</p>
            </div>
          ) : (
            <div className="pane-empty-state">
              <WrenchIcon />
              <p className="pane-empty-state-title">Ready to sell</p>
              <p className="pane-empty-state-hint">Scan a barcode or start typing to add a product to the sale.</p>
            </div>
          )}
        </section>

        <aside className="till-cart-pane">
          <div className="cart-header">
            <h2>Current sale</h2>
            <span className="cart-header-count">{cart.length} item{cart.length === 1 ? '' : 's'}</span>
          </div>

          {cart.length === 0 ? (
            <div className="cart-empty">
              <ArchiveIcon />
              <p className="cart-empty-hint">Cart is empty - search or scan a product to get started.</p>
            </div>
          ) : (
            <div className="cart-list">
              {cart.map((line) => (
                <div key={line.product.id} className="cart-line">
                  <div className="cart-line-main">
                    <div className="cart-line-info">
                      <p className="cart-line-name">{line.product.name}</p>
                      <p className="cart-line-price">{line.product.sell_price.toFixed(2)} each</p>
                    </div>
                    <div className="qty-stepper">
                      <button onClick={() => updateQuantity(line.product.id, line.quantity - 1)} aria-label="Decrease quantity">
                        <MinusIcon />
                      </button>
                      <span>{line.quantity}</span>
                      <button onClick={() => updateQuantity(line.product.id, line.quantity + 1)} aria-label="Increase quantity">
                        <PlusIcon />
                      </button>
                    </div>
                    <span className="cart-line-total">
                      {(line.quantity * line.product.sell_price - lineDiscountAmount(line)).toFixed(2)}
                    </span>
                  </div>
                  {line.product.max_discount_percent > 0 && (
                    <label className="cart-line-discount">
                      Discount
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={maxDiscountAmountForLine(line)}
                        step={0.01}
                        placeholder="0.00"
                        // '' instead of a literal 0 when there's no discount
                        // yet - otherwise a real "0" sits in the box and has
                        // to be selected/deleted before typing a value.
                        value={line.discountAmount === 0 ? '' : line.discountAmount}
                        onChange={(e) => updateDiscountAmount(line.product.id, Number(e.currentTarget.value) || 0)}
                      />
                      <span>(max {maxDiscountAmountForLine(line).toFixed(2)})</span>
                    </label>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="till-cart-footer">
            <div className="totals-block">
              <div className="totals-row">
                <span>Tax</span>
                <span>{totals.taxTotal.toFixed(2)}</span>
              </div>
              {totals.discountTotal > 0 && (
                <div className="totals-row">
                  <span>Discount</span>
                  <span>-{totals.discountTotal.toFixed(2)}</span>
                </div>
              )}
              <div className="totals-row total">
                <span>Total</span>
                <span>{totals.total.toFixed(2)}</span>
              </div>
            </div>

            <div className="tender-toggle" role="group" aria-label="Tender type">
              {TENDER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={tenderType === option.value}
                  onClick={() => setTenderType(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {tenderType === 'credit' && tenantId != null && (
              <CustomerPicker
                tenantId={tenantId}
                payloadToken={payloadToken}
                value={selectedCustomer}
                onChange={setSelectedCustomer}
              />
            )}

            <div className="cart-actions">
              <button
                className="btn btn-primary btn-lg btn-block"
                disabled={
                  cart.length === 0 ||
                  completing ||
                  activeShift == null ||
                  (tenderType === 'credit' && !selectedCustomer)
                }
                onClick={completeSale}
              >
                {completing
                  ? 'Completing...'
                  : activeShift == null
                    ? 'Open a shift to sell'
                    : tenderType === 'credit' && !selectedCustomer
                      ? 'Select a customer'
                      : 'Complete sale'}
              </button>
              <button className="btn btn-secondary btn-block" disabled={cart.length === 0} onClick={handleHoldSale}>
                Hold sale
              </button>
            </div>
          </div>
        </aside>
      </div>

      <Drawer open={heldSalesOpen} onClose={() => setHeldSalesOpen(false)} title="Held sales">
        {heldSales.length === 0 ? (
          <p className="pane-empty-state-hint">No held sales right now.</p>
        ) : (
          <ul className="held-sales-list">
            {heldSales.map((held) => (
              <li key={held.id} className="held-sale-row">
                <span>{new Date(held.createdAt).toLocaleTimeString()}</span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    handleResumeSale(held);
                    setHeldSalesOpen(false);
                  }}
                >
                  <UndoIcon />
                  Resume
                </button>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      <Drawer open={voidPanelOpen} onClose={() => setVoidPanelOpen(false)} title="Void or refund a sale">
        {storeId != null && <VoidOrderPanel storeId={storeId} payloadToken={payloadToken} />}
      </Drawer>

      <Drawer open={findSaleOpen} onClose={() => setFindSaleOpen(false)} title="Find a sale">
        {storeId != null && <FindSalePanel storeId={storeId} payloadToken={payloadToken} tenant={tenant} />}
      </Drawer>

      <Drawer open={terminalSettingsOpen} onClose={() => setTerminalSettingsOpen(false)} title="Terminal settings">
        <div className="field">
          <span className="field-label">Till name</span>
          <div className="terminal-name-form">
            <input value={terminalNameDraft} onChange={(e) => setTerminalNameDraft(e.currentTarget.value)} />
            <button
              className="btn btn-primary btn-sm"
              disabled={!terminalNameDraft.trim()}
              onClick={() => {
                onRenameTerminal(terminalNameDraft);
                showToast('Till name updated', 'success');
              }}
            >
              Save
            </button>
          </div>
          <p className="pane-empty-state-hint">Shown on receipts and used to identify this machine in audit history.</p>
        </div>
        <PrinterSettings />
      </Drawer>

      <ConfirmDialog
        open={logoutConfirmOpen}
        title="Log out?"
        message="You'll need to log back in to keep selling on this terminal."
        confirmLabel="Log out"
        danger
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          onDisconnect();
        }}
      />

      <ConfirmDialog
        open={shiftBlockOpen}
        title="Close your shift first"
        message="You have an open shift on this terminal. Close it below before switching cashiers, switching branches, or logging out."
        confirmLabel="Got it"
        onConfirm={() => setShiftBlockOpen(false)}
      />
    </div>
  );
}
