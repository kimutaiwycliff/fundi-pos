import { Skeleton } from '@/components/ui/skeleton';

export default function SellLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}
