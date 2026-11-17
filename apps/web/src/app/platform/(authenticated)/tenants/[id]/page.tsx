import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail, MessageCircle, Phone } from 'lucide-react';
import { buildWhatsAppLink, subscriptionState, type SubscriptionState } from '@hardware-pos/business-logic';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SubscriptionStateBadge, TenantStatusBadge } from '@/components/platform/badges';
import { BillingForm } from '@/components/platform/billing-form';
import { keyDaysLabel } from '@/components/platform/billing';
import { reminderMessage } from '@/components/platform/contact-links';
import { formatDay, formatDayTime, formatKES, relativeDays, titleCase } from '@/components/platform/format';
import { FollowUpPanel } from '@/components/platform/follow-up-panel';
import { HealthBadge } from '@/components/platform/insights';
import { OverviewTab, TeamTab, UsageTab } from '@/components/platform/tenant-insights';
import { PaymentHistory } from '@/components/platform/payment-history';
import { RecordPaymentDialog } from '@/components/platform/record-payment-dialog';
import type { PlatformStats, PlatformTenantNote, PlatformTenantRow, SubscriptionPayment, TenantInsights, TenantStatus } from '@/components/platform/types';
import { platformFetch, PlatformApiError } from '@/lib/platform-client';
import { cn } from '@/lib/utils';
import { TenantAddonsForm, TenantStatusActions } from './tenant-actions';

type Tenant = {
  id: number;
  name: string;
  status: TenantStatus;
  statusChangedAt: string | null;
  statusReason: string | null;
  subscriptionTier: string;
  billingStatus: string;
  billingCycle?: string | null;
  planPrice?: number | null;
  paidUntil?: string | null;
  trialEndsAt?: string | null;
  billingContactName?: string | null;
  billingContactPhone?: string | null;
  billingContactEmail?: string | null;
  addons?: string[] | null;
  createdAt: string;
};

type PlatformAuditEntry = {
  id: number;
  action: string;
  summary: string;
  createdAt: string;
  actor: { id: number; email: string; name: string } | number;
};

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5 rounded-lg bg-muted/40 px-3 py-2', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'usage', label: 'Usage' },
  { key: 'team', label: 'Team & tills' },
  { key: 'billing', label: 'Billing' },
] as const;
type Tab = (typeof TABS)[number]['key'];

export default async function PlatformTenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const requested = (await searchParams).tab;
  const tab: Tab = TABS.some((t) => t.key === requested) ? (requested as Tab) : 'overview';

  let tenant: Tenant;
  try {
    tenant = await platformFetch<Tenant>(`/api/tenants/${id}?depth=0`);
  } catch (error) {
    if (error instanceof PlatformApiError && error.status === 404) notFound();
    throw error;
  }

  // Only what the open tab needs (plus the stats row, which the header uses).
  const [{ docs: auditEntries }, { docs: payments }, stats, insights, { docs: notes }] = await Promise.all([
    tab === 'billing'
      ? platformFetch<{ docs: PlatformAuditEntry[] }>(`/api/platform-audit-log?where[tenant][equals]=${id}&sort=-createdAt&depth=1&limit=100`)
      : { docs: [] as PlatformAuditEntry[] },
    tab === 'billing'
      ? platformFetch<{ docs: SubscriptionPayment[] }>(`/api/subscription-payments?where[tenant][equals]=${id}&sort=-paidAt&depth=1&limit=200`)
      : { docs: [] as SubscriptionPayment[] },
    platformFetch<PlatformStats>('/api/platform-stats'),
    tab === 'billing' ? null : platformFetch<TenantInsights>(`/api/tenants/${id}/insights`),
    tab === 'overview'
      ? platformFetch<{ docs: PlatformTenantNote[] }>(`/api/platform-tenant-notes?where[tenant][equals]=${id}&sort=-createdAt&depth=1&limit=100`)
      : { docs: [] as PlatformTenantNote[] },
  ]);

  // Deleted tenants aren't in platform-stats; fall back to computing the
  // state locally (usage then simply isn't shown).
  const row: PlatformTenantRow | undefined = stats.tenants.find((t) => t.id === tenant.id);
  const now = stats.generatedAt;
  const state: SubscriptionState = row?.state ?? subscriptionState(tenant, new Date(now));
  const phone = row ? row.billingContact.phone || row.owner?.phone : tenant.billingContactPhone;
  const email = row ? row.billingContact.email || row.owner?.email : tenant.billingContactEmail;
  const whatsapp = phone ? buildWhatsAppLink(phone, row ? reminderMessage(row) : undefined) : null;
  const payable = {
    id: tenant.id,
    name: tenant.name,
    cyclePrice: row?.cyclePrice ?? tenant.planPrice ?? 0,
    billingCycle: tenant.billingCycle ?? 'monthly',
    paidUntil: tenant.paidUntil ?? null,
  };
  const daysUntilDue = row?.daysUntilDue ?? null;

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/platform/tenants"
        className="inline-flex w-fit items-center gap-1 rounded text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeft className="size-4" aria-hidden /> Tenants
      </Link>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight break-words">{tenant.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              {row ? <HealthBadge level={row.health.level} /> : null}
              <SubscriptionStateBadge state={state} />
              <TenantStatusBadge status={tenant.status} />
              <span className="text-xs text-muted-foreground">
                Tenant #{tenant.id} · joined {formatDay(tenant.createdAt)}
              </span>
            </div>
            {tenant.statusReason && tenant.status !== 'active' ? (
              <p className="text-sm text-muted-foreground">Reason: {tenant.statusReason}</p>
            ) : null}
            {row?.blocked && tenant.status === 'active' && state !== 'canceled' ? (
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                Locked out automatically{row.lockAt ? ` since ${formatDay(row.lockAt)}` : ''} - record a payment or extend the trial to restore access.
              </p>
            ) : row?.lockAt && (state === 'trial_expired' || state === 'overdue' || state === 'trial_ending' || state === 'due_soon') ? (
              <p className="text-sm text-muted-foreground">Access pauses automatically on {formatDay(row.lockAt)} unless they pay.</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {phone ? (
              <a
                href={`tel:${phone.replace(/\s+/g, '')}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Phone className="size-4" aria-hidden /> Call
              </a>
            ) : null}
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <MessageCircle className="size-4" aria-hidden /> WhatsApp
              </a>
            ) : null}
            {email ? (
              <a
                href={`mailto:${email}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Mail className="size-4" aria-hidden /> Email
              </a>
            ) : null}
            <RecordPaymentDialog tenant={payable} />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Fact label="MRR">{row ? formatKES(row.monthlyValue) : '—'}</Fact>
          <Fact label="Plan">
            {titleCase(tenant.subscriptionTier)} · {payable.cyclePrice > 0 ? `${formatKES(payable.cyclePrice)}/${payable.billingCycle}` : 'no charge'}
          </Fact>
          <Fact label="Paid until">
            {tenant.paidUntil ? formatDay(tenant.paidUntil) : 'Never paid'}
            {daysUntilDue != null ? (
              <span
                className={cn(
                  'ml-1 text-xs font-normal',
                  daysUntilDue < 0 ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground',
                )}
              >
                ({relativeDays(daysUntilDue)})
              </span>
            ) : row && !tenant.paidUntil ? (
              <span className="block text-xs font-normal text-muted-foreground">{keyDaysLabel(row, now)}</span>
            ) : null}
          </Fact>
          <Fact label="Owner">
            {row?.owner ? (
              <>
                {row.owner.name ?? row.owner.email}
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {[row.owner.phone, row.owner.email].filter(Boolean).join(' · ')}
                </span>
              </>
            ) : (
              '—'
            )}
          </Fact>
        </dl>
      </div>

      <nav className="-mb-1 flex gap-1 overflow-x-auto border-b" aria-label="Tenant sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === 'overview' ? `/platform/tenants/${tenant.id}` : `/platform/tenants/${tenant.id}?tab=${t.key}`}
            aria-current={tab === t.key ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'overview' && insights ? (
        <OverviewTab data={insights} createdAt={tenant.createdAt}>
          <Card>
            <CardHeader>
              <CardTitle>Contact log</CardTitle>
              <CardDescription>
                {row?.followUpOn ? `Next follow-up ${formatDay(`${row.followUpOn}T09:00:00Z`)}` : 'Calls, visits and notes - with a date to chase up.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FollowUpPanel tenantId={tenant.id} notes={notes} />
            </CardContent>
          </Card>
        </OverviewTab>
      ) : null}
      {tab === 'usage' && insights ? <UsageTab data={insights} /> : null}
      {tab === 'team' && insights ? <TeamTab data={insights} /> : null}
      {tab === 'billing' ? (
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Payments</CardTitle>
            <CardDescription>
              {payments.length > 0
                ? `${payments.length} payment${payments.length === 1 ? '' : 's'} · last ${formatDay(payments[0].paidAt)}`
                : 'Nothing recorded yet'}
            </CardDescription>
            <CardAction>
              <RecordPaymentDialog tenant={payable} />
            </CardAction>
          </CardHeader>
          <CardContent>
            <PaymentHistory payments={payments} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
            <CardDescription>Plan, price, cycle and who to contact about payment.</CardDescription>
          </CardHeader>
          <CardContent>
            <BillingForm tenantId={tenant.id} tenant={tenant} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Access</CardTitle>
            <CardDescription>
              {tenant.status === 'active'
                ? 'Suspend to lock every staff member out; soft-delete to also hide the tenant.'
                : `This tenant is ${tenant.status}${tenant.statusChangedAt ? ` since ${formatDay(tenant.statusChangedAt)}` : ''}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TenantStatusActions tenantId={tenant.id} status={tenant.status} name={tenant.name} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add-ons</CardTitle>
          </CardHeader>
          <CardContent>
            <TenantAddonsForm tenantId={tenant.id} addons={tenant.addons ?? []} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
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
                        {actor} · {formatDayTime(entry.createdAt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      ) : null}
    </div>
  );
}
