// Web equivalent of apps/desktop/src/shifts.ts, calling the web app's own
// authenticated proxy (/api/payload/*) instead of tauriFetch direct to
// apps/api - same Shifts collection, same server-computed
// expectedCash/variance (apps/api/src/collections/Shifts.ts), so cash-up
// reconciliation behaves identically regardless of which client opened it.
import { clientFetch } from './client-fetch';

export interface Shift {
  id: number;
  status: 'open' | 'closed';
  openingFloat: number;
  expectedCash: number | null;
  variance: number | null;
}

export async function findOpenShift(terminal: string, cashierId: number): Promise<Shift | null> {
  const params = new URLSearchParams({
    'where[terminal][equals]': terminal,
    'where[cashier][equals]': String(cashierId),
    'where[status][equals]': 'open',
    limit: '1',
  });
  try {
    const response = await clientFetch(`/api/payload/shifts?${params.toString()}`);
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    return body?.docs?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function openShift(args: {
  storeId: number;
  terminal: string;
  cashierId: number;
  openingFloat: number;
}): Promise<Shift> {
  const response = await clientFetch('/api/payload/shifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store: args.storeId,
      terminal: args.terminal,
      cashier: args.cashierId,
      openingFloat: args.openingFloat,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.errors?.[0]?.message ?? 'Failed to open shift');
  return body.doc as Shift;
}

export async function closeShift(shiftId: number, closingCashCounted: number): Promise<Shift> {
  const response = await clientFetch(`/api/payload/shifts/${shiftId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'closed', closingCashCounted }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.errors?.[0]?.message ?? 'Failed to close shift');
  return body.doc as Shift;
}
