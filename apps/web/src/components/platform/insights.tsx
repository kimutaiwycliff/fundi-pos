import { HEALTH_LABELS, SETUP_STAGE_LABELS, type HealthLevel, type SetupStage } from '@hardware-pos/business-logic';
import { cn } from '@/lib/utils';

// Small pieces shared by the tenants list, the overview and the tenant
// page's insight tabs. Server-safe (no hooks).

const HEALTH_STYLES: Record<HealthLevel, string> = {
  healthy: 'bg-emerald-500/12 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300 dark:ring-emerald-400/30',
  new: 'bg-sky-500/12 text-sky-700 ring-sky-600/25 dark:text-sky-300 dark:ring-sky-400/30',
  slipping: 'bg-amber-500/12 text-amber-800 ring-amber-600/30 dark:text-amber-300 dark:ring-amber-400/30',
  at_risk: 'bg-orange-500/12 text-orange-800 ring-orange-600/30 dark:text-orange-300 dark:ring-orange-400/30',
  never_started: 'bg-red-500/12 text-red-700 ring-red-600/30 dark:text-red-300 dark:ring-red-400/35',
  inactive: 'bg-red-500/12 text-red-700 ring-red-600/30 dark:text-red-300 dark:ring-red-400/35',
};

const HEALTH_DOTS: Record<HealthLevel, string> = {
  healthy: 'bg-emerald-500',
  new: 'bg-sky-500',
  slipping: 'bg-amber-500',
  at_risk: 'bg-orange-500',
  never_started: 'bg-red-500',
  inactive: 'bg-red-500',
};

export function HealthBadge({ level, className }: { level: HealthLevel; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        HEALTH_STYLES[level],
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', HEALTH_DOTS[level])} />
      {HEALTH_LABELS[level]}
    </span>
  );
}

export function SetupStageBadge({ stage }: { stage: SetupStage }) {
  return (
    <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-xs font-medium whitespace-nowrap text-muted-foreground">
      {SETUP_STAGE_LABELS[stage]}
    </span>
  );
}

// "+12%" / "-40%" vs the previous period; nothing when there's no baseline.
export function Delta({ current, previous, className }: { current: number; previous: number; className?: string }) {
  if (previous <= 0) return null;
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return <span className={cn('text-xs text-muted-foreground', className)}>±0%</span>;
  return (
    <span
      className={cn(
        'text-xs font-medium tabular-nums',
        change > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300',
        className,
      )}
    >
      {change > 0 ? '+' : '−'}
      {Math.abs(change)}%
    </span>
  );
}

// Tiny inline trend line (no axes) - 30 daily values, oldest first.
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(...values, 0);
  if (max <= 0) return <span className={cn('text-xs text-muted-foreground', className)}>No sales</span>;
  const w = 80;
  const h = 22;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 1 - (v / max) * (h - 2)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={cn('text-primary', className)} aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Compact "KES 1.2M" for dense tables and tiles.
export function kesShort(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}KES ${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}KES ${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  return `${sign}KES ${Math.round(abs)}`;
}

export function Stat({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5 rounded-lg bg-muted/40 px-3 py-2', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
