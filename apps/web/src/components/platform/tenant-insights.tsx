import { CheckCircle2, Circle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { SalesProfitChart } from './daily-charts';
import { DeviceActions } from './device-actions';
import { formatDay, formatKES, timeAgo, titleCase } from './format';
import { Delta, HealthBadge, kesShort, SetupStageBadge, Stat } from './insights';
import type { TenantInsights } from './types';

const METHOD_LABELS: Record<string, string> = { cash: 'Cash', mpesa: 'M-Pesa', card: 'Card', credit: 'Credit' };
const SOURCE_LABELS: Record<string, string> = { web: 'Web dashboard', desktop: 'Desktop till', mobile: 'Mobile till' };
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------------------------------------------------------------- Overview

export function OverviewTab({ data, createdAt, children }: { data: TenantInsights; createdAt: string; children?: React.ReactNode }) {
  const r = data.rollup;
  const now = data.generatedAt;
  const margin = r.revenue30 > 0 ? Math.round((r.profit30 / r.revenue30) * 100) : null;
  const basket = r.sales30 > 0 ? r.revenue30 / r.sales30 : 0;
  const milestones = [
    { label: 'Signed up', at: createdAt },
    { label: 'First product', at: data.milestones.firstProduct },
    { label: 'First stock', at: data.milestones.firstStock },
    { label: 'First sale', at: data.milestones.firstSale },
    { label: '10th sale', at: data.milestones.tenthSale },
    { label: 'First payment to us', at: data.milestones.firstPayment },
  ];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Why it&apos;s <HealthBadge level={data.health.level} /> <SetupStageBadge stage={data.setupStage} />
            </CardTitle>
            <CardDescription>
              Last active {timeAgo(r.lastActiveAt, now).toLowerCase()} · last sign-in {timeAgo(r.lastLoginAt, now).toLowerCase()} · last sale{' '}
              {timeAgo(r.lastSaleAt, now).toLowerCase()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.health.reasons.length > 0 ? (
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                {data.health.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Using it daily, sales holding up.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Sales · 30d" value={kesShort(r.revenue30)} hint={<Delta current={r.revenue30} previous={r.revenuePrev30} />} />
          <Stat label="Est. profit · 30d" value={kesShort(r.profit30)} hint={margin != null ? `${margin}% margin` : undefined} />
          <Stat label="Transactions · 30d" value={r.sales30.toLocaleString('en-KE')} hint={basket ? `avg ${kesShort(basket)}` : undefined} />
          <Stat label="Stock value (cost)" value={kesShort(r.stockCost)} hint={`retail ${kesShort(r.stockRetail)}`} />
          <Stat label="Active days · 30d" value={`${r.activeDays30} / 30`} />
          <Stat label="Sign-ins · 30d" value={r.logins30.toLocaleString('en-KE')} />
          <Stat label="Staff active · 30d" value={`${r.activeStaff30} / ${r.staff}`} />
          <Stat label="Lifetime sales" value={kesShort(data.lifetime.revenue)} hint={`${data.lifetime.orders.toLocaleString('en-KE')} sales`} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sales and profit</CardTitle>
            <CardDescription>
              Completed sales per day. Profit is an estimate: lines without a cost price are left out, and order-level discounts aren&apos;t
              deducted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SalesProfitChart data={data.daily} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Milestones</CardTitle>
            <CardDescription>
              {formatKES(data.lifetime.paidToUs)} paid to Fundi POS so far
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2 sm:grid-cols-2">
              {milestones.map((m) => (
                <li key={m.label} className="flex items-center gap-2 text-sm">
                  {m.at ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
                  )}
                  <span className={cn(!m.at && 'text-muted-foreground')}>{m.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{m.at ? formatDay(m.at) : 'Not yet'}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------- Usage

function ActivityCalendar({ days }: { days: TenantInsights['activityCalendar'] }) {
  const max = Math.max(...days.map((d) => d.users), 1);
  const active = days.filter((d) => d.users > 0).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid w-fit max-w-full grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-1" style={{ gridAutoColumns: '14px' }}>
        {days.map((d) => (
          <span
            key={d.day}
            title={`${d.day}: ${d.users} ${d.users === 1 ? 'person' : 'people'}`}
            className={cn('aspect-square rounded-[3px]', d.users === 0 ? 'bg-muted' : 'bg-primary')}
            style={d.users > 0 ? { opacity: 0.35 + 0.65 * (d.users / max) } : undefined}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        Used on {active} of the last {days.length} days. Darker = more people.
      </span>
    </div>
  );
}

function BusyHours({ cells }: { cells: TenantInsights['busyHours'] }) {
  if (cells.length === 0) return <p className="text-sm text-muted-foreground">No sales in the last 90 days.</p>;
  const counts = new Map(cells.map((c) => [`${c.dow}:${c.hour}`, c.count]));
  const hours = cells.map((c) => c.hour);
  const from = Math.min(...hours, 7);
  const to = Math.max(...hours, 19);
  const max = Math.max(...cells.map((c) => c.count), 1);
  const range = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-[10px] text-muted-foreground">
        <thead>
          <tr>
            <th />
            {range.map((h) => (
              <th key={h} className="font-normal">
                {h % 3 === 0 ? h : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DOW.map((label, i) => (
            <tr key={label}>
              <th className="pr-1 text-right font-normal">{label}</th>
              {range.map((h) => {
                const n = counts.get(`${i + 1}:${h}`) ?? 0;
                return (
                  <td
                    key={h}
                    title={`${label} ${h}:00 - ${n} sale${n === 1 ? '' : 's'}`}
                    className={cn('size-4 min-w-4 rounded-[3px]', n === 0 ? 'bg-muted' : 'bg-primary')}
                    style={n > 0 ? { opacity: 0.25 + 0.75 * (n / max) } : undefined}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bars({ items }: { items: { label: string; value: number; display: string }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((i) => (
        <li key={i.label} className="flex flex-col gap-1">
          <div className="flex justify-between gap-2 text-sm">
            <span>{i.label}</span>
            <span className="text-muted-foreground tabular-nums">
              {i.display} · {Math.round((i.value / total) * 100)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(i.value / total) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function UsageTab({ data }: { data: TenantInsights }) {
  const f = data.features;
  const features: { label: string; used: boolean; detail: string }[] = [
    { label: 'Prices set', used: data.rollup.products > 0, detail: `${f.products} active products` },
    { label: 'Cost prices', used: f.costedProducts > 0, detail: `${f.costedProducts} of ${f.products} products` },
    { label: 'M-Pesa sales', used: f.mpesaSales30 > 0, detail: `${f.mpesaSales30} in 30 days` },
    { label: 'Credit sales', used: f.creditSales30 > 0, detail: `${f.creditSales30} in 30 days` },
    { label: 'Customers', used: f.customers > 0, detail: `${f.customers} saved` },
    { label: 'Quotations', used: f.quotations30 > 0, detail: `${f.quotations30} in 30 days` },
    { label: 'Suppliers', used: f.suppliers > 0, detail: `${f.suppliers} saved` },
    { label: 'Purchase orders', used: f.purchaseOrders > 0, detail: `${f.purchaseOrders} total` },
    { label: 'Stock transfers', used: f.stockTransfers > 0, detail: `${f.stockTransfers} total` },
    { label: 'Shifts', used: f.shifts30 > 0, detail: `${f.shifts30} opened in 30 days` },
    { label: 'More than one branch', used: f.stores > 1, detail: `${f.stores} branch${f.stores === 1 ? '' : 'es'}` },
    { label: 'Online / phone orders', used: f.nonWalkIn30 > 0, detail: `${f.nonWalkIn30} in 30 days` },
    { label: 'Promo codes', used: f.promoCodes > 0, detail: `${f.promoCodes} created` },
  ];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Days in use</CardTitle>
          <CardDescription>Last 90 days, one square per day.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityCalendar days={data.activityCalendar} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Busy hours</CardTitle>
          <CardDescription>Sales by day and hour (Nairobi time), last 90 days.</CardDescription>
        </CardHeader>
        <CardContent>
          <BusyHours cells={data.busyHours} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Features they use</CardTitle>
          <CardDescription>What to teach next on a call.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {features.map((feat) => (
              <li key={feat.label} className="flex items-start gap-2 text-sm">
                {feat.used ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" aria-hidden />
                )}
                <span className="flex flex-col">
                  <span className={cn(!feat.used && 'text-muted-foreground')}>{feat.label}</span>
                  <span className="text-xs text-muted-foreground">{feat.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>How they get paid · 30d</CardTitle>
          </CardHeader>
          <CardContent>
            <Bars
              items={data.paymentMix.map((p) => ({ label: METHOD_LABELS[p.method] ?? titleCase(p.method), value: p.amount, display: kesShort(p.amount) }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Which apps · 30d</CardTitle>
            <CardDescription>Share of activity by app. Older till builds don&apos;t report this yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <Bars items={data.appShare.map((a) => ({ label: SOURCE_LABELS[a.source] ?? a.source, value: a.count, display: `${a.count}` }))} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top products · 30d</CardTitle>
        </CardHeader>
        <CardContent>
          {data.topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales in the last 30 days.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Est. profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topProducts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-[16rem] truncate">{p.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.qty.toLocaleString('en-KE')}</TableCell>
                    <TableCell className="text-right tabular-nums">{kesShort(p.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.profit == null ? '—' : kesShort(p.profit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branches · 30d</CardTitle>
          {data.stockLinesMissingCost > 0 ? (
            <CardDescription>{data.stockLinesMissingCost} stocked items have no cost price, so stock value is understated.</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
                <TableHead className="text-right">Stock (cost)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.stores.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{kesShort(s.revenue30)}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.orders30.toLocaleString('en-KE')}</TableCell>
                  <TableCell className="text-right tabular-nums">{kesShort(s.stockCost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// -------------------------------------------------------------------- Team

const PLATFORM_LABELS: Record<string, string> = { desktop: 'desktop', mobile: 'phone', web: 'web' };

export function TeamTab({ data }: { data: TenantInsights }) {
  const now = data.generatedAt;
  // Registered tills first (with revoke), then tills only known from synced sales.
  const sales = new Map(data.terminals.map((t) => [t.terminal, t]));
  const tills = [
    ...data.devices.map((d) => {
      const s = sales.get(d.terminalId);
      const lastSale = s?.lastSaleAt ?? null;
      return {
        deviceId: d.id,
        terminalId: d.terminalId,
        name: d.name ?? s?.name ?? null,
        platform: d.platform,
        store: s?.store ?? null,
        lastUser: d.lastUser,
        lastSeenAt: [d.lastSeenAt, lastSale].filter(Boolean).sort().at(-1) ?? null,
        sales30: s?.sales30 ?? 0,
        revokedAt: d.revokedAt,
        revokeReason: d.revokeReason,
      };
    }),
    ...data.terminals
      .filter((t) => !data.devices.some((d) => d.terminalId === t.terminal))
      .map((t) => ({
        deviceId: null as number | null,
        terminalId: t.terminal,
        name: t.name,
        platform: null as string | null,
        store: t.store,
        lastUser: null as string | null,
        lastSeenAt: t.lastSaleAt,
        sales30: t.sales30,
        revokedAt: null as string | null,
        revokeReason: null as string | null,
      })),
  ];
  const stale = (iso: string | null, days: number) => !iso || new Date(now).getTime() - new Date(iso).getTime() > days * 86_400_000;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Staff</CardTitle>
          <CardDescription>Sign-ins come from the web dashboard and till logins; sales from synced orders.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead className="text-right">Sign-ins · 30d</TableHead>
                <TableHead className="text-right">Active days</TableHead>
                <TableHead className="text-right">Sales · 30d</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.staff.map((s) => (
                <TableRow key={s.id} className={cn(s.status !== 'active' && 'opacity-60')}>
                  <TableCell>
                    <span className="flex flex-col">
                      <span>{s.name || s.email || s.phone}</span>
                      <span className="text-xs text-muted-foreground">
                        {[s.phone, s.email].filter((v) => v && v !== (s.name || s.email || s.phone)).join(' · ')}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    {titleCase(s.role)}
                    {s.status !== 'active' ? <span className="ml-1 text-xs text-muted-foreground">({s.status})</span> : null}
                  </TableCell>
                  <TableCell className={cn(stale(s.lastActiveAt, 14) && 'text-amber-700 dark:text-amber-300')}>
                    {timeAgo(s.lastActiveAt, now)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.logins30}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.activeDays30}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.sales30} <span className="text-xs text-muted-foreground">({kesShort(s.revenue30)})</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tills</CardTitle>
          <CardDescription>
            Each till registers when someone signs in or a sale syncs. Revoke a lost or stolen one: it can&apos;t sign in again and an open
            session ends within a few hours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No till has signed in or synced a sale yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Till</TableHead>
                  <TableHead>Branch · last user</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead className="text-right">Sales · 30d</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tills.map((t) => (
                  <TableRow key={t.terminalId} className={cn(t.revokedAt && 'opacity-60')}>
                    <TableCell>
                      <span className="flex flex-col">
                        <span>
                          {t.name || 'Unnamed till'}
                          {t.platform ? <span className="ml-1 text-xs text-muted-foreground">({PLATFORM_LABELS[t.platform] ?? t.platform})</span> : null}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">{t.terminalId.slice(0, 8)}</span>
                        {t.revokedAt ? (
                          <span className="text-xs font-medium text-red-700 dark:text-red-300">
                            Revoked {formatDay(t.revokedAt)}
                            {t.revokeReason ? ` - ${t.revokeReason}` : ''}
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{[t.store, t.lastUser].filter(Boolean).join(' · ') || '—'}</TableCell>
                    <TableCell className={cn(stale(t.lastSeenAt, 7) && 'text-amber-700 dark:text-amber-300')}>{timeAgo(t.lastSeenAt, now)}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.sales30}</TableCell>
                    <TableCell className="text-right">
                      {t.deviceId != null ? (
                        <DeviceActions id={t.deviceId} name={t.name || 'this till'} revoked={Boolean(t.revokedAt)} />
                      ) : (
                        <span className="text-xs text-muted-foreground" title="Registers the next time it signs in or syncs">
                          Not registered yet
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
