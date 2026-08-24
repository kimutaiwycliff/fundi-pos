import { useState } from 'react';
import { closeShift, openShift, type Shift } from './shifts';

interface ShiftPanelProps {
  payloadToken: string;
  tenantId: number;
  storeId: number;
  terminalId: string;
  cashierId: number;
}

export function ShiftPanel({ payloadToken, tenantId, storeId, terminalId, cashierId }: ShiftPanelProps) {
  const [shift, setShift] = useState<Shift | null>(null);
  const [openingFloat, setOpeningFloat] = useState('0');
  const [closingCash, setClosingCash] = useState('0');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleOpen() {
    setBusy(true);
    setMessage(null);
    try {
      const opened = await openShift(payloadToken, {
        tenantId,
        storeId,
        terminal: terminalId,
        cashierId,
        openingFloat: Number(openingFloat) || 0,
      });
      setShift(opened);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    if (!shift) return;
    setBusy(true);
    setMessage(null);
    try {
      const closed = await closeShift(payloadToken, shift.id, Number(closingCash) || 0);
      setMessage(
        `Shift closed. Expected ${closed.expectedCash?.toFixed(2)}, counted ${Number(closingCash).toFixed(2)}, ` +
          `variance ${closed.variance?.toFixed(2)}.`,
      );
      setShift(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shift-panel">
      {!shift ? (
        <div className="shift-open-form">
          <label>
            Opening float
            <input
              type="number"
              step="0.01"
              value={openingFloat}
              onChange={(e) => setOpeningFloat(e.currentTarget.value)}
            />
          </label>
          <button onClick={handleOpen} disabled={busy}>
            {busy ? 'Opening...' : 'Open shift'}
          </button>
        </div>
      ) : (
        <div className="shift-close-form">
          <span>Shift open (float {shift.openingFloat.toFixed(2)})</span>
          <label>
            Cash counted
            <input
              type="number"
              step="0.01"
              value={closingCash}
              onChange={(e) => setClosingCash(e.currentTarget.value)}
            />
          </label>
          <button onClick={handleClose} disabled={busy}>
            {busy ? 'Closing...' : 'Close shift'}
          </button>
        </div>
      )}
      {message && <p className="shift-message">{message}</p>}
    </div>
  );
}
