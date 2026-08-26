import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/table-skeleton';

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-7 w-40" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <TableSkeleton />
    </div>
  );
}
