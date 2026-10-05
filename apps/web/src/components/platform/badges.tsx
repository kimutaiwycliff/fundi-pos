import { SUBSCRIPTION_STATE_LABELS, type SubscriptionState } from '@hardware-pos/business-logic';
import { cn } from '@/lib/utils';

// Colour-coded so the list scans at a glance: green = paid, amber = needs a
// nudge soon, red = money owed / locked, blue = trial, grey = inactive.
const STATE_STYLES: Record<SubscriptionState, string> = {
  paid: 'bg-emerald-500/12 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300 dark:ring-emerald-400/30',
  due_soon: 'bg-amber-500/12 text-amber-800 ring-amber-600/30 dark:text-amber-300 dark:ring-amber-400/30',
  trial: 'bg-sky-500/12 text-sky-700 ring-sky-600/25 dark:text-sky-300 dark:ring-sky-400/30',
  trial_ending: 'bg-amber-500/12 text-amber-800 ring-amber-600/30 dark:text-amber-300 dark:ring-amber-400/30',
  trial_expired: 'bg-orange-500/12 text-orange-800 ring-orange-600/30 dark:text-orange-300 dark:ring-orange-400/30',
  overdue: 'bg-red-500/12 text-red-700 ring-red-600/30 dark:text-red-300 dark:ring-red-400/35',
  never_paid: 'bg-orange-500/12 text-orange-800 ring-orange-600/30 dark:text-orange-300 dark:ring-orange-400/30',
  canceled: 'bg-muted text-muted-foreground ring-border',
  suspended: 'bg-red-500/12 text-red-700 ring-red-600/30 dark:text-red-300 dark:ring-red-400/35',
};

const DOT_STYLES: Record<SubscriptionState, string> = {
  paid: 'bg-emerald-500',
  due_soon: 'bg-amber-500',
  trial: 'bg-sky-500',
  trial_ending: 'bg-amber-500',
  trial_expired: 'bg-orange-500',
  overdue: 'bg-red-500',
  never_paid: 'bg-orange-500',
  canceled: 'bg-muted-foreground/60',
  suspended: 'bg-red-500',
};

export function SubscriptionStateBadge({ state, className }: { state: SubscriptionState; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        STATE_STYLES[state],
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', DOT_STYLES[state])} />
      {SUBSCRIPTION_STATE_LABELS[state]}
    </span>
  );
}

export function TenantStatusBadge({ status, className }: { status: string; className?: string }) {
  const style =
    status === 'active'
      ? 'bg-emerald-500/12 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300 dark:ring-emerald-400/30'
      : 'bg-red-500/12 text-red-700 ring-red-600/30 dark:text-red-300 dark:ring-red-400/35';
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        style,
        className,
      )}
    >
      {status === 'active' ? 'Account active' : `Account ${status}`}
    </span>
  );
}
