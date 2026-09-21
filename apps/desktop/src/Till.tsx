import { useEffect, useMemo, useRef, useState } from 'react';
import { computeOrderTotals, type LineInput } from '@hardware-pos/business-logic';
import { getDb } from './database';
import { useWatchedQuery } from './useWatchedQuery';
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
import { VariantPickerDialog, type LocalVariant } from './VariantPickerDialog';
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
  max_discount_amount: number;
  stock_on_hand: number;
  variant_count: number;
}

interface LocalTenant {
  name: string;
  receipt_header: string | null;
  receipt_footer: string | null;
  shifts_required: number;
  enforce_discount_caps: number;
}

interface CartLine {
  product: LocalProduct;
  // null = the bare product (no variants). A product with variants is
  // never sold as itself - see addToCart, which forces a variant pick
  // first, matching web/Android's identical rule.
  variant: LocalVariant | null;
  quantity: number;
  // A flat currency amount off this line's subtotal (not a percentage) -
  // cashiers think in "how many shillings off", not percentages.
  // max_discount_amount below is that same flat per-unit cap already
  // configured on the product; maxDiscountAmountForLine just scales it by
  // quantity for whatever's actually in the cart right now.
  discountAmount: number;
}

/** Composite key for per-(product, variant) cart/stock lookups - a bare product still needs a stable key distinct from any of its own variants. */
function stockKey(productId: string, variantId?: string | null): string {
  return `${productId}::${variantId ?? ''}`;
}

function lineKey(line: Pick<CartLine, 'product' | 'variant'>): string {
  return stockKey(line.product.id, line.variant?.id ?? null);
}

/** A variant's own price only when it explicitly sets one - most variants share the parent's price. */
function lineUnitPrice(line: Pick<CartLine, 'product' | 'variant'>): number {
  return line.variant?.sell_price ?? line.product.sell_price;
}

function lineDisplayLabel(line: Pick<CartLine, 'product' | 'variant'>): string {
  return line.variant ? `${line.product.name} — ${line.variant.label}` : line.product.name;
}

function lineStock(line: Pick<CartLine, 'product' | 'variant'>): number {
  return line.variant ? line.variant.stock_on_hand : line.product.stock_on_hand;
}

function lineDiscountAmount(line: CartLine): number {
  return line.discountAmount;
}

/** max_discount_amount is a per-unit currency cap - the line's ceiling scales with quantity. */
function maxDiscountAmountForLine(line: Pick<CartLine, 'quantity' | 'product'>): number {
  return line.quantity * line.product.max_discount_amount;
}

/**
 * The discount ceiling actually in force for this line right now.
 *
 * When `capsActive` (i.e. this cashier isn't an owner AND the tenant's
 * enforce_discount_caps toggle is on - see the two call sites below),
 * that's the product's own configured max_discount_amount cap, unchanged
 * from before. Otherwise the cap is bypassed entirely (owners always see
 * the cost/margin they're discounting away, and a tenant that's turned the
 * toggle off has decided staff should too) and the only remaining bound is
 * a basic sanity check: a discount can never exceed - and so can never
 * make negative - the line's own subtotal. Mirrors apps/api's identical
 * `isOwner || !enforceCaps` bypass in Orders.ts's beforeChange hook (the
 * actual server-side authority - this is only the till's own UX-level
 * mirror of it).
 */
function effectiveDiscountCapForLine(line: Pick<CartLine, 'quantity' | 'product' | 'variant'>, capsActive: boolean): number {
  return capsActive ? maxDiscountAmountForLine(line) : line.quantity * lineUnitPrice(line);
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
  const trimmedQuery = query.trim();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [variantPickerProduct, setVariantPickerProduct] = useState<LocalProduct | null>(null);
  const [tenderType, setTenderType] = useState<(typeof TENDER_OPTIONS)[number]['value']>('cash');
  const [selectedCustomer, setSelectedCustomer] = useState<LocalCustomer | null>(null);
  const [completing, setCompleting] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [todayStats, setTodayStats] = useState({ salesTotal: 0, unpaidCreditCount: 0, unpaidCreditTotal: 0 });
  const [activeCashier, setActiveCashier] = useState({ id: user.id, phone: user.phone ?? null, name: user.name ?? null, role: user.role });
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [tenant, setTenant] = useState<LocalTenant | null>(null);
  // Fail-safe default: required until the tenant row has actually synced
  // down, matching this field's own server-side defaultValue: true.
  const shiftsRequired = tenant?.shifts_required !== 0;
  // Same fail-safe direction as shiftsRequired above, matching this field's
  // own server-side defaultValue: true and apps/api's Orders.ts's identical
  // `tenant.enforceDiscountCaps !== false` check. Owners always bypass the
  // cap regardless of the toggle - see effectiveDiscountCapForLine.
  const enforceDiscountCaps = tenant?.enforce_discount_caps !== 0;
  const discountCapsActive = enforceDiscountCaps && activeCashier.role !== 'owner';
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
    db.getAll<LocalTenant>(
      'SELECT name, receipt_header, receipt_footer, shifts_required, enforce_discount_caps FROM tenants WHERE id = ?',
      [String(tenantId)],
    ).then((rows) => setTenant(rows[0] ?? null));
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
  //
  // Reactive (useWatchedQuery, not a one-shot db.getAll): re-runs on its
  // own whenever products/products_variants/stock_movements change
  // locally, not just when the search text changes - so a stock count on
  // screen never goes stale mid-search the way a one-shot snapshot would
  // (another till selling the last unit of something already showing here,
  // a manual stock adjustment landing, etc.). stock_on_hand is derived,
  // never stored (the ledger is the only source of truth - see
  // stock-adjustment-dialog.tsx's own comment on the web side) - summed
  // here per product/store in the same query so search results can both
  // display it and gate against overselling.
  //
  // `AND ? != ''` (bound to trimmedQuery itself) reproduces the old
  // early-return-when-empty behavior in SQL, since a hook can't
  // conditionally skip running its query (hooks can't be called
  // conditionally) - an empty search term now naturally matches zero rows
  // here instead of every product.
  const { data: results } = useWatchedQuery<LocalProduct>(
    `SELECT p.id, p.name, p.sku, p.barcode, p.sell_price, p.tax_rate, p.max_discount_amount,
            COALESCE((SELECT SUM(sm.quantity_delta) FROM stock_movements sm
                      WHERE sm.product_id = p.id AND sm.store_id = ? AND sm.variant IS NULL), 0) AS stock_on_hand,
            (SELECT COUNT(*) FROM products_variants pv WHERE pv._parent_id = p.id) AS variant_count
     FROM products p
     WHERE p.tenant_id = ? AND ? != '' AND (p.sku LIKE ? OR p.barcode = ? OR p.name LIKE ?)
     ORDER BY p.name LIMIT 20`,
    [storeId ?? null, tenantId, trimmedQuery, `%${trimmedQuery}%`, trimmedQuery, `%${trimmedQuery}%`],
  );

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

  // synced_at (not created_at) is the filter column here on purpose:
  // created_at only arrives once an order round-trips through the server
  // and syncs back down (Payload sets it, PowerSync mirrors it down later),
  // so it's still NULL for a sale rung up seconds ago on an offline till -
  // exactly the case this header stat most needs to reflect. synced_at is
  // set from this same device's clock at INSERT time in completeSale()
  // below, online or offline, so it's always available immediately.
  // Unpaid credit has no date filter - it's every outstanding tab on this
  // store, not just today's, since that's the number a cashier/manager
  // actually needs to chase up.
  async function refreshTodayStats() {
    if (storeId == null || tenantId == null) return;
    const db = getDb();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [salesRow] = await db.getAll<{ total: number | null }>(
      `SELECT SUM(total) AS total FROM orders
       WHERE tenant_id = ? AND store_id = ? AND status = 'completed' AND synced_at >= ?`,
      [tenantId, storeId, startOfDay.toISOString()],
    );
    const [creditRow] = await db.getAll<{ total: number | null; cnt: number }>(
      `SELECT SUM(total) AS total, COUNT(*) AS cnt FROM orders
       WHERE tenant_id = ? AND store_id = ? AND status = 'completed'
         AND tender_type = 'credit' AND payment_status = 'pending'`,
      [tenantId, storeId],
    );
    setTodayStats({
      salesTotal: salesRow?.total ?? 0,
      unpaidCreditCount: creditRow?.cnt ?? 0,
      unpaidCreditTotal: creditRow?.total ?? 0,
    });
  }

  useEffect(() => {
    refreshTodayStats();
    const interval = setInterval(refreshTodayStats, 5000);
    return () => {
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, tenantId]);

  const lineInputs: LineInput[] = useMemo(
    () =>
      cart.map((line) => ({
        quantity: line.quantity,
        unitPrice: lineUnitPrice(line),
        discount: lineDiscountAmount(line),
        taxRate: line.product.tax_rate,
      })),
    [cart],
  );
  const totals = useMemo(() => computeOrderTotals(lineInputs), [lineInputs]);

  // The till only knows about stock it has already searched for in this
  // session (product.stock_on_hand is a snapshot from the search query, not
  // re-queried live) - good enough to stop a cashier ringing up more of one
  // item than the shelf has, without a DB round-trip on every +/- click. A
  // product with variants is never sold as its bare self - see web/Android's
  // identical rule - so this opens the picker instead of adding directly.
  function addToCart(product: LocalProduct) {
    if (product.variant_count > 0) {
      setVariantPickerProduct(product);
      return;
    }
    addLineToCart(product, null);
  }

  function addLineToCart(product: LocalProduct, variant: LocalVariant | null) {
    const key = stockKey(product.id, variant?.id ?? null);
    const existing = cart.find((l) => lineKey(l) === key);
    const stock = variant ? variant.stock_on_hand : product.stock_on_hand;
    const nextQuantity = (existing?.quantity ?? 0) + 1;
    if (nextQuantity > stock) {
      showToast(`Only ${stock} ${product.name} left in stock`, 'error');
      return;
    }
    setCart((prev) => {
      if (existing) {
        return prev.map((l) => (lineKey(l) === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { product, variant, quantity: 1, discountAmount: 0 }];
    });
    setQuery('');
    setVariantPickerProduct(null);
  }

  function updateQuantity(key: string, quantity: number) {
    const line = cart.find((l) => lineKey(l) === key);
    if (!line) return;
    const stock = lineStock(line);
    if (quantity > line.quantity && quantity > stock) {
      showToast(`Only ${stock} ${line.product.name} left in stock`, 'error');
      return;
    }
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((l) => lineKey(l) !== key)
        : prev.map((l) => {
            if (lineKey(l) !== key) return l;
            // A quantity decrease can shrink the discount ceiling below
            // whatever flat amount was already entered - re-clamp so the
            // cart never ends up implying a bigger discount % than the
            // product actually allows.
            const max = effectiveDiscountCapForLine({ quantity, product: l.product, variant: l.variant }, discountCapsActive);
            return { ...l, quantity, discountAmount: Math.min(l.discountAmount, max) };
          }),
    );
  }

  function updateDiscountAmount(key: string, rawValue: number) {
    const line = cart.find((l) => lineKey(l) === key);
    if (!line) return;
    const max = effectiveDiscountCapForLine(line, discountCapsActive);
    const clamped = Math.min(Math.max(rawValue, 0), max);
    if (rawValue > max) {
      showToast(`Max discount for ${line.product.name} is ${max.toFixed(2)}`, 'error');
    }
    setCart((prev) => prev.map((l) => (lineKey(l) === key ? { ...l, discountAmount: clamped } : l)));
  }

  async function completeSale() {
    if (cart.length === 0 || storeId == null) return;
    if (shiftsRequired && activeShift == null) {
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
    const oversold = cart.find((line) => line.quantity > lineStock(line));
    if (oversold) {
      showToast(`Only ${lineStock(oversold)} ${lineDisplayLabel(oversold)} left in stock`, 'error');
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
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
              line.variant?.id ?? null,
              line.quantity,
              lineUnitPrice(line),
              lineDiscountAmount(line),
            ],
          );
        }
      });

      const tenderLabel = TENDER_OPTIONS.find((t) => t.value === tenderType)?.label ?? tenderType;
      showToast(`Sale completed - ${tenderLabel} ${totals.total.toFixed(2)}`, 'success');
      refreshTodayStats();

      // Printing is best-effort and must never undo or block a completed
      // sale - the order above is already durably recorded regardless of
      // whether a receipt can be printed (spec's offline-first premise
      // would be undermined if the source of truth depended on a
      // peripheral). UNVERIFIED against real hardware.
      printReceipt({
        storeName: tenant?.name ?? 'Fundi',
        orderId,
        lines: cart.map((line) => ({
          name: lineDisplayLabel(line),
          quantity: line.quantity,
          unitPrice: lineUnitPrice(line),
          lineTotal: line.quantity * lineUnitPrice(line) - lineDiscountAmount(line),
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

        <div className="today-stats">
          <span className="today-stat" title="Total completed sales today, this store">
            <span className="today-stat-label">Today</span>
            <span className="today-stat-value">{todayStats.salesTotal.toFixed(2)}</span>
          </span>
          <span
            className={`today-stat ${todayStats.unpaidCreditCount > 0 ? 'today-stat-credit' : ''}`}
            title="Credit sales not yet paid, this store"
          >
            <span className="today-stat-label">Unpaid credit</span>
            <span className="today-stat-value">
              {todayStats.unpaidCreditCount}
              {todayStats.unpaidCreditCount > 0 ? ` · ${todayStats.unpaidCreditTotal.toFixed(2)}` : ''}
            </span>
          </span>
        </div>

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
        {storeId != null && tenantId != null && (shiftsRequired || activeShift != null) && (
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
                const hasVariants = product.variant_count > 0;
                // A variant-having product's own bare stock_on_hand is
                // meaningless (its stock lives per-variant instead, per the
                // AND sm.variant IS NULL filter above) - never disable the
                // card on that basis; out-of-stock variants are disabled
                // individually inside the picker.
                const outOfStock = !hasVariants && product.stock_on_hand <= 0;
                return (
                  <button
                    key={product.id}
                    className={`product-card ${outOfStock ? 'is-out-of-stock' : ''}`}
                    disabled={outOfStock}
                    onClick={() => addToCart(product)}
                  >
                    <span className="product-card-name">
                      {product.name}
                      {hasVariants ? <span className="product-card-meta"> · {product.variant_count} options</span> : null}
                    </span>
                    <span className="product-card-meta">{product.sku}</span>
                    <span className="product-card-row">
                      <span className="product-card-price">{product.sell_price.toFixed(2)}</span>
                      {!hasVariants && (
                        <span className={`product-card-stock ${outOfStock ? 'is-out' : ''}`}>
                          {outOfStock ? 'Out of stock' : `${product.stock_on_hand} in stock`}
                        </span>
                      )}
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
                <div key={lineKey(line)} className="cart-line">
                  <div className="cart-line-main">
                    <div className="cart-line-info">
                      <p className="cart-line-name">{lineDisplayLabel(line)}</p>
                      <p className="cart-line-price">{lineUnitPrice(line).toFixed(2)} each</p>
                    </div>
                    <div className="qty-stepper">
                      <button onClick={() => updateQuantity(lineKey(line), line.quantity - 1)} aria-label="Decrease quantity">
                        <MinusIcon />
                      </button>
                      <span>{line.quantity}</span>
                      <button onClick={() => updateQuantity(lineKey(line), line.quantity + 1)} aria-label="Increase quantity">
                        <PlusIcon />
                      </button>
                    </div>
                    <span className="cart-line-total">
                      {(line.quantity * lineUnitPrice(line) - lineDiscountAmount(line)).toFixed(2)}
                    </span>
                  </div>
                  {line.product.max_discount_amount > 0 && (
                    <label className="cart-line-discount">
                      Discount
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={effectiveDiscountCapForLine(line, discountCapsActive)}
                        step={0.01}
                        placeholder="0.00"
                        // '' instead of a literal 0 when there's no discount
                        // yet - otherwise a real "0" sits in the box and has
                        // to be selected/deleted before typing a value.
                        value={line.discountAmount === 0 ? '' : line.discountAmount}
                        onChange={(e) => updateDiscountAmount(lineKey(line), Number(e.currentTarget.value) || 0)}
                      />
                      <span>(max {effectiveDiscountCapForLine(line, discountCapsActive).toFixed(2)})</span>
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
                  (shiftsRequired && activeShift == null) ||
                  (tenderType === 'credit' && !selectedCustomer)
                }
                onClick={completeSale}
              >
                {completing
                  ? 'Completing...'
                  : shiftsRequired && activeShift == null
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

      {storeId != null && (
        <VariantPickerDialog
          product={variantPickerProduct}
          storeId={storeId}
          onSelect={(variant) => variantPickerProduct && addLineToCart(variantPickerProduct, variant)}
          onClose={() => setVariantPickerProduct(null)}
        />
      )}

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
