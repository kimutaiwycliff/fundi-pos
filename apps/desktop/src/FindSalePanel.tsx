import { useState } from 'react';
import { getDb } from './database';
import { useWatchedQuery } from './useWatchedQuery';
import { authorizeSettlement, findManagerAndCheckPinLocally } from './pin';
import { printReceipt } from './printer';
import { useToast } from './Toast';

interface LocalOrderRow {
  id: string;
  total: number;
  tax_total: number;
  discount_total: number;
  tender_type: string;
  payment_status: string;
  status: string;
  created_at: string;
  settled_at: string | null;
  customer_name: string | null;
}

interface LocalOrderLine {
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
}

interface TenantInfo {
  name: string;
  receipt_header: string | null;
  receipt_footer: string | null;
}

interface FindSalePanelProps {
  storeId: number;
  payloadToken: string;
  tenant: TenantInfo | null;
}

const UNPAID_NOTICE = 'UNPAID - PAY LATER';

// Look up a past sale to reprint it, and (credit sales only) settle it -
// both per the user's own request: "look up a certain sale and reprint that
// receipt" plus a way to mark a pay-later tab resolved once the customer
// actually pays. Reads only local orders (this store's own synced history),
// same offline-first reasoning as everything else at the till.
export function FindSalePanel({ storeId, payloadToken, tenant }: FindSalePanelProps) {
  const [query, setQuery] = useState('');
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [managerPhone, setManagerPhone] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [busy, setBusy] = useState(false);
  const showToast = useToast();

  const trimmed = query.trim();
  // Reactive (useWatchedQuery, not a one-shot db.getAll): updates live as
  // orders change locally - a sale rung up moments ago, or a settlement
  // synced back down after authorizeSettlement below lands server-side -
  // not just on a fresh keystroke like the old one-shot query did.
  const { data: orders } = useWatchedQuery<LocalOrderRow>(
    `SELECT o.id, o.total, o.tax_total, o.discount_total, o.tender_type, o.payment_status, o.status,
            o.created_at, o.settled_at, c.name AS customer_name
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.store_id = ? AND (? = '' OR o.id LIKE ? OR c.name LIKE ?)
     ORDER BY o.created_at DESC LIMIT 30`,
    [storeId, trimmed, `${trimmed}%`, `%${trimmed}%`],
  );

  async function handleReprint(order: LocalOrderRow) {
    const db = getDb();
    const lines = await db.getAll<LocalOrderLine>(
      `SELECT p.name AS product_name, oli.quantity, oli.unit_price, oli.discount
       FROM orders_line_items oli
       JOIN products p ON p.id = oli.product_id
       WHERE oli._parent_id = ?
       ORDER BY oli._order`,
      [order.id],
    );
    const isUnpaidCredit = order.tender_type === 'credit' && order.payment_status === 'pending';
    try {
      await printReceipt({
        storeName: tenant?.name ?? 'Fundi',
        orderId: order.id,
        lines: lines.map((l) => ({
          name: l.product_name,
          quantity: l.quantity,
          unitPrice: l.unit_price,
          lineTotal: l.quantity * l.unit_price - l.discount,
        })),
        taxTotal: order.tax_total,
        total: order.total,
        tenderType: order.tender_type,
        header: tenant?.receipt_header,
        footer: tenant?.receipt_footer,
        unpaidNotice: isUnpaidCredit ? UNPAID_NOTICE : null,
      });
      showToast('Receipt sent to printer', 'success');
    } catch (err) {
      showToast(`Reprint failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }

  async function handleSettle(orderId: string, event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const localCheck = await findManagerAndCheckPinLocally(managerPhone, managerPin);
      if (!localCheck || !localCheck.valid) {
        showToast('Manager PIN incorrect', 'error');
        setBusy(false);
        return;
      }
      const result = await authorizeSettlement(payloadToken, orderId, localCheck.managerId, managerPin);
      if (!result.ok) {
        showToast(`Settle failed: ${result.error}`, 'error');
      } else {
        showToast('Sale marked as settled', 'success');
        setSettlingId(null);
        setManagerPhone('');
        setManagerPin('');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="find-sale-panel">
      <div className="search-box">
        <input
          autoFocus
          placeholder="Search by order id or customer name..."
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      </div>

      {orders.length === 0 ? (
        <p className="pane-empty-state-hint">No matching sales found.</p>
      ) : (
        <ul className="find-sale-list">
          {orders.map((order) => {
            const isUnpaidCredit = order.tender_type === 'credit' && order.payment_status === 'pending';
            return (
              <li key={order.id} className="find-sale-row">
                <div className="find-sale-row-main">
                  <div>
                    <p className="find-sale-row-title">
                      #{order.id.slice(0, 8)} · {order.total.toFixed(2)}
                      {isUnpaidCredit && <span className="badge-unpaid">Unpaid</span>}
                      {order.status !== 'completed' && <span className="badge-void">{order.status}</span>}
                    </p>
                    <p className="find-sale-row-meta">
                      {new Date(order.created_at).toLocaleString()} · {order.tender_type}
                      {order.customer_name ? ` · ${order.customer_name}` : ''}
                    </p>
                  </div>
                  <div className="find-sale-row-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => handleReprint(order)}>
                      Reprint
                    </button>
                    {isUnpaidCredit && (
                      <button className="btn btn-primary btn-sm" onClick={() => setSettlingId(order.id)}>
                        Settle
                      </button>
                    )}
                  </div>
                </div>
                {settlingId === order.id && (
                  <form onSubmit={(e) => handleSettle(order.id, e)} className="void-form">
                    <input
                      placeholder="Manager phone"
                      value={managerPhone}
                      onChange={(e) => setManagerPhone(e.currentTarget.value)}
                    />
                    <input
                      type="password"
                      placeholder="Manager PIN"
                      value={managerPin}
                      onChange={(e) => setManagerPin(e.currentTarget.value)}
                    />
                    <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                      {busy ? 'Confirming...' : 'Confirm settle'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSettlingId(null)}>
                      Cancel
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
