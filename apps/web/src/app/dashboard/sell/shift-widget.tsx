'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { closeShift, openShift, type Shift } from '@/lib/shifts-client';

// Cash-up reconciliation, mirroring apps/desktop/src/ShiftPanel.tsx - the
// server (Shifts.ts) computes expectedCash/variance authoritatively from
// the Orders ledger, never trusted from this client. Gating "no sale
// without an open shift" is a client-side UX gate only here too, matching
// desktop (there's no server-side hook enforcing it).
export function ShiftWidget({
  storeId,
  terminal,
  cashierId,
  shift,
  onShiftChange,
}: {
  storeId: number;
  terminal: string;
  cashierId: number;
  shift: Shift | null;
  onShiftChange: (shift: Shift | null) => void;
}) {
  const [openingFloat, setOpeningFloat] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [busy, setBusy] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  async function handleOpen() {
    setBusy(true);
    try {
      const created = await openShift({ storeId, terminal, cashierId, openingFloat: Number(openingFloat) || 0 });
      onShiftChange(created);
      setOpeningFloat('');
      toast.success('Shift opened');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open shift');
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    if (!shift) return;
    setBusy(true);
    try {
      const closed = await closeShift(shift.id, Number(closingCash) || 0);
      onShiftChange(null);
      setClosingCash('');
      setCloseOpen(false);
      const variance = closed.variance ?? 0;
      toast.success(
        `Shift closed — expected ${(closed.expectedCash ?? 0).toFixed(2)}, variance ${variance >= 0 ? '+' : ''}${variance.toFixed(2)}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to close shift');
    } finally {
      setBusy(false);
    }
  }

  if (!shift) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5">
        <span className="text-sm text-muted-foreground">No shift open</span>
        <Input
          type="number"
          inputMode="decimal"
          placeholder="Opening float"
          value={openingFloat}
          onChange={(e) => setOpeningFloat(e.target.value)}
          className="h-8 w-40"
        />
        <Button type="button" size="sm" onClick={handleOpen} disabled={busy}>
          {busy ? 'Opening...' : 'Open shift'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5">
      <span className="text-sm">Shift open · float {shift.openingFloat.toFixed(2)}</span>
      {closeOpen ? (
        <>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Cash counted"
            value={closingCash}
            onChange={(e) => setClosingCash(e.target.value)}
            className="h-8 w-40"
          />
          <Button type="button" size="sm" variant="destructive" onClick={handleClose} disabled={busy}>
            {busy ? 'Closing...' : 'Confirm close'}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setCloseOpen(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setCloseOpen(true)}>
          Close shift
        </Button>
      )}
    </div>
  );
}
