'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Receipt, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { fuzzySearch } from '@/lib/fuzzy-search';
import { downloadCsv, formatDay, formatKES, formatMonthKey, nairobiMonthKey } from './format';
import { RecordPaymentDialog } from './record-payment-dialog';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  paymentTenantId,
  recordedByName,
  type PayableTenant,
  type SubscriptionPayment,
} from './types';

interface LedgerRow extends SubscriptionPayment {
  tenantId: number;
  tenantName: string;
  month: string;
}

export function PaymentsLedger({
  payments,
  tenantNames,
  payable,
}: {
  payments: SubscriptionPayment[];
  tenantNames: Record<number, string>;
  payable: PayableTenant[];
}) {
  const rows = useMemo<LedgerRow[]>(
    () =>
      payments.map((p) => {
        const tenantId = paymentTenantId(p);
        const tenantName = typeof p.tenant === 'object' ? p.tenant.name : (tenantNames[tenantId] ?? `Tenant #${tenantId}`);
        return { ...p, tenantId, tenantName, month: nairobiMonthKey(p.paidAt) };
      }),
    [payments, tenantNames],
  );
  const months = useMemo(() => [...new Set(rows.map((r) => r.month))].sort().reverse(), [rows]);

  const [month, setMonth] = useState('all');
  const [method, setMethod] = useState('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const base = rows.filter((r) => (month === 'all' || r.month === month) && (method === 'all' || r.method === method));
    return fuzzySearch(base, ['tenantName', 'reference', 'note'], query);
  }, [rows, month, method, query]);

  const total = filtered.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  const byMethod = PAYMENT_METHODS.map((m) => ({
    method: m,
    amount: filtered.filter((r) => r.method === m).reduce((sum, r) => sum + Number(r.amount ?? 0), 0),
  })).filter((m) => m.amount > 0);
  const tenantCount = new Set(filtered.map((r) => r.tenantId)).size;

  function exportCsv() {
    downloadCsv(
      `payments-${month}-${method}.csv`,
      ['Paid on', 'Tenant ID', 'Tenant', 'Amount (KES)', 'Method', 'Reference', 'Period start', 'Period end', 'Note', 'Recorded by'],
      filtered.map((r) => [
        formatDay(r.paidAt),
        r.tenantId,
        r.tenantName,
        r.amount,
        PAYMENT_METHOD_LABELS[r.method] ?? r.method,
        r.reference,
        r.periodStart ? formatDay(r.periodStart) : '',
        r.periodEnd ? formatDay(r.periodEnd) : '',
        r.note,
        recordedByName(r),
      ]),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tenant or reference"
            aria-label="Search payments"
            className="h-9 pl-8"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="h-9 w-full sm:w-40" aria-label="Filter by month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {formatMonthKey(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-9 w-full sm:w-36" aria-label="Filter by method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <section aria-label="Totals for the filtered payments" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="col-span-2 flex flex-col gap-0.5 rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:col-span-1">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-xl font-semibold tabular-nums">{formatKES(total)}</span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
          <span className="text-xs text-muted-foreground">Payments</span>
          <span className="text-xl font-semibold tabular-nums">{filtered.length}</span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
          <span className="text-xs text-muted-foreground">Tenants</span>
          <span className="text-xl font-semibold tabular-nums">{tenantCount}</span>
        </div>
        <div className="col-span-2 flex flex-col gap-1 rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:col-span-1">
          <span className="text-xs text-muted-foreground">By method</span>
          {byMethod.length === 0 ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <ul className="flex flex-col gap-0.5 text-xs">
              {byMethod.map((m) => (
                <li key={m.method} className="flex justify-between gap-2">
                  <span>{PAYMENT_METHOD_LABELS[m.method]}</span>
                  <span className="font-medium tabular-nums">{formatKES(m.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {filtered.length} of {rows.length} payments
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download aria-hidden /> Export CSV
          </Button>
          <RecordPaymentDialog tenants={payable} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed">
          <EmptyState
            icon={Receipt}
            title={rows.length === 0 ? 'No payments recorded yet' : 'No payments match these filters'}
            description={
              rows.length === 0
                ? 'Use “Record payment” whenever a tenant pays by M-Pesa, bank or cash.'
                : 'Try another month or method, or clear the search.'
            }
          />
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2 md:hidden">
            {filtered.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Link href={`/platform/tenants/${r.tenantId}`} className="truncate font-medium hover:underline">
                    {r.tenantName}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {formatDay(r.paidAt)} · {PAYMENT_METHOD_LABELS[r.method] ?? r.method}
                    {r.reference ? ` · ${r.reference}` : ''}
                  </span>
                  {r.periodEnd ? <span className="text-xs text-muted-foreground">Covers until {formatDay(r.periodEnd)}</span> : null}
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{formatKES(r.amount)}</span>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-xl ring-1 ring-foreground/10 md:block">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="pl-4">Paid on</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="hidden lg:table-cell">Recorded by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-4">{formatDay(r.paidAt)}</TableCell>
                    <TableCell className="max-w-56">
                      <Link href={`/platform/tenants/${r.tenantId}`} className="block truncate font-medium underline-offset-2 hover:underline">
                        {r.tenantName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatKES(r.amount)}</TableCell>
                    <TableCell>{PAYMENT_METHOD_LABELS[r.method] ?? r.method}</TableCell>
                    <TableCell className="font-mono text-xs">{r.reference || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.periodEnd ? `${r.periodStart ? `${formatDay(r.periodStart)} – ` : ''}${formatDay(r.periodEnd)}` : '—'}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{recordedByName(r)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-4" colSpan={2}>
                    Total ({filtered.length})
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatKES(total)}</TableCell>
                  <TableCell colSpan={4} />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
