'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, Download, Search, X } from 'lucide-react';
import {
  ADDON_LABELS,
  ADDONS,
  HEALTH_LABELS,
  HEALTH_LEVELS,
  isAttentionHealth,
  SETUP_STAGE_LABELS,
  SETUP_STAGES,
  SUBSCRIPTION_STATE_LABELS,
  type Addon,
} from '@hardware-pos/business-logic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { fuzzySearch } from '@/lib/fuzzy-search';
import { cn } from '@/lib/utils';
import { SubscriptionStateBadge, TenantStatusBadge } from './badges';
import { keyDaysLabel } from './billing';
import { downloadCsv, formatDay, formatKES, relativeDays, timeAgo, titleCase } from './format';
import { Delta, HealthBadge, kesShort, Sparkline } from './insights';
import { SUBSCRIPTION_TIERS, type PlatformTenantRow } from './types';

export interface DeletedTenant {
  id: number;
  name: string;
  subscriptionTier: string;
  statusChangedAt?: string | null;
  statusReason?: string | null;
  createdAt: string;
}

const CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'waiting', label: 'Waiting on you' },
  { key: 'attention', label: 'Billing attention' },
  { key: 'usage_risk', label: 'Slipping / inactive' },
  { key: 'followups', label: 'Follow-ups due' },
  { key: 'blocked', label: 'Locked out' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'due_soon', label: 'Due soon' },
  { key: 'trial', label: 'Trial' },
  { key: 'paid', label: 'Paid' },
  { key: 'canceled', label: 'Canceled' },
  { key: 'suspended', label: 'Suspended' },
] as const;
type ChipKey = (typeof CHIPS)[number]['key'];

function matchesChip(row: PlatformTenantRow, chip: ChipKey): boolean {
  switch (chip) {
    case 'all':
      return true;
    case 'attention':
      return row.needsAttention;
    case 'waiting':
      return row.pendingClaims > 0 || row.pendingTrialRequests > 0;
    case 'usage_risk':
      return isAttentionHealth(row.health.level);
    case 'followups':
      return row.followUpDue;
    case 'blocked':
      return row.blocked;
    case 'trial':
      return row.state === 'trial' || row.state === 'trial_ending' || row.state === 'trial_expired';
    default:
      return row.state === chip;
  }
}

type SortKey = 'name' | 'paidUntil' | 'mrr' | 'activity' | 'created' | 'health' | 'sales';

// "health:<level>" or "setup:<stage>" (overview links use ?usage=).
function matchesUsage(row: PlatformTenantRow, usage: string): boolean {
  if (usage === 'all') return true;
  const [kind, value] = usage.split(':');
  if (kind === 'health') return row.health.level === value;
  if (kind === 'setup') return row.setupStage === value;
  return true;
}
type SortDir = 'asc' | 'desc';

function compare(a: PlatformTenantRow, b: PlatformTenantRow, key: SortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'paidUntil':
      // Never-paid sorts as "earliest" - they're the ones to look at first.
      return (a.paidUntil ?? '').localeCompare(b.paidUntil ?? '');
    case 'mrr':
      return a.monthlyValue - b.monthlyValue;
    case 'activity':
      return (a.activity.lastActiveAt ?? '').localeCompare(b.activity.lastActiveAt ?? '');
    case 'health':
      // Ties: the bigger shop first.
      return a.health.urgency - b.health.urgency || a.sales.revenuePrev30 - b.sales.revenuePrev30;
    case 'sales':
      return a.sales.revenue30 - b.sales.revenue30;
    case 'created':
      return a.createdAt.localeCompare(b.createdAt);
  }
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="-mx-1 inline-flex items-center gap-1 rounded px-1 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {label}
        <Icon className={cn('size-3.5', active ? 'text-foreground' : 'text-muted-foreground/60')} aria-hidden />
      </button>
    </TableHead>
  );
}

function PaidUntilCell({ row, now }: { row: PlatformTenantRow; now: string }) {
  if (!row.paidUntil) {
    return <span className="text-muted-foreground">{row.state.startsWith('trial') ? keyDaysLabel(row, now) : 'Never paid'}</span>;
  }
  const days = row.daysUntilDue;
  return (
    <div className="flex flex-col">
      <span>{formatDay(row.paidUntil)}</span>
      {days != null ? (
        <span
          className={cn(
            'text-xs',
            days < 0 ? 'font-medium text-red-700 dark:text-red-300' : days <= 7 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
          )}
        >
          {relativeDays(days)}
        </span>
      ) : null}
    </div>
  );
}

export function TenantsTable({
  rows,
  now,
  initialChip = 'all',
  initialUsage = 'all',
  showDeleted,
  deleted,
}: {
  rows: PlatformTenantRow[];
  now: string;
  initialChip?: string;
  initialUsage?: string;
  showDeleted: boolean;
  deleted: DeletedTenant[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<ChipKey>(CHIPS.some((c) => c.key === initialChip) ? (initialChip as ChipKey) : 'all');
  const [tier, setTier] = useState('all');
  const [addon, setAddon] = useState('all');
  const [usage, setUsage] = useState(initialUsage);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'created', dir: 'desc' });

  const counts = useMemo(() => Object.fromEntries(CHIPS.map((c) => [c.key, rows.filter((r) => matchesChip(r, c.key)).length])), [rows]);

  const filtered = useMemo(() => {
    const base = rows.filter(
      (r) =>
        matchesChip(r, chip) &&
        (tier === 'all' || r.subscriptionTier === tier) &&
        (addon === 'all' || (addon === 'none' ? r.addons.length === 0 : r.addons.includes(addon))) &&
        matchesUsage(r, usage),
    );
    const searched = fuzzySearch(base, ['name', 'owner.email', 'owner.phone', 'owner.name', 'billingContact.phone'], query);
    // Keep relevance order while searching; otherwise apply the chosen sort.
    if (query.trim()) return searched;
    const sorted = [...searched].sort((a, b) => compare(a, b, sort.key));
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
  }, [rows, chip, tier, addon, usage, query, sort]);

  const deletedFiltered = useMemo(() => fuzzySearch(deleted, ['name'], query), [deleted, query]);

  function onSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  }

  function toggleDeleted(on: boolean) {
    router.push(on ? '/platform/tenants?view=deleted' : '/platform/tenants');
  }

  function exportCsv() {
    const stamp = now.slice(0, 10);
    downloadCsv(
      `tenants-${chip}-${stamp}.csv`,
      [
        'ID',
        'Tenant',
        'Owner',
        'Owner email',
        'Phone',
        'State',
        'Account',
        'Tier',
        'Cycle',
        'Price per cycle (KES)',
        'MRR (KES)',
        'Paid until',
        'Days until due',
        'Last payment',
        'Total paid (KES)',
        'Orders 30d',
        'GMV 30d (KES)',
        'Health',
        'Health reasons',
        'Setup stage',
        'Last active',
        'Last sign-in',
        'Active days 30d',
        'Staff active 30d',
        'Est. profit 30d (KES)',
        'Stock value at cost (KES)',
        'Next follow-up',
        'Add-ons',
        'Created',
      ],
      filtered.map((r) => [
        r.id,
        r.name,
        r.owner?.name,
        r.owner?.email,
        r.billingContact.phone || r.owner?.phone,
        SUBSCRIPTION_STATE_LABELS[r.state],
        r.status,
        r.subscriptionTier,
        r.billingCycle,
        r.cyclePrice,
        r.monthlyValue,
        r.paidUntil ? formatDay(r.paidUntil) : '',
        r.daysUntilDue,
        r.payments.lastPaidAt ? formatDay(r.payments.lastPaidAt) : '',
        r.payments.total,
        r.usage.orders30d,
        Math.round(r.usage.gmv30d),
        HEALTH_LABELS[r.health.level],
        r.health.reasons.join('; '),
        SETUP_STAGE_LABELS[r.setupStage],
        r.activity.lastActiveAt ? formatDay(r.activity.lastActiveAt) : '',
        r.activity.lastLoginAt ? formatDay(r.activity.lastLoginAt) : '',
        r.activity.activeDays30,
        `${r.activity.activeStaff30}/${r.activity.staff}`,
        Math.round(r.sales.profit30),
        Math.round(r.sales.stockCost),
        r.followUpOn ?? '',
        r.addons.map((a) => ADDON_LABELS[a as Addon] ?? a).join('; '),
        formatDay(r.createdAt),
      ]),
    );
  }

  const clearFilters = () => {
    setQuery('');
    setChip('all');
    setTier('all');
    setAddon('all');
    setUsage('all');
  };
  const anyFilter = query.trim() !== '' || chip !== 'all' || tier !== 'all' || addon !== 'all' || usage !== 'all';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={showDeleted ? 'Search deleted tenants' : 'Search name, owner email or phone'}
              aria-label="Search tenants"
              className="h-9 pl-8"
            />
          </div>
          {!showDeleted ? (
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger className="h-9 w-full sm:w-36" aria-label="Filter by tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tiers</SelectItem>
                  {SUBSCRIPTION_TIERS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {titleCase(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={addon} onValueChange={setAddon}>
                <SelectTrigger className="h-9 w-full sm:w-40" aria-label="Filter by add-on">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any add-ons</SelectItem>
                  {ADDONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {ADDON_LABELS[a]}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">No add-ons</SelectItem>
                </SelectContent>
              </Select>
              <Select value={usage} onValueChange={setUsage}>
                <SelectTrigger className="col-span-2 h-9 w-full sm:col-span-1 sm:w-44" aria-label="Filter by health or setup stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any health</SelectItem>
                  {HEALTH_LEVELS.map((h) => (
                    <SelectItem key={h} value={`health:${h}`}>
                      {HEALTH_LABELS[h]}
                    </SelectItem>
                  ))}
                  {SETUP_STAGES.filter((st) => st !== 'selling').map((st) => (
                    <SelectItem key={st} value={`setup:${st}`}>
                      Setup: {SETUP_STAGE_LABELS[st]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        {!showDeleted ? (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter tenants">
            <div className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
              {CHIPS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setChip(c.key)}
                  aria-pressed={chip === c.key}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    chip === c.key
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {c.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-xs tabular-nums',
                      chip === c.key ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {counts[c.key]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Switch id="show-deleted" checked={showDeleted} onCheckedChange={toggleDeleted} />
            <Label htmlFor="show-deleted" className="text-sm font-normal text-muted-foreground">
              Show deleted tenants
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
              {showDeleted ? deletedFiltered.length : filtered.length} shown
            </span>
            {anyFilter && !showDeleted ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X aria-hidden /> Clear
              </Button>
            ) : null}
            {!showDeleted ? (
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
                <Download aria-hidden /> Export CSV
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {showDeleted ? (
        <DeletedList rows={deletedFiltered} />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed">
          <EmptyState
            icon={Building2}
            title={rows.length === 0 ? 'No tenants yet' : 'No tenants match these filters'}
            description={
              rows.length === 0
                ? 'Businesses appear here as soon as they sign up.'
                : 'Try a different state chip, clear the tier/add-on filters, or check the spelling.'
            }
          />
        </div>
      ) : (
        <>
          {/* Phones: one card per tenant. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {filtered.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/platform/tenants/${row.id}`}
                  className="flex flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10 outline-none active:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{row.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{row.owner?.email ?? 'No owner email'}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <HealthBadge level={row.health.level} />
                      <SubscriptionStateBadge state={row.state} />
                    </div>
                  </div>
                  {row.health.reasons[0] ? <span className="text-xs text-muted-foreground">{row.health.reasons[0]}</span> : null}
                  {row.followUpDue ? <FollowUpBadge on={row.followUpOn} /> : null}
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <div className="flex flex-col">
                      <dt className="text-muted-foreground">Plan</dt>
                      <dd className="truncate font-medium">
                        {titleCase(row.subscriptionTier)}
                        {row.cyclePrice > 0 ? ` · ${formatKES(row.cyclePrice, { compact: true })}` : ''}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-muted-foreground">Paid until</dt>
                      <dd className="font-medium">
                        {row.paidUntil ? (
                          formatDay(row.paidUntil)
                        ) : (
                          <span className="font-normal text-muted-foreground">{keyDaysLabel(row, now)}</span>
                        )}
                        {row.daysUntilDue != null && row.daysUntilDue < 0 ? (
                          <span className="block text-red-700 dark:text-red-300">{relativeDays(row.daysUntilDue)}</span>
                        ) : null}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-muted-foreground">Sales 30d</dt>
                      <dd className="font-medium tabular-nums">
                        {kesShort(row.sales.revenue30)} <Delta current={row.sales.revenue30} previous={row.sales.revenuePrev30} />
                        <span className="block font-normal text-muted-foreground">active {timeAgo(row.activity.lastActiveAt, now).toLowerCase()}</span>
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          {/* Tablet and up: sortable table. */}
          <div className="hidden overflow-hidden rounded-xl ring-1 ring-foreground/10 md:block">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <SortHeader label="Tenant" sortKey="name" sort={sort} onSort={onSort} className="pl-4" />
                  <SortHeader label="Health" sortKey="health" sort={sort} onSort={onSort} />
                  <TableHead>State</TableHead>
                  <SortHeader label="Plan" sortKey="mrr" sort={sort} onSort={onSort} />
                  <SortHeader label="Paid until" sortKey="paidUntil" sort={sort} onSort={onSort} />
                  <TableHead className="hidden 2xl:table-cell">Last payment</TableHead>
                  <SortHeader label="Sales (30d)" sortKey="sales" sort={sort} onSort={onSort} />
                  <SortHeader label="Last active" sortKey="activity" sort={sort} onSort={onSort} className="hidden lg:table-cell" />
                  <SortHeader label="Created" sortKey="created" sort={sort} onSort={onSort} className="hidden 2xl:table-cell" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a,button')) return;
                      router.push(`/platform/tenants/${row.id}`);
                    }}
                  >
                    <TableCell className="max-w-64 pl-4">
                      <div className="flex min-w-0 flex-col">
                        <Link
                          href={`/platform/tenants/${row.id}`}
                          className="truncate font-medium underline-offset-2 outline-none hover:underline focus-visible:underline"
                        >
                          {row.name}
                        </Link>
                        <span className="truncate text-xs text-muted-foreground">{row.owner?.email ?? '—'}</span>
                        {row.followUpDue ? <FollowUpBadge on={row.followUpOn} /> : null}
                      </div>
                    </TableCell>
                    <TableCell className="w-56 max-w-56 whitespace-normal">
                      <div className="flex min-w-0 flex-col items-start gap-1">
                        <HealthBadge level={row.health.level} />
                        {row.health.reasons[0] ? (
                          <span className="line-clamp-2 text-xs text-muted-foreground" title={row.health.reasons.join(' · ')}>
                            {row.health.reasons[0]}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <SubscriptionStateBadge state={row.state} />
                        {row.blocked && row.status === 'active' ? (
                          <span className="text-xs font-medium text-red-700 dark:text-red-300">Locked out</span>
                        ) : null}
                        {row.status !== 'active' ? <TenantStatusBadge status={row.status} /> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="capitalize">{row.subscriptionTier}</span>
                        <span className="text-xs text-muted-foreground">
                          {row.cyclePrice > 0 ? `${formatKES(row.cyclePrice)} / ${row.billingCycle}` : 'No charge'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PaidUntilCell row={row} now={now} />
                    </TableCell>
                    <TableCell className="hidden 2xl:table-cell">
                      {row.payments.lastPaidAt ? (
                        <div className="flex flex-col">
                          <span>{formatDay(row.payments.lastPaidAt)}</span>
                          <span className="text-xs text-muted-foreground">
                            {row.payments.count} payment{row.payments.count === 1 ? '' : 's'} · {formatKES(row.payments.total, { compact: true })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col tabular-nums">
                          <span>
                            {kesShort(row.sales.revenue30)} <Delta current={row.sales.revenue30} previous={row.sales.revenuePrev30} />
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {row.usage.orders30d} sale{row.usage.orders30d === 1 ? '' : 's'}
                          </span>
                        </div>
                        <Sparkline values={row.sales.spark30} className="hidden 2xl:block" />
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{timeAgo(row.activity.lastActiveAt, now)}</TableCell>
                    <TableCell className="hidden text-muted-foreground 2xl:table-cell">{formatDay(row.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function FollowUpBadge({ on }: { on: string | null }) {
  return (
    <span className="w-fit rounded-full bg-red-500/12 px-2 text-xs font-medium text-red-700 dark:text-red-300">
      Follow up{on ? ` · ${formatDay(`${on}T09:00:00Z`)}` : ''}
    </span>
  );
}

function DeletedList({ rows }: { rows: DeletedTenant[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed">
        <EmptyState icon={Building2} title="No deleted tenants" description="Soft-deleted tenants show up here and can be restored." />
      </div>
    );
  }
  return (
    <ul className="flex flex-col divide-y rounded-xl ring-1 ring-foreground/10">
      {rows.map((t) => (
        <li key={t.id}>
          <Link
            href={`/platform/tenants/${t.id}`}
            className="flex flex-col gap-1 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{t.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {titleCase(t.subscriptionTier)} · joined {formatDay(t.createdAt)}
                {t.statusReason ? ` · ${t.statusReason}` : ''}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              Deleted {t.statusChangedAt ? formatDay(t.statusChangedAt) : ''} · Restore from the tenant page
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
