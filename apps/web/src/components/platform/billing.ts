import { TRIAL_DAYS } from '@hardware-pos/business-logic';
import { daysFrom, relativeDays } from './format';
import type { PayableTenant, PlatformTenantRow } from './types';

export function trialEnd(row: Pick<PlatformTenantRow, 'trialEndsAt' | 'createdAt'>): string {
  return row.trialEndsAt ?? new Date(new Date(row.createdAt).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// Days until the date that matters for this tenant's state (negative = past).
export function keyDays(row: PlatformTenantRow, now: string): number | null {
  if (row.state === 'trial' || row.state === 'trial_ending' || row.state === 'trial_expired') return daysFrom(trialEnd(row), now);
  if (row.state === 'never_paid') return null;
  return row.daysUntilDue;
}

export function keyDaysLabel(row: PlatformTenantRow, now: string): string {
  const days = keyDays(row, now);
  if (row.state === 'never_paid') return 'No payment recorded yet';
  if (days == null) return '';
  if (row.state === 'trial' || row.state === 'trial_ending') return `Trial ends ${relativeDays(days)}`;
  if (row.state === 'trial_expired') return `Trial ended ${relativeDays(days, { overdueWord: 'ago' })}`;
  if (days < 0) return relativeDays(days);
  return `Due ${relativeDays(days)}`;
}

// Most urgent first: longest overdue, then expired trials, never paid,
// trials about to end, and finally renewals coming up.
const STATE_RANK: Record<string, number> = { overdue: 0, trial_expired: 1, never_paid: 2, trial_ending: 3, due_soon: 4 };
export function sortByUrgency(rows: PlatformTenantRow[], now: string): PlatformTenantRow[] {
  return [...rows].sort((a, b) => {
    const rank = (STATE_RANK[a.state] ?? 9) - (STATE_RANK[b.state] ?? 9);
    if (rank !== 0) return rank;
    return (keyDays(a, now) ?? 0) - (keyDays(b, now) ?? 0);
  });
}

export function toPayable(row: PlatformTenantRow): PayableTenant {
  return { id: row.id, name: row.name, cyclePrice: row.cyclePrice, billingCycle: row.billingCycle, paidUntil: row.paidUntil };
}
