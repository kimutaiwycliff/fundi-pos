import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/table-skeleton';

export default function ProductsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-9 w-32" />
      </div>
      <TableSkeleton columns={7} rows={8} />
    </div>
  );
}
