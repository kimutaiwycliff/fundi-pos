import { useEffect, useState } from 'react';
import { fetchOrdersForStore, type OrderRecord } from './orders';
import { authorizeSettlement, findManagerByPhone } from './pin';
import { printReceipt } from './printer';
import { useToast } from './Toast';

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

function customerNameOf(order: OrderRecord): string | null {
  return typeof order.customer === 'object' && order.customer ? order.customer.name : null;
}

// Look up a past sale to reprint it, and (credit sales only) settle it -
// both per the user's own request: "look up a certain sale and reprint that
// receipt" plus a way to mark a pay-later tab resolved once the customer
// actually pays. Orders are fetched in bulk from apps/api (depth=1 inlines
// both the customer and each line item's product, so a reprint needs no
// second request) and searched client-side, same as apps/web's own
// dashboard/sales page does - this app is online-only now, so there's no
// local order history to read instead.
export function FindSalePanel({ storeId, payloadToken, tenant }: FindSalePanelProps) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [managerPhone, setManagerPhone] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [busy, setBusy] = useState(false);
  const showToast = useToast();

  function refresh() {
    setLoading(true);
    setLoadError(null);
    fetchOrdersForStore(payloadToken, storeId, { limit: 200, depth: 1 })
      .then(setOrders)
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [payloadToken, storeId]);

  const trimmed = query.trim().toLowerCase();
  const visibleOrders = (
    trimmed
      ? orders.filter((o) => o.id.toLowerCase().startsWith(trimmed) || customerNameOf(o)?.toLowerCase().includes(trimmed))
      : orders
  ).slice(0, 30);

  async function handleReprint(order: OrderRecord) {
    const isUnpaidCredit = order.tenderType === 'credit' && order.paymentStatus === 'pending';
    try {
      await printReceipt({
        storeName: tenant?.name ?? 'Fundi',
        orderId: order.id,
        lines: order.lineItems.map((l) => ({
          name: typeof l.product === 'object' ? l.product.name : `#${l.product}`,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.quantity * l.unitPrice - l.discount,
        })),
        taxTotal: order.taxTotal,
        total: order.total,
        tenderType: order.tenderType,
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
      const manager = await findManagerByPhone(payloadToken, managerPhone);
      if (!manager) {
        showToast('Manager not found for that phone number', 'error');
        setBusy(false);
        return;
      }
      const result = await authorizeSettlement(payloadToken, orderId, manager.managerId, managerPin);
      if (!result.ok) {
        showToast(`Settle failed: ${result.error}`, 'error');
      } else {
        showToast('Sale marked as settled', 'success');
        setSettlingId(null);
        setManagerPhone('');
        setManagerPin('');
        refresh();
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
        <button type="button" className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {loadError ? <p className="error-banner">{loadError}</p> : null}

      {!loading && visibleOrders.length === 0 ? (
        <p className="pane-empty-state-hint">No matching sales found.</p>
      ) : (
        <ul className="find-sale-list">
          {visibleOrders.map((order) => {
            const isUnpaidCredit = order.tenderType === 'credit' && order.paymentStatus === 'pending';
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
                      {new Date(order.createdAt).toLocaleString()} · {order.tenderType}
                      {customerNameOf(order) ? ` · ${customerNameOf(order)}` : ''}
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
