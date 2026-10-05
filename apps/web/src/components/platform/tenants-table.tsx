'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, Download, Search, X } from 'lucide-react';
import { ADDON_LABELS, ADDONS, SUBSCRIPTION_STATE_LABELS, type Addon } from '@hardware-pos/business-logic';
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
  { key: 'attention', label: 'Needs attention' },
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
    case 'trial':
      return row.state === 'trial' || row.state === 'trial_ending' || row.state === 'trial_expired';
    default:
      return row.state === chip;
  }
}

type SortKey = 'name' | 'paidUntil' | 'mrr' | 'activity' | 'created';
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
      return (a.usage.lastOrderAt ?? '').localeCompare(b.usage.lastOrderAt ?? '');
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
  showDeleted,
  deleted,
}: {
  rows: PlatformTenantRow[];
  now: string;
  initialChip?: string;
  showDeleted: boolean;
  deleted: DeletedTenant[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<ChipKey>(CHIPS.some((c) => c.key === initialChip) ? (initialChip as ChipKey) : 'all');
  const [tier, setTier] = useState('all');
  const [addon, setAddon] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'created', dir: 'desc' });

  const counts = useMemo(() => Object.fromEntries(CHIPS.map((c) => [c.key, rows.filter((r) => matchesChip(r, c.key)).length])), [rows]);

  const filtered = useMemo(() => {
    const base = rows.filter(
      (r) =>
        matchesChip(r, chip) &&
        (tier === 'all' || r.subscriptionTier === tier) &&
        (addon === 'all' || (addon === 'none' ? r.addons.length === 0 : r.addons.includes(addon))),
    );
    const searched = fuzzySearch(base, ['name', 'owner.email', 'owner.phone', 'owner.name', 'billingContact.phone'], query);
    // Keep relevance order while searching; otherwise apply the chosen sort.
    if (query.trim()) return searched;
    const sorted = [...searched].sort((a, b) => compare(a, b, sort.key));
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
  }, [rows, chip, tier, addon, query, sort]);

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
        'Last activity',
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
        r.usage.lastOrderAt ? formatDay(r.usage.lastOrderAt) : '',
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
  };
  const anyFilter = query.trim() !== '' || chip !== 'all' || tier !== 'all' || addon !== 'all';

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
            </div>
          ) : null}
        </div>

        {!showDeleted ? (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter by billing state">
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
                    <SubscriptionStateBadge state={row.state} />
                  </div>
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
                      <dt className="text-muted-foreground">Orders 30d</dt>
                      <dd className="font-medium tabular-nums">
                        {row.usage.orders30d}
                        <span className="block font-normal text-muted-foreground">{timeAgo(row.usage.lastOrderAt, now)}</span>
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
                  <TableHead>State</TableHead>
                  <SortHeader label="Plan" sortKey="mrr" sort={sort} onSort={onSort} />
                  <SortHeader label="Paid until" sortKey="paidUntil" sort={sort} onSort={onSort} />
                  <TableHead className="hidden xl:table-cell">Last payment</TableHead>
                  <TableHead className="text-right">Usage (30d)</TableHead>
                  <SortHeader label="Last activity" sortKey="activity" sort={sort} onSort={onSort} className="hidden lg:table-cell" />
                  <SortHeader label="Created" sortKey="created" sort={sort} onSort={onSort} className="hidden xl:table-cell" />
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
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <SubscriptionStateBadge state={row.state} />
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
                    <TableCell className="hidden xl:table-cell">
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
                    <TableCell className="text-right tabular-nums">
                      <div className="flex flex-col">
                        <span>
                          {row.usage.orders30d} order{row.usage.orders30d === 1 ? '' : 's'}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatKES(row.usage.gmv30d, { compact: true })}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{timeAgo(row.usage.lastOrderAt, now)}</TableCell>
                    <TableCell className="hidden text-muted-foreground xl:table-cell">{formatDay(row.createdAt)}</TableCell>
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
