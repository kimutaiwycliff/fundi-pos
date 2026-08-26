import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-1.5 py-8 text-center', className)}>
      <Icon className="size-8 text-muted-foreground/40" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {description ? <p className="max-w-xs text-xs text-muted-foreground/70">{description}</p> : null}
    </div>
  );
}
