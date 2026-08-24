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
// queuing needed"). M-Pesa needs connectivity at time of transaction - the
// STK push itself is a live call to Safaricom, initiated below once the
// order has synced. Card stays disabled - only cash and mobile money were
// asked for; the tender type itself already supports 'card' in the schema
// if that changes later.
const TENDER_OPTIONS = [
  { value: 'cash', label: 'Cash', enabled: true },
  { value: 'mpesa', label: 'Mobile Money (M-Pesa)', enabled: true },
  { value: 'card', label: 'Card', enabled: false },
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
    if (tenderType === 'mpesa' && !mpesaPhone.trim()) {
      setMessage('Enter the customer\'s phone number for the M-Pesa prompt');
      return;
    }
    setCompleting(true);
    setMessage(null);
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
            [crypto.randomUUID(), orderId, i, line.product.id, line.quantity, line.product.sell_price, line.discount],
          );
        }
      });

      setMessage(`Sale completed - order ${orderId.slice(0, 8)} (${tenderType}, ${totals.total.toFixed(2)})`);

      if (tenderType === 'mpesa') {
        // Best-effort, same as printing below - the sale is already
        // durably recorded regardless of whether the STK push itself
        // succeeds. A failure here just means the cashier has to retry
        // the push or fall back to cash - it never undoes the sale.
        initiateMpesaPayment(payloadToken, orderId, mpesaPhone.trim()).then(
          () => setMessage((prev) => `${prev ?? ''} · M-Pesa prompt sent to ${mpesaPhone.trim()}`),
          (err) =>
            setMessage(
              (prev) => `${prev ?? ''} (M-Pesa prompt failed: ${err instanceof Error ? err.message : String(err)})`,
            ),
        );
        setMpesaPhone('');
      }

      // Printing is best-effort and must never undo or block a completed
      // sale - the order above is already durably recorded regardless of
      // whether a receipt can be printed (spec's offline-first premise
      // would be undermined if the source of truth depended on a
      // peripheral). UNVERIFIED against real hardware.
      printReceipt({
        storeName: 'Hardware POS', // TODO: pull the actual store name once synced locally
        orderId,
        lines: cart.map((line) => ({
          name: line.product.name,
          quantity: line.quantity,
          unitPrice: line.product.sell_price,
          lineTotal: line.quantity * line.product.sell_price - line.discount,
        })),
        taxTotal: totals.taxTotal,
        total: totals.total,
        tenderType,
      }).catch((err) => {
        setMessage((prev) => `${prev ?? ''} (receipt print failed: ${err instanceof Error ? err.message : String(err)})`);
      });

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
            {!option.enabled ? ' (coming soon)' : ''}
          </label>
        ))}
        {tenderType === 'mpesa' && (
          <input
            className="till-mpesa-phone"
            placeholder="Customer phone (e.g. 0712345678)"
            value={mpesaPhone}
            onChange={(e) => setMpesaPhone(e.currentTarget.value)}
          />
        )}
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

      <PrinterSettings />
    </div>
  );
}
