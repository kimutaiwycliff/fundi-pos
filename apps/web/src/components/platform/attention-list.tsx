import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { SubscriptionStateBadge } from './badges';
import { billingPhone, ContactButtons } from './contact-links';
import { formatKES } from './format';
import { keyDays, keyDaysLabel, sortByUrgency, toPayable } from './billing';
import { RecordPaymentDialog } from './record-payment-dialog';
import type { PlatformTenantRow } from './types';

export function AttentionList({ rows, now, limit = 8 }: { rows: PlatformTenantRow[]; now: string; limit?: number }) {
  const sorted = sortByUrgency(
    rows.filter((r) => r.needsAttention),
    now,
  );
  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nobody needs chasing"
        description="No overdue accounts, ending trials or upcoming renewals right now."
      />
    );
  }

  return (
    <div className="flex flex-col">
      <ul className="divide-y">
        {sorted.slice(0, limit).map((row) => {
          const days = keyDays(row, now);
          const urgent = row.state === 'overdue' || row.state === 'trial_expired';
          return (
            <li key={row.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/platform/tenants/${row.id}`}
                    className="truncate font-medium underline-offset-2 outline-none hover:underline focus-visible:underline"
                  >
                    {row.name}
                  </Link>
                  <SubscriptionStateBadge state={row.state} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span className={urgent && days != null ? 'font-medium text-red-700 dark:text-red-300' : undefined}>
                    {keyDaysLabel(row, now)}
                  </span>
                  {row.cyclePrice > 0 ? <span>{formatKES(row.cyclePrice)} / {row.billingCycle}</span> : null}
                  {billingPhone(row) ? <span className="tabular-nums">{billingPhone(row)}</span> : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ContactButtons row={row} />
                <RecordPaymentDialog tenant={toPayable(row)} />
              </div>
            </li>
          );
        })}
      </ul>
      {sorted.length > limit ? (
        <Link
          href="/platform/tenants?state=attention"
          className="mt-3 self-start text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          View all {sorted.length} that need attention →
        </Link>
      ) : null}
    </div>
  );
}
