import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// A compact stat tile. `tone` tints the icon only (the number stays in the
// foreground colour so it's always legible); `href` makes the whole tile a
// link to the filtered list behind the number.
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  href,
  children,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: LucideIcon;
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'info';
  href?: string;
  children?: React.ReactNode;
}) {
  const toneClass = {
    default: 'bg-muted text-muted-foreground',
    good: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    warn: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
    bad: 'bg-red-500/12 text-red-700 dark:text-red-300',
    info: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  }[tone];

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</span>
        <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', toneClass)}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <div className="text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      {children}
    </>
  );

  const className =
    'flex min-w-0 flex-col gap-1.5 rounded-xl bg-card p-3 text-card-foreground ring-1 ring-foreground/10 sm:p-4';
  if (href) {
    return (
      <Link
        href={href}
        className={cn(className, 'transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50')}
      >
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}
