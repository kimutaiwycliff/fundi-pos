import { useEffect, useState } from 'react';
import { getDb } from './database';
import { authorizeOrderStatusChange, findManagerAndCheckPinLocally } from './pin';

interface RecentOrder {
  id: string;
  total: number;
  tender_type: string;
  status: string;
  created_at: string;
}

interface VoidOrderPanelProps {
  storeId: number;
  payloadToken: string;
}

// spec Section 6.1: "returns/refunds/voids gated behind manager PIN". The
// PIN check itself is instant and fully offline (findManagerAndCheckPinLocally,
// against the pin_hash already synced down); committing the void requires
// connectivity (Option A - see apps/api's authorize-status route, which
// re-verifies the PIN server-side as the actual authority).
export function VoidOrderPanel({ storeId, payloadToken }: VoidOrderPanelProps) {
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [targetOrderId, setTargetOrderId] = useState<string | null>(null);
  const [managerEmail, setManagerEmail] = useState('');
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const db = getDb();
    const rows = await db.getAll<RecentOrder>(
      `SELECT id, total, tender_type, status, created_at FROM orders
       WHERE store_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 10`,
      [storeId],
    );
    setOrders(rows);
  }

  useEffect(() => {
    refresh();
  }, [storeId]);

  async function handleVoid(orderId: string, event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const localCheck = await findManagerAndCheckPinLocally(managerEmail, pin);
      if (!localCheck || !localCheck.valid) {
        setStatus('Manager PIN incorrect.');
        setBusy(false);
        return;
      }

      const result = await authorizeOrderStatusChange(payloadToken, orderId, 'voided', localCheck.managerId, pin);
      if (!result.ok) {
        setStatus(`Void failed: ${result.error}`);
      } else {
        setStatus('Order voided - stock restored.');
        setTargetOrderId(null);
        setManagerEmail('');
        setPin('');
        await refresh();
      }
    } catch (err) {
      setStatus(`Void failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  if (orders.length === 0) return null;

  return (
    <div className="void-panel">
      <h2>Recent sales</h2>
      <ul>
        {orders.map((order) => (
          <li key={order.id}>
            <span>
              #{order.id.slice(0, 8)} - {order.total.toFixed(2)} ({order.tender_type})
            </span>
            {targetOrderId === order.id ? (
              <form onSubmit={(e) => handleVoid(order.id, e)} className="void-form">
                <input
                  placeholder="Manager email"
                  value={managerEmail}
                  onChange={(e) => setManagerEmail(e.currentTarget.value)}
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
