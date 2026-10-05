import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/table-skeleton';

export default function PlatformTenantsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading tenants">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-full sm:w-36" />
        <Skeleton className="h-9 w-full sm:w-40" />
      </div>
      <div className="flex gap-1.5 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="flex flex-col gap-2 md:hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="hidden md:block">
        <TableSkeleton columns={7} rows={8} />
      </div>
    </div>
  );
}
