import { useEffect, useMemo, useState } from 'react';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { computeOrderTotals, type LineInput } from '@hardware-pos/business-logic';
import { getDb } from './database';
import { API_BASE_URL, type PayloadUser } from './auth';
import { VoidOrderPanel } from './VoidOrderPanel';
import { ShiftPanel } from './ShiftPanel';
import { CashierSwitcher } from './CashierSwitcher';
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
  // A percentage (0-100, clamped to the product's own max_discount_percent),
  // not the flat currency amount business-logic's LineInput expects - see
  // lineDiscountAmount below for the conversion at the point of use.
  discountPercent: number;
}

function lineDiscountAmount(line: CartLine): number {
  return (line.quantity * line.product.sell_price * line.discountPercent) / 100;
}

interface TillProps {
  user: PayloadUser;
  terminalId: string;
  payloadToken: string;
  onDisconnect: () => void;
}

// Cash is first-class per spec Section 6.5 ("always available offline, no
// queuing needed"). M-Pesa needs connectivity at time of transaction - the
// STK push itself is a live call to Safaricom, initiated below once the
// order has synced. Card was removed from the tender list at the user's
// request - the tender type itself still supports 'card' in the schema if
// that changes later.
const TENDER_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'mpesa', label: 'M-Pesa' },
] as const;

// UNVERIFIED against a real Safaricom sandbox (see lib/daraja.ts on the
// server) - the order write below is durable regardless of whether this
// succeeds. The retry exists because the local write and the PowerSync
// upload aren't atomic: /api/payments/mpesa/initiate looks the order up
// server-side, which only works once it's actually synced up, typically
// sub-second but not instant.
async function initiateMpesaPayment(payloadToken: string, orderId: string, phone: string): Promise<void> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await tauriFetch(`${API_BASE_URL}/api/payments/mpesa/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
      body: JSON.stringify({ orderId, phone }),
    });
    if (res.ok) return;
    const body = await res.json().catch(() => ({}));
    lastError = body?.error ?? `HTTP ${res.status}`;
    if (res.status !== 404) break; // only retry "order not synced yet" - not e.g. a real Daraja rejection
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(lastError ?? 'M-Pesa STK push failed');
}

export function Till({ user, terminalId, payloadToken, onDisconnect }: TillProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocalProduct[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [tenderType, setTenderType] = useState<(typeof TENDER_OPTIONS)[number]['value']>('cash');
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [completing, setCompleting] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [activeCashier, setActiveCashier] = useState({ id: user.id, email: user.email, name: user.name ?? null });
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [tenant, setTenant] = useState<LocalTenant | null>(null);
  const [heldSalesOpen, setHeldSalesOpen] = useState(false);
  const [voidPanelOpen, setVoidPanelOpen] = useState(false);
  const [printerSettingsOpen, setPrinterSettingsOpen] = useState(false);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [shiftBlockOpen, setShiftBlockOpen] = useState(false);
  const showToast = useToast();

  const storeId = typeof user.store === 'object' ? user.store?.id : user.store;
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

  useEffect(() => {
    const db = getDb();
    const dispose = db.registerListener({
      statusChanged: (status) => {
        setIsOnline(Boolean(status.connected));
      },
    });
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
      dispose();
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
      return [...prev, { product, quantity: 1, discountPercent: 0 }];
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
        : prev.map((l) => (l.product.id === productId ? { ...l, quantity } : l)),
    );
  }

  function updateDiscountPercent(productId: string, rawValue: number) {
    const line = cart.find((l) => l.product.id === productId);
    if (!line) return;
    const max = line.product.max_discount_percent;
    const clamped = Math.min(Math.max(rawValue, 0), max);
    if (rawValue > max) {
      showToast(`Max discount for ${line.product.name} is ${max}%`, 'error');
    }
    setCart((prev) => prev.map((l) => (l.product.id === productId ? { ...l, discountPercent: clamped } : l)));
  }

  async function completeSale() {
    if (cart.length === 0 || storeId == null) return;
    if (activeShift == null) {
      showToast('Open a shift before completing a sale', 'error');
      return;
    }
    if (tenderType === 'mpesa' && !mpesaPhone.trim()) {
      showToast("Enter the customer's phone number for the M-Pesa prompt", 'error');
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
      // Cash is settled the moment it's handed over - 'paid' immediately.
      // Mobile money isn't settled until the customer approves the STK
      // prompt on their phone, which the (unverified) Daraja callback
      // resolves later - starts 'pending', same as the server-side schema.
      const paymentStatus = tenderType === 'mpesa' ? 'pending' : 'paid';

      // One local transaction for the order + all its line items, so
      // PowerSync's upload queue drains them together and the Rust
      // connector (src-tauri/src/connector.rs) can assemble one nested
      // POST to /api/sync/orders instead of racing partial state.
      await db.writeTransaction(async (tx) => {
        await tx.execute(
          `INSERT INTO orders
             (id, tenant_id, store_id, terminal, cashier_id, tax_total, discount_total, total,
              tender_type, payment_status, status, created_offline, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', 1, ?)`,
          [
            orderId,
            tenantId,
            storeId,
            terminalId,
            activeCashier.id,
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

      showToast(`Sale completed - ${tenderType === 'mpesa' ? 'M-Pesa' : 'Cash'} ${totals.total.toFixed(2)}`, 'success');

      if (tenderType === 'mpesa') {
        // Best-effort, same as printing below - the sale is already
        // durably recorded regardless of whether the STK push itself
        // succeeds. A failure here just means the cashier has to retry
        // the push or fall back to cash - it never undoes the sale.
        const phone = mpesaPhone.trim();
        initiateMpesaPayment(payloadToken, orderId, phone).then(
          () => showToast(`M-Pesa prompt sent to ${phone}`, 'success'),
          (err) => showToast(`M-Pesa prompt failed: ${err instanceof Error ? err.message : String(err)}`, 'error'),
        );
        setMpesaPhone('');
      }

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
      }).catch((err) => {
        showToast(`Receipt print failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
      });

      setCart([]);
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
              {user.name || user.email} · {user.role} · terminal {terminalId}
            </p>
          </div>
        </div>

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
          <button className="btn btn-ghost btn-icon" onClick={() => setPrinterSettingsOpen(true)} aria-label="Printer settings">
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

          {results.length > 0 ? (
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
                        min={0}
                        max={line.product.max_discount_percent}
                        step={1}
                        value={line.discountPercent}
                        onChange={(e) => updateDiscountPercent(line.product.id, Number(e.currentTarget.value) || 0)}
                      />
                      <span>% (max {line.product.max_discount_percent}%)</span>
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
            {tenderType === 'mpesa' && (
              <input
                placeholder="Customer phone (e.g. 0712345678)"
                value={mpesaPhone}
                onChange={(e) => setMpesaPhone(e.currentTarget.value)}
              />
            )}

            <div className="cart-actions">
              <button
                className="btn btn-primary btn-lg btn-block"
                disabled={cart.length === 0 || completing || activeShift == null}
                onClick={completeSale}
              >
                {completing ? 'Completing...' : activeShift == null ? 'Open a shift to sell' : 'Complete sale'}
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

      <Drawer open={printerSettingsOpen} onClose={() => setPrinterSettingsOpen(false)} title="Printer settings">
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
        message="You have an open shift on this terminal. Close it below before switching cashiers or logging out."
        confirmLabel="Got it"
        onConfirm={() => setShiftBlockOpen(false)}
      />
    </div>
  );
}
