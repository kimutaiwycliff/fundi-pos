import { Skeleton } from '@/components/ui/skeleton';

export function TableSkeleton({ columns = 4, rows = 6 }: { columns?: number; rows?: number }) {
  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-4 border-b px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
