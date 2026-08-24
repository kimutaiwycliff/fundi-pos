import { useEffect, useState } from 'react';
import { closeShift, findOpenShift, openShift, type Shift } from './shifts';
import { useToast } from './Toast';

interface ShiftPanelProps {
  payloadToken: string;
  tenantId: number;
  storeId: number;
  terminalId: string;
  cashierId: number;
  onShiftChange?: (shift: Shift | null) => void;
}

export function ShiftPanel({ payloadToken, tenantId, storeId, terminalId, cashierId, onShiftChange }: ShiftPanelProps) {
  const [shift, setShiftState] = useState<Shift | null>(null);
  const [checkingCurrent, setCheckingCurrent] = useState(true);
  const [openingFloat, setOpeningFloat] = useState('0');
  const [closingCash, setClosingCash] = useState('0');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const showToast = useToast();

  function setShift(next: Shift | null) {
    setShiftState(next);
    onShiftChange?.(next);
  }

  // Re-checked whenever the active cashier (or terminal) changes - a shift
  // belongs to a specific cashier, so switching cashiers must re-evaluate
  // whether THIS person already has one open, not keep showing whoever was
  // active before the switch.
  useEffect(() => {
    let active = true;
    setCheckingCurrent(true);
    findOpenShift(payloadToken, terminalId, cashierId)
      .then((found) => {
        if (!active) return;
        setShift(found);
      })
      .finally(() => {
        if (active) setCheckingCurrent(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashierId, terminalId]);

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
      showToast('Shift opened', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(msg);
      showToast(msg, 'error');
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
      showToast('Shift closed', 'success');
      setShift(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (checkingCurrent) {
    return <div className="shift-panel shift-checking">Checking shift status...</div>;
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
          <button className="btn btn-primary btn-sm" onClick={handleOpen} disabled={busy}>
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
          <button className="btn btn-secondary btn-sm" onClick={handleClose} disabled={busy}>
            {busy ? 'Closing...' : 'Close shift'}
          </button>
        </div>
      )}
      {message && <p className="shift-message">{message}</p>}
    </div>
  );
}
