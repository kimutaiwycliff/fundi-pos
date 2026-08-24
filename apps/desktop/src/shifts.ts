import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { API_BASE_URL } from './auth';

// Shift open/close (spec Section 6.1: "cash-up reconciliation") requires
// connectivity - expectedCash/variance are computed server-side from the
// real Orders ledger (apps/api/src/collections/Shifts.ts), same Option-A
// reasoning already applied to refunds/voids: a cashier's till already
// needs a network path to log in and sync at all, so requiring it here too
// doesn't practically restrict anything further.
export interface Shift {
  id: number;
  status: 'open' | 'closed';
  openingFloat: number;
  expectedCash: number | null;
  variance: number | null;
}

export async function openShift(
  payloadToken: string,
  args: { tenantId: number; storeId: number; terminal: string; cashierId: number; openingFloat: number },
): Promise<Shift> {
  const res = await tauriFetch(`${API_BASE_URL}/api/shifts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
    body: JSON.stringify({
      tenant: args.tenantId,
      store: args.storeId,
      terminal: args.terminal,
      cashier: args.cashierId,
      openingFloat: args.openingFloat,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.errors?.[0]?.message ?? 'Failed to open shift');
  return body.doc as Shift;
}

export async function closeShift(
  payloadToken: string,
  shiftId: number,
  closingCashCounted: number,
): Promise<Shift> {
  const res = await tauriFetch(`${API_BASE_URL}/api/shifts/${shiftId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
    body: JSON.stringify({ status: 'closed', closingCashCounted }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.errors?.[0]?.message ?? 'Failed to close shift');
  return body.doc as Shift;
}
