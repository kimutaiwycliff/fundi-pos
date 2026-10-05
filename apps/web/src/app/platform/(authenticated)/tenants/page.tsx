import { platformFetch } from '@/lib/platform-client';
import { TenantsTable, type DeletedTenant } from '@/components/platform/tenants-table';
import type { PlatformStats } from '@/components/platform/types';

export const metadata = { title: 'Tenants · Platform' };

// Deleted tenants aren't part of platform-stats (they're out of the
// portfolio), so the "Show deleted" view fetches them on their own - same
// `?view=` URL-driven toggle the old status filter used.
export default async function PlatformTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; state?: string }>;
}) {
  const { view, state } = await searchParams;
  const showDeleted = view === 'deleted';

  const [stats, deleted] = await Promise.all([
    platformFetch<PlatformStats>('/api/platform-stats'),
    showDeleted
      ? platformFetch<{ docs: DeletedTenant[] }>('/api/tenants?limit=500&sort=-statusChangedAt&depth=0&where[status][equals]=deleted').then(
          (r) => r.docs,
        )
      : Promise.resolve([] as DeletedTenant[]),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
        <p className="text-sm text-muted-foreground">
          {showDeleted
            ? `${deleted.length} soft-deleted tenant${deleted.length === 1 ? '' : 's'}`
            : `${stats.summary.tenants} tenants · ${stats.summary.needsAttention} need attention`}
        </p>
      </div>
      <TenantsTable key={`${view}-${state}`} rows={stats.tenants} now={stats.generatedAt} initialChip={state} showDeleted={showDeleted} deleted={deleted} />
    </div>
  );
}
