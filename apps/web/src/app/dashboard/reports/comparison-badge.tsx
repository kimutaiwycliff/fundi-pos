import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// A bare number ("2,899.00") answers "what happened" but not "is that
// good?" - this answers the second question in one glance, next to every
// KPI card that has a meaningful predecessor to compare against (see
// sales-summary's own `comparison` field / previousRangeWindow).
export function ComparisonBadge({ current, previous }: { current: number; previous: number | null }) {
  if (previous == null) return null;
  if (previous === 0) {
    if (current === 0) return null;
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <TrendingUp className="size-3" /> new
      </span>
    );
  }
  const change = ((current - previous) / previous) * 100;
  const flat = Math.abs(change) < 0.5;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium tabular-nums',
        flat
          ? 'text-muted-foreground'
          : change > 0
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-destructive',
      )}
    >
      {flat ? <Minus className="size-3" /> : change > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {flat ? 'flat' : `${change > 0 ? '+' : ''}${change.toFixed(0)}%`}
    </span>
  );
}
