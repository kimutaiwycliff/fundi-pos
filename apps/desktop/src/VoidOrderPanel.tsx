import { useEffect, useState } from 'react';
import { fetchOrdersForStore, type OrderRecord } from './orders';
import { authorizeOrderStatusChange, findManagerByPhone } from './pin';

interface VoidOrderPanelProps {
  storeId: number;
  payloadToken: string;
}

// spec Section 6.1: "returns/refunds/voids gated behind manager PIN". This
// app is online-only now - the manager lookup by phone is a plain REST call
// (pin.ts's findManagerByPhone), and the actual PIN check happens
// server-side inside authorizeOrderStatusChange (Option A - see apps/api's
// authorize-status route, which independently re-verifies the PIN as the
// real authority).
export function VoidOrderPanel({ storeId, payloadToken }: VoidOrderPanelProps) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [targetOrderId, setTargetOrderId] = useState<string | null>(null);
  const [managerPhone, setManagerPhone] = useState('');
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    setLoadError(null);
    fetchOrdersForStore(payloadToken, storeId, { status: 'completed', limit: 10, depth: 0 })
      .then(setOrders)
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(refresh, [payloadToken, storeId]);

  async function handleVoid(orderId: string, event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const manager = await findManagerByPhone(payloadToken, managerPhone);
      if (!manager) {
        setStatus('Manager not found for that phone number.');
        setBusy(false);
        return;
      }

      const result = await authorizeOrderStatusChange(payloadToken, orderId, 'voided', manager.managerId, pin);
      if (!result.ok) {
        setStatus(`Void failed: ${result.error}`);
      } else {
        setStatus('Order voided - stock restored.');
        setTargetOrderId(null);
        setManagerPhone('');
        setPin('');
        refresh();
      }
    } catch (err) {
      setStatus(`Void failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return <p className="error-banner">{loadError}</p>;
  }

  if (orders.length === 0) return null;

  return (
    <div className="void-panel">
      <h2>Recent sales</h2>
      <ul>
        {orders.map((order) => (
          <li key={order.id}>
            <span>
              #{order.id.slice(0, 8)} - {order.total.toFixed(2)} ({order.tenderType})
            </span>
            {targetOrderId === order.id ? (
              <form onSubmit={(e) => handleVoid(order.id, e)} className="void-form">
                <input
                  placeholder="Manager phone"
                  value={managerPhone}
                  onChange={(e) => setManagerPhone(e.currentTarget.value)}
                />
                <input
                  type="password"
                  placeholder="Manager PIN"
                  value={pin}
                  onChange={(e) => setPin(e.currentTarget.value)}
                />
                <button type="submit" className="btn btn-danger btn-sm" disabled={busy}>
                  {busy ? 'Voiding...' : 'Confirm void'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTargetOrderId(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <button className="btn btn-secondary btn-sm" onClick={() => setTargetOrderId(order.id)}>
                Void (requires manager PIN)
              </button>
            )}
          </li>
        ))}
      </ul>
      {status && <p className="void-status">{status}</p>}
    </div>
  );
}
