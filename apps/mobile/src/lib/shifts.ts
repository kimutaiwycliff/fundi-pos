import { API_BASE_URL, apiFetch } from './auth';

// Shift open/close requires connectivity - expectedCash/variance are
// computed server-side from the real Orders ledger (apps/api/src/
// collections/Shifts.ts). Ported from apps/desktop/src/shifts.ts, using
// plain fetch instead of desktop's @tauri-apps/plugin-http workaround (see
// auth.ts's own comment on why RN doesn't need it).
export interface Shift {
  id: number;
  status: 'open' | 'closed';
  openingFloat: number;
  expectedCash: number | null;
  variance: number | null;
}

/**
 * Whether the active cashier already has a shift open on this terminal -
 * checked on every login/cashier-switch/app-restart so a genuinely open
 * shift is never invisible to a till that just doesn't remember opening it.
 */
export async function findOpenShift(payloadToken: string, terminal: string, cashierId: number): Promise<Shift | null> {
  const params = new URLSearchParams({
    'where[terminal][equals]': terminal,
    'where[cashier][equals]': String(cashierId),
    'where[status][equals]': 'open',
    limit: '1',
  });
  try {
    const res = await fetch(`${API_BASE_URL}/api/shifts?${params.toString()}`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    return body?.docs?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function openShift(
  payloadToken: string,
  args: { tenantId: number; storeId: number; terminal: string; cashierId: number; openingFloat: number },
): Promise<Shift> {
  const res = await apiFetch(`${API_BASE_URL}/api/shifts`, {
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

export async function closeShift(payloadToken: string, shiftId: number, closingCashCounted: number): Promise<Shift> {
  const res = await apiFetch(`${API_BASE_URL}/api/shifts/${shiftId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
    body: JSON.stringify({ status: 'closed', closingCashCounted }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.errors?.[0]?.message ?? 'Failed to close shift');
  return body.doc as Shift;
}
