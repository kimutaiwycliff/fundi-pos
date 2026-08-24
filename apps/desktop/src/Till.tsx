import { useEffect, useMemo, useState } from 'react';
import { computeOrderTotals, type LineInput } from '@hardware-pos/business-logic';
import { getDb } from './database';
import type { PayloadUser } from './auth';
import { VoidOrderPanel } from './VoidOrderPanel';
import { ShiftPanel } from './ShiftPanel';
import { CashierSwitcher } from './CashierSwitcher';
import { deleteHeldSale, holdSale, listHeldSales, type HeldSale } from './heldSales';

interface LocalProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  sell_price: number;
  tax_rate: number;
}

interface CartLine {
  product: LocalProduct;
  quantity: number;
  discount: number;
}

interface TillProps {
  user: PayloadUser;
  terminalId: string;
  payloadToken: string;
  onDisconnect: () => void;
}

// Cash is first-class per spec Section 6.5 ("always available offline, no
// queuing needed"). M-Pesa/card need connectivity at time of transaction
// and are stubbed until Phase 7 - shown, but disabled, so the UI shape is
// already right for when they're wired up.
const TENDER_OPTIONS = [
  { value: 'cash', label: 'Cash', enabled: true },
  { value: 'mpesa', label: 'M-Pesa', enabled: false },
  { value: 'card', label: 'Card', enabled: false },
] as const;

export function Till({ user, terminalId, payloadToken, onDisconnect }: TillProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocalProduct[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [tenderType, setTenderType] = useState<(typeof TENDER_OPTIONS)[number]['value']>('cash');
  const [completing, setCompleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [activeCashier, setActiveCashier] = useState({ id: user.id, email: user.email });
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);

  const storeId = typeof user.store === 'object' ? user.store?.id : user.store;
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;

  async function refreshHeldSales() {
    setHeldSales(await listHeldSales());
  }

  useEffect(() => {
    refreshHeldSales();
  }, []);

  async function handleHoldSale() {
    if (cart.length === 0) return;
    await holdSale(JSON.stringify(cart));
    setCart([]);
    await refreshHeldSales();
  }

  async function handleResumeSale(held: HeldSale) {
    setCart(JSON.parse(held.cartJson) as CartLine[]);
    await deleteHeldSale(held.id);
    await refreshHeldSales();
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
    db.getAll<LocalProduct>(
      `SELECT id, name, sku, barcode, sell_price, tax_rate FROM products
       WHERE tenant_id = ? AND (sku LIKE ? OR barcode = ? OR name LIKE ?)
       ORDER BY name LIMIT 20`,
      [tenantId, `%${trimmed}%`, trimmed, `%${trimmed}%`],
    ).then((rows) => {
      if (active) setResults(rows);
    });
    return () => {
      active = false;
    };
  }, [query, tenantId]);

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
        discount: line.discount,
        taxRate: line.product.tax_rate,
      })),
    [cart],
  );
  const totals = useMemo(() => computeOrderTotals(lineInputs), [lineInputs]);

  function addToCart(product: LocalProduct) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { product, quantity: 1, discount: 0 }];
    });
    setQuery('');
    setResults([]);
  }

  function updateQuantity(productId: string, quantity: number) {
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.product.id !== productId)
        : prev.map((l) => (l.product.id === productId ? { ...l, quantity } : l)),
    );
  }

  async function completeSale() {
    if (cart.length === 0 || storeId == null) return;
    setCompleting(true);
    setMessage(null);
    try {
      const db = getDb();
      const orderId = crypto.randomUUID();
      const now = new Date().toISOString();

      // One local transaction for the order + all its line items, so
      // PowerSync's upload queue drains them together and the Rust
      // connector (src-tauri/src/connector.rs) can assemble one nested
      // POST to /api/sync/orders instead of racing partial state.
      await db.writeTransaction(async (tx) => {
        await tx.execute(
          `INSERT INTO orders
             (id, tenant_id, store_id, terminal, cashier_id, tax_total, discount_total, total,
              tender_type, payment_status, status, created_offline, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', 'completed', 1, ?)`,
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
            now,
          ],
        );

        for (let i = 0; i < cart.length; i++) {
          const line = cart[i];
          await tx.execute(
            `INSERT INTO orders_line_items (id, _parent_id, _order, product_id, variant, quantity, unit_price, discount)
             VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
            [crypto.randomUUID(), orderId, i, line.product.id, line.quantity, line.product.sell_price, line.discount],
          );
        }
      });

      setMessage(`Sale completed - order ${orderId.slice(0, 8)} (${tenderType}, ${totals.total.toFixed(2)})`);
      setCart([]);
    } catch (err) {
      setMessage(`ERROR completing sale: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="till">
      <header className="till-header">
        <span>
          {user.email} · {user.role} · terminal {terminalId}
        </span>
        <span className={isOnline ? 'status-online' : 'status-offline'}>
          {isOnline ? 'Online' : 'Offline'}
          {pendingSyncCount != null && pendingSyncCount > 0 ? ` · ${pendingSyncCount} pending sync` : ''}
        </span>
        <button onClick={onDisconnect}>Log out</button>
      </header>

      <CashierSwitcher active={activeCashier} onSwitch={setActiveCashier} />

      {storeId != null && tenantId != null && (
        <ShiftPanel
          payloadToken={payloadToken}
          tenantId={tenantId}
          storeId={storeId}
          terminalId={terminalId}
          cashierId={activeCashier.id}
        />
      )}

      <div className="till-search">
        <input
          autoFocus
          placeholder="Scan barcode or search by name/SKU..."
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results.length > 0) addToCart(results[0]);
          }}
        />
        {results.length > 0 && (
          <ul className="till-search-results">
            {results.map((product) => (
              <li key={product.id}>
                <button onClick={() => addToCart(product)}>
                  {product.name} - {product.sku} ({product.sell_price.toFixed(2)})
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <table className="till-cart">
        <thead>
          <tr>
            <th>Product</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Line total</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((line) => (
            <tr key={line.product.id}>
              <td>{line.product.name}</td>
              <td>
                <button onClick={() => updateQuantity(line.product.id, line.quantity - 1)}>-</button>
                {line.quantity}
                <button onClick={() => updateQuantity(line.product.id, line.quantity + 1)}>+</button>
              </td>
              <td>{line.product.sell_price.toFixed(2)}</td>
              <td>{(line.quantity * line.product.sell_price - line.discount).toFixed(2)}</td>
            </tr>
          ))}
          {cart.length === 0 && (
            <tr>
              <td colSpan={4}>Cart is empty - search or scan a product above.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="till-totals">
        <p>Tax: {totals.taxTotal.toFixed(2)}</p>
        <p>Discount: {totals.discountTotal.toFixed(2)}</p>
        <p>
          <strong>Total: {totals.total.toFixed(2)}</strong>
        </p>
      </div>

      <div className="till-tender">
        {TENDER_OPTIONS.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name="tender"
              disabled={!option.enabled}
              checked={tenderType === option.value}
              onChange={() => setTenderType(option.value)}
            />
            {option.label}
            {!option.enabled ? ' (Phase 7)' : ''}
          </label>
        ))}
      </div>

      <div className="till-actions">
        <button disabled={cart.length === 0 || completing} onClick={completeSale}>
          {completing ? 'Completing...' : 'Complete sale'}
        </button>
        <button disabled={cart.length === 0} onClick={handleHoldSale}>
          Hold sale
        </button>
      </div>

      {message && <p className="till-message">{message}</p>}

      {heldSales.length > 0 && (
        <div className="held-sales">
          <h2>Held sales</h2>
          <ul>
            {heldSales.map((held) => (
              <li key={held.id}>
                <span>{new Date(held.createdAt).toLocaleTimeString()}</span>
                <button onClick={() => handleResumeSale(held)}>Resume</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {storeId != null && <VoidOrderPanel storeId={storeId} payloadToken={payloadToken} />}
    </div>
  );
}
