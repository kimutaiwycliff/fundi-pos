import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/table-skeleton';

export default function SalesLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-7 w-24" />
      <TableSkeleton columns={9} rows={8} />
    </div>
  );
}
