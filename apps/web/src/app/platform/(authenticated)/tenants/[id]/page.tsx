import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail, MessageCircle, Phone } from 'lucide-react';
import { buildWhatsAppLink, subscriptionState, type SubscriptionState } from '@hardware-pos/business-logic';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SubscriptionStateBadge, TenantStatusBadge } from '@/components/platform/badges';
import { BillingForm } from '@/components/platform/billing-form';
import { keyDaysLabel } from '@/components/platform/billing';
import { reminderMessage } from '@/components/platform/contact-links';
import { formatDay, formatDayTime, formatKES, relativeDays, timeAgo, titleCase } from '@/components/platform/format';
import { NotesForm } from '@/components/platform/notes-form';
import { PaymentHistory } from '@/components/platform/payment-history';
import { RecordPaymentDialog } from '@/components/platform/record-payment-dialog';
import type { PlatformStats, PlatformTenantRow, SubscriptionPayment, TenantStatus } from '@/components/platform/types';
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
  platformNotes?: string | null;
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

export default async function PlatformTenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let tenant: Tenant;
  try {
    tenant = await platformFetch<Tenant>(`/api/tenants/${id}?depth=0`);
  } catch (error) {
    if (error instanceof PlatformApiError && error.status === 404) notFound();
    throw error;
  }

  const [{ docs: auditEntries }, { docs: payments }, stats] = await Promise.all([
    platformFetch<{ docs: PlatformAuditEntry[] }>(
      `/api/platform-audit-log?where[tenant][equals]=${id}&sort=-createdAt&depth=1&limit=100`,
    ),
    platformFetch<{ docs: SubscriptionPayment[] }>(
      `/api/subscription-payments?where[tenant][equals]=${id}&sort=-paidAt&depth=1&limit=200`,
    ),
    platformFetch<PlatformStats>('/api/platform-stats'),
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
              <SubscriptionStateBadge state={state} />
              <TenantStatusBadge status={tenant.status} />
              <span className="text-xs text-muted-foreground">
                Tenant #{tenant.id} · joined {formatDay(tenant.createdAt)}
              </span>
            </div>
            {tenant.statusReason && tenant.status !== 'active' ? (
              <p className="text-sm text-muted-foreground">Reason: {tenant.statusReason}</p>
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

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Usage</CardTitle>
              <CardDescription>
                {row ? `Last activity ${timeAgo(row.usage.lastOrderAt, now).toLowerCase()}` : 'Not available for deleted tenants'}
              </CardDescription>
            </CardHeader>
            {row ? (
              <CardContent>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Fact label="Stores">{row.usage.stores}</Fact>
                  <Fact label="Staff">{row.usage.users}</Fact>
                  <Fact label="Active products">{row.usage.products.toLocaleString('en-KE')}</Fact>
                  <Fact label="Orders (30d)">{row.usage.orders30d.toLocaleString('en-KE')}</Fact>
                  <Fact label="Sales (30d)">{formatKES(row.usage.gmv30d)}</Fact>
                  <Fact label="Last order">{row.usage.lastOrderAt ? formatDay(row.usage.lastOrderAt) : 'Never'}</Fact>
                </dl>
              </CardContent>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Internal notes</CardTitle>
            </CardHeader>
            <CardContent>
              <NotesForm tenantId={tenant.id} notes={tenant.platformNotes ?? null} />
            </CardContent>
          </Card>
        </div>

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
    </div>
  );
}
