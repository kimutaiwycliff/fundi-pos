import { platformFetch } from '@/lib/platform-client';
import { TenantsTable, type DeletedTenant } from '@/components/platform/tenants-table';
import type { PlatformStats } from '@/components/platform/types';
import { AddTenantDialog } from '@/components/platform/add-tenant-dialog';

export const metadata = { title: 'Tenants · Platform' };

// Deleted tenants aren't part of platform-stats (they're out of the
// portfolio), so the "Show deleted" view fetches them on their own - same
// `?view=` URL-driven toggle the old status filter used.
export default async function PlatformTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; state?: string; usage?: string }>;
}) {
  const { view, state, usage } = await searchParams;
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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
        <p className="text-sm text-muted-foreground">
          {showDeleted
            ? `${deleted.length} soft-deleted tenant${deleted.length === 1 ? '' : 's'}`
            : `${stats.summary.tenants} tenants · ${stats.summary.needsAttention} billing issues · ${stats.summary.atRisk} slipping or inactive · ${stats.summary.followUpsDue} follow-ups due`}
        </p>
        </div>
        <AddTenantDialog />
      </div>
      <TenantsTable
        key={`${view}-${state}-${usage}`}
        rows={stats.tenants}
        now={stats.generatedAt}
        initialChip={state}
        initialUsage={usage}
        showDeleted={showDeleted}
        deleted={deleted}
      />
    </div>
  );
}
