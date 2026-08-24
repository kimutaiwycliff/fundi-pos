import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { PaymentBreakdownChart } from './payment-breakdown-chart';

interface SalesSummary {
  totalSales: number;
  totalTax: number;
  orderCount: number;
  profitTotal: number | null;
  paymentBreakdown: { cash: number; mpesa: number; card: number };
  topProducts: Array<{ name: string; revenue: number; quantity: number }>;
  byStore: Array<{ store: number; revenue: number }>;
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
  searchParams: Promise<{ range?: string }>;
}) {
  const range = (await searchParams).range ?? 'today';
  const [summary, { docs: stores }, me] = await Promise.all([
    payloadFetch<SalesSummary>(`/api/reports/sales-summary?range=${range}`),
    payloadFetch<{ docs: Store[] }>('/api/stores?sort=name&limit=100'),
    getCurrentUser(),
  ]);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const canSeeProfit = me.role === 'owner';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Sales &amp; margin</h1>
        <div className="flex gap-1 rounded-md border p-1">
          {RANGES.map((r) => (
            <Link key={r.value} href={`?range=${r.value}`}>
              <Badge variant={range === r.value ? 'default' : 'outline'} className="cursor-pointer">
                {r.label}
              </Badge>
            </Link>
          ))}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${canSeeProfit ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <Card>
          <CardHeader>
            <CardDescription>Total sales</CardDescription>
            <CardTitle className="text-2xl">{summary.totalSales.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Orders</CardDescription>
            <CardTitle className="text-2xl">{summary.orderCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Tax collected</CardDescription>
            <CardTitle className="text-2xl">{summary.totalTax.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        {canSeeProfit ? (
          <Card>
            <CardHeader>
              <CardDescription>Profit</CardDescription>
              <CardTitle className="text-2xl">{(summary.profitTotal ?? 0).toFixed(2)}</CardTitle>
            </CardHeader>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardDescription>Cash vs Mobile Money vs Card</CardDescription>
          <CardTitle className="text-base font-medium">How this period&apos;s sales were paid for</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentBreakdownChart {...summary.paymentBreakdown} />
        </CardContent>
      </Card>

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
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No completed sales in this period.
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

      <h2 className="text-lg font-medium">By store</h2>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Store</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.byStore.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  No completed sales in this period.
                </TableCell>
              </TableRow>
            ) : (
              summary.byStore.map((s) => (
                <TableRow key={s.store}>
                  <TableCell>{storeName.get(s.store) ?? `#${s.store}`}</TableCell>
                  <TableCell className="text-right">{s.revenue.toFixed(2)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
