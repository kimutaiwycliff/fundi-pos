import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { platformFetch, PlatformApiError } from '@/lib/platform-client';
import { TenantStatusActions, TenantSubscriptionForm } from './tenant-actions';

type TenantStatus = 'active' | 'suspended' | 'deleted';

type Tenant = {
  id: number;
  name: string;
  status: TenantStatus;
  statusChangedAt: string | null;
  statusReason: string | null;
  subscriptionTier: string;
  billingStatus: string;
  createdAt: string;
};

type PlatformAuditEntry = {
  id: number;
  action: string;
  summary: string;
  createdAt: string;
  actor: { id: number; email: string; name: string } | number;
};

function statusVariant(status: TenantStatus): 'secondary' | 'destructive' {
  return status === 'active' ? 'secondary' : 'destructive';
}

export default async function PlatformTenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let tenant: Tenant;
  try {
    tenant = await platformFetch<Tenant>(`/api/tenants/${id}`);
  } catch (error) {
    if (error instanceof PlatformApiError && error.status === 404) notFound();
    throw error;
  }

  const { docs: auditEntries } = await platformFetch<{ docs: PlatformAuditEntry[] }>(
    `/api/platform-audit-log?where[tenant][equals]=${id}&sort=-createdAt&depth=1&limit=100`,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/platform" className="text-sm text-muted-foreground hover:underline">
            ← Tenants
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{tenant.name}</h1>
        <Badge variant={statusVariant(tenant.status)} className="capitalize">
          {tenant.status}
        </Badge>
      </div>
      {tenant.statusReason ? <p className="text-sm text-muted-foreground">Reason: {tenant.statusReason}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Access</CardTitle>
        </CardHeader>
        <CardContent>
          <TenantStatusActions tenantId={tenant.id} status={tenant.status} name={tenant.name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          <TenantSubscriptionForm tenantId={tenant.id} subscriptionTier={tenant.subscriptionTier} billingStatus={tenant.billingStatus} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit history</CardTitle>
        </CardHeader>
        <CardContent>
          {auditEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No platform actions recorded for this tenant yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {auditEntries.map((entry) => {
                const actor = typeof entry.actor === 'object' ? entry.actor.name || entry.actor.email : `admin #${entry.actor}`;
                return (
                  <li key={entry.id} className="flex flex-col gap-0.5 border-b pb-3 last:border-b-0 last:pb-0">
                    <span className="text-sm">{entry.summary}</span>
                    <span className="text-xs text-muted-foreground">
                      {actor} · {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
