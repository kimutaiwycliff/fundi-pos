import Link from 'next/link';
import {
  AlarmClock,
  Banknote,
  Building2,
  CalendarClock,
  CircleDollarSign,
  Receipt,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Activity,
  UserPlus,
  HeartPulse,
  Inbox,
  PhoneCall,
  Store,
} from 'lucide-react';
import { ADDON_LABELS, HEALTH_LABELS, HEALTH_LEVELS, SETUP_STAGE_LABELS, SETUP_STAGES } from '@hardware-pos/business-logic';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { AttentionList } from '@/components/platform/attention-list';
import { SubscriptionStateBadge } from '@/components/platform/badges';
import { CollectionsChart } from '@/components/platform/collections-chart';
import { PlatformDailyChart } from '@/components/platform/daily-charts';
import { HealthBadge, kesShort } from '@/components/platform/insights';
import { formatDay, formatKES, timeAgo } from '@/components/platform/format';
import { KpiCard } from '@/components/platform/kpi-card';
import { PAYMENT_METHOD_LABELS, type PlatformStats } from '@/components/platform/types';
import { platformFetch } from '@/lib/platform-client';

export const metadata = { title: 'Platform overview' };

function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) {
    return <span>{current > 0 ? 'First collections vs last month' : 'Nothing collected last month either'}</span>;
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  const up = pct >= 0;
  return (
    <span>
      <span className={up ? 'font-medium text-emerald-700 dark:text-emerald-300' : 'font-medium text-red-700 dark:text-red-300'}>
        {up ? '▲' : '▼'} {Math.abs(pct)}%
      </span>{' '}
      vs {formatKES(previous)} last month
    </span>
  );
}

export default async function PlatformOverviewPage() {
  const stats = await platformFetch<PlatformStats>('/api/platform-stats');
  const { summary, generatedAt } = stats;
  const now = generatedAt;
  const sellOnline = summary.addons.sell_online ?? 0;
  const adoption = summary.tenants > 0 ? Math.round((sellOnline / summary.tenants) * 100) : 0;
  const trialing = (summary.byState.trial ?? 0) + (summary.byState.trial_ending ?? 0);
  const recentSignups = [...stats.tenants].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const totalCollected12m = stats.collectionsByMonth.reduce((sum, m) => sum + m.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            {summary.tenants} tenant{summary.tenants === 1 ? '' : 's'} · {summary.payingTenants} paying · updated {formatDay(generatedAt)}
          </p>
        </div>
      </div>

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="MRR"
          value={formatKES(summary.mrr)}
          hint={`${summary.payingTenants} paying tenant${summary.payingTenants === 1 ? '' : 's'}`}
          icon={TrendingUp}
          tone="good"
        />
        <KpiCard label="ARR" value={formatKES(summary.arr, { compact: true })} hint="MRR × 12" icon={CircleDollarSign} tone="good" />
        <KpiCard
          label="Collected this month"
          value={formatKES(summary.collectedThisMonth)}
          hint={<Delta current={summary.collectedThisMonth} previous={summary.collectedLastMonth} />}
          icon={Banknote}
          tone="info"
          href="/platform/payments"
        />
        <KpiCard
          label="Overdue"
          value={summary.overdue}
          hint={summary.dueSoon > 0 ? `${summary.dueSoon} more due within 7 days` : 'None due within 7 days'}
          icon={AlarmClock}
          tone={summary.overdue > 0 ? 'bad' : 'default'}
          href="/platform/tenants?state=overdue"
        />
        <KpiCard
          label="Trials ending"
          value={summary.trialsEnding}
          hint={`${trialing} in trial · ${summary.byState.trial_expired ?? 0} expired`}
          icon={CalendarClock}
          tone={summary.trialsEnding > 0 ? 'warn' : 'default'}
          href="/platform/tenants?state=trial"
        />
        <KpiCard
          label="Paying tenants"
          value={summary.payingTenants}
          hint={`of ${summary.tenants} total`}
          icon={Building2}
          href="/platform/tenants?state=paid"
        />
        <KpiCard label="New this month" value={summary.newThisMonth} hint="Sign-ups since the 1st" icon={UserPlus} tone="info" />
        <KpiCard
          label="Active (30 days)"
          value={summary.activeLast30d}
          hint={`${summary.tenants - summary.activeLast30d} with no sales in 30 days`}
          icon={Activity}
        />
        <KpiCard
          label={ADDON_LABELS.sell_online}
          value={`${adoption}%`}
          hint={`${sellOnline} of ${summary.tenants} tenants`}
          icon={ShoppingBag}
        >
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary" style={{ width: `${adoption}%` }} />
          </div>
        </KpiCard>
        <KpiCard
          label="Needs attention"
          value={summary.needsAttention}
          hint="Overdue, trials, renewals"
          icon={Sparkles}
          tone={summary.needsAttention > 0 ? 'warn' : 'default'}
          href="/platform/tenants?state=attention"
        />
      </section>

      <section aria-label="How tenants use Fundi" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Usage</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <KpiCard
            label="Waiting on you"
            value={summary.pendingClaims + summary.pendingTrialRequests}
            hint={`${summary.pendingClaims} payment claim${summary.pendingClaims === 1 ? '' : 's'} · ${summary.pendingTrialRequests} trial request${summary.pendingTrialRequests === 1 ? '' : 's'}`}
            icon={Inbox}
            tone={summary.pendingClaims + summary.pendingTrialRequests > 0 ? 'bad' : 'default'}
            href="/platform/tenants?state=waiting"
          />
          <KpiCard
            label="Active this week"
            value={`${summary.active7} / ${summary.tenants}`}
            hint="Signed in or sold in the last 7 days"
            icon={Activity}
            tone="good"
          />
          <KpiCard
            label="Slipping or inactive"
            value={summary.atRisk}
            hint="Idle 4+ days, sales halved, or never started"
            icon={HeartPulse}
            tone={summary.atRisk > 0 ? 'warn' : 'default'}
            href="/platform/tenants?state=usage_risk"
          />
          <KpiCard
            label="Follow-ups due"
            value={summary.followUpsDue}
            hint="From your contact log"
            icon={PhoneCall}
            tone={summary.followUpsDue > 0 ? 'bad' : 'default'}
            href="/platform/tenants?state=followups"
          />
          <KpiCard
            label="Sales through Fundi · 30d"
            value={kesShort(summary.revenue30)}
            hint={`Est. profit ${kesShort(summary.profit30)}`}
            icon={Store}
            tone="info"
          />
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Last 30 days</CardTitle>
              <CardDescription>Daily sales across every shop, and how many shops were in use each day.</CardDescription>
            </CardHeader>
            <CardContent>
              <PlatformDailyChart data={stats.daily} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Health and setup</CardTitle>
              <CardDescription>Tap a row to see those tenants.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-1">
                {HEALTH_LEVELS.map((level) => (
                  <li key={level}>
                    <Link
                      href={`/platform/tenants?usage=health:${level}`}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <HealthBadge level={level} />
                      <span className="text-sm tabular-nums">{summary.health[level] ?? 0}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Setup funnel - where each shop is stuck</span>
                {SETUP_STAGES.map((stage) => {
                  const n = summary.setupFunnel[stage] ?? 0;
                  const pct = summary.tenants > 0 ? (n / summary.tenants) * 100 : 0;
                  const inner = (
                    <>
                      <div className="flex justify-between gap-2 text-sm">
                        <span>{SETUP_STAGE_LABELS[stage]}</span>
                        <span className="text-muted-foreground tabular-nums">{n}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted">
                        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </>
                  );
                  return stage === 'selling' ? (
                    <div key={stage} className="flex flex-col gap-1 px-2 py-1">
                      {inner}
                    </div>
                  ) : (
                    <Link
                      key={stage}
                      href={`/platform/tenants?usage=setup:${stage}`}
                      className="flex flex-col gap-1 rounded-md px-2 py-1 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {inner}
                    </Link>
                  );
                })}
              </div>
              <span className="text-xs text-muted-foreground">
                {HEALTH_LABELS.healthy}: used in the last 3 days with sales holding up. Sign-in history goes back to launch (backfilled from
                the audit log); which app people use is tracked from this release on.
              </span>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>Most urgent first. Call, WhatsApp a polite reminder, or record a payment.</CardDescription>
          </CardHeader>
          <CardContent>
            <AttentionList rows={stats.tenants} now={now} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Collections</CardTitle>
            <CardDescription>Last 12 months · {formatKES(totalCollected12m)} total</CardDescription>
          </CardHeader>
          <CardContent>
            {totalCollected12m === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No payments recorded yet"
                description="Record a tenant's M-Pesa or bank payment and it shows up here by month."
              />
            ) : (
              <CollectionsChart data={stats.collectionsByMonth} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent payments</CardTitle>
            <CardAction>
              <Link href="/platform/payments" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
                All payments
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {stats.recentPayments.length === 0 ? (
              <EmptyState icon={Receipt} title="No payments yet" description="Payments you record appear here, newest first." />
            ) : (
              <ul className="divide-y">
                {stats.recentPayments.slice(0, 8).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 flex-col">
                      <Link href={`/platform/tenants/${p.tenant}`} className="truncate text-sm font-medium hover:underline">
                        {p.tenantName}
                      </Link>
                      <span className="truncate text-xs text-muted-foreground">
                        {formatDay(p.paidAt)} · {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                        {p.reference ? ` · ${p.reference}` : ''}
                      </span>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{formatKES(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent sign-ups</CardTitle>
            <CardAction>
              <Link href="/platform/tenants" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
                All tenants
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {recentSignups.length === 0 ? (
              <EmptyState icon={UserPlus} title="No tenants yet" description="New businesses appear here as soon as they sign up." />
            ) : (
              <ul className="divide-y">
                {recentSignups.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 flex-col">
                      <Link href={`/platform/tenants/${t.id}`} className="truncate text-sm font-medium hover:underline">
                        {t.name}
                      </Link>
                      <span className="truncate text-xs text-muted-foreground">
                        {t.owner?.email ?? 'No owner email'} · joined {timeAgo(t.createdAt, now).toLowerCase()}
                      </span>
                    </div>
                    <SubscriptionStateBadge state={t.state} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
