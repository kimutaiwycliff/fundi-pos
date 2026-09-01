import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { cn } from '@/lib/utils';
import { BranchFilter } from '@/components/branch-filter';
import { PaymentBreakdownChart } from './payment-breakdown-chart';
import { PeakHoursChart, type HourPoint } from './peak-hours-chart';
import { ComparisonBadge } from './comparison-badge';
import { ReportsClient } from './reports-client';
import type { DailyPoint } from './daily-trend-chart';

interface SalesSummary {
  totalSales: number;
  totalTax: number;
  discountGivenTotal: number;
  orderCount: number;
  averageOrderValue: number;
  profitTotal: number | null;
  paymentBreakdown: { cash: number; mpesa: number; card: number; credit: number };
  topProducts: Array<{ name: string; revenue: number; quantity: number }>;
  byStore: Array<{ store: number; revenue: number; orderCount: number }>;
  byCategory: Array<{ category: string; revenue: number; quantity: number }>;
  byCashier: Array<{ cashier: number; name: string; revenue: number; orderCount: number }>;
  byHour: HourPoint[];
  voidedCount: number;
  voidedTotal: number;
  refundedCount: number;
  refundedTotal: number;
  comparison: { totalSales: number; orderCount: number; profitTotal: number | null } | null;
}
type Store = { id: number; name: string };

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
] as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; store?: string }>;
}) {
  const { range: rawRange, store: storeId } = await searchParams;
  const range = rawRange ?? 'today';
  const storeQS = storeId ? `&store=${storeId}` : '';
  // The trend chart shows day-by-day bars, which "today" (one day) and "all
  // time" (could be years) don't meaningfully map to - it defaults to a
  // 30-day window in either case and only narrows to 7 when that's exactly
  // what's selected above it.
  const trendRange = range === '7d' ? '7d' : '30d';

  const [summary, { docs: stores }, me, { days: dailyData }] = await Promise.all([
    payloadFetch<SalesSummary>(`/api/reports/sales-summary?range=${range}${storeQS}`),
    payloadFetch<{ docs: Store[] }>('/api/stores?sort=name&limit=100'),
    getCurrentUser(),
    payloadFetch<{ days: DailyPoint[] }>(`/api/reports/sales-daily?range=${trendRange}${storeQS}`),
  ]);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const canSeeProfit = me.role === 'owner';
  const hasLosses = summary.voidedCount + summary.refundedCount > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Sales &amp; margin</h1>
        <div className="flex flex-wrap items-center gap-2">
          {stores.length > 1 ? <BranchFilter stores={stores} /> : null}
          <div className="flex flex-wrap gap-1 rounded-md border p-1">
            {RANGES.map((r) => (
              <Link
                key={r.value}
                href={`?range=${r.value}${storeQS}`}
                className={cn(buttonVariants({ variant: range === r.value ? 'default' : 'ghost' }))}
              >
                {r.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${canSeeProfit ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Total sales</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              {summary.totalSales.toFixed(2)}
              <ComparisonBadge current={summary.totalSales} previous={summary.comparison?.totalSales ?? null} />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Orders</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              {summary.orderCount}
              <ComparisonBadge current={summary.orderCount} previous={summary.comparison?.orderCount ?? null} />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Average order</CardDescription>
            <CardTitle className="text-2xl">{summary.averageOrderValue.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        {canSeeProfit ? (
          <Card>
            <CardHeader className="gap-1">
              <CardDescription>Profit</CardDescription>
              <CardTitle className="flex items-center gap-2 text-2xl">
                {(summary.profitTotal ?? 0).toFixed(2)}
                <ComparisonBadge current={summary.profitTotal ?? 0} previous={summary.comparison?.profitTotal ?? null} />
              </CardTitle>
            </CardHeader>
          </Card>
        ) : null}
      </div>

      {summary.discountGivenTotal > 0 || hasLosses ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {summary.discountGivenTotal > 0 ? (
            <Card>
              <CardHeader className="gap-1">
                <CardDescription>Discounts given</CardDescription>
                <CardTitle className="text-lg">{summary.discountGivenTotal.toFixed(2)}</CardTitle>
              </CardHeader>
            </Card>
          ) : null}
          {summary.voidedCount > 0 ? (
            <Card className="border-destructive/30">
              <CardHeader className="gap-1">
                <CardDescription>Voided</CardDescription>
                <CardTitle className="text-lg">
                  {summary.voidedCount} <span className="text-sm font-normal text-muted-foreground">({summary.voidedTotal.toFixed(2)})</span>
                </CardTitle>
              </CardHeader>
            </Card>
          ) : null}
          {summary.refundedCount > 0 ? (
            <Card className="border-destructive/30">
              <CardHeader className="gap-1">
                <CardDescription>Refunded</CardDescription>
                <CardTitle className="text-lg">
                  {summary.refundedCount} <span className="text-sm font-normal text-muted-foreground">({summary.refundedTotal.toFixed(2)})</span>
                </CardTitle>
              </CardHeader>
            </Card>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardDescription>Daily trend</CardDescription>
          <CardTitle className="text-base font-medium">
            {trendRange === '7d' ? 'Last 7 days' : 'Last 30 days'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ReportsClient dailyData={dailyData} storeId={storeId} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Cash vs Mobile Money vs Card</CardDescription>
            <CardTitle className="text-base font-medium">How this period&apos;s sales were paid for</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentBreakdownChart {...summary.paymentBreakdown} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Peak hours</CardDescription>
            <CardTitle className="text-base font-medium">When sales actually happen</CardTitle>
          </CardHeader>
          <CardContent>
            <PeakHoursChart data={summary.byHour} />
          </CardContent>
        </Card>
      </div>

      <h2 className="text-lg font-medium">Top products</h2>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Units sold</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.topProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <EmptyState icon={BarChart3} title="No completed sales in this period" />
                </TableCell>
              </TableRow>
            ) : (
              summary.topProducts.map((p) => (
                <TableRow key={p.name}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-right">{p.quantity}</TableCell>
                  <TableCell className="text-right">{p.revenue.toFixed(2)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">By category</h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.byCategory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <EmptyState icon={BarChart3} title="No completed sales in this period" />
                    </TableCell>
                  </TableRow>
                ) : (
                  summary.byCategory.map((c) => (
                    <TableRow key={c.category}>
                      <TableCell>{c.category}</TableCell>
                      <TableCell className="text-right">{c.quantity}</TableCell>
                      <TableCell className="text-right">{c.revenue.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">By store</h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.byStore.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <EmptyState icon={BarChart3} title="No completed sales in this period" />
                    </TableCell>
                  </TableRow>
                ) : (
                  summary.byStore.map((s) => (
                    <TableRow key={s.store}>
                      <TableCell>{storeName.get(s.store) ?? `#${s.store}`}</TableCell>
                      <TableCell className="text-right">{s.orderCount}</TableCell>
                      <TableCell className="text-right">{s.revenue.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {summary.byCashier.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">By cashier</h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cashier</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.byCashier.map((c) => (
                  <TableRow key={c.cashier}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell className="text-right">{c.orderCount}</TableCell>
                    <TableCell className="text-right">{c.revenue.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
