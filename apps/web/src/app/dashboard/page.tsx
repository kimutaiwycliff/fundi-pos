import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { PaymentBreakdownChart } from './reports/payment-breakdown-chart';

interface SalesSummary {
  totalSales: number;
  orderCount: number;
  profitTotal: number | null;
  paymentBreakdown: { cash: number; mpesa: number; card: number; credit: number };
  topProducts: Array<{ name: string; revenue: number; quantity: number }>;
}
interface StockLevel {
  productName: string;
  quantity: number;
  reorderPoint: number;
  lowStock: boolean;
}

export default async function DashboardOverviewPage() {
  const [today, { levels }, me] = await Promise.all([
    payloadFetch<SalesSummary>('/api/reports/sales-summary?range=today'),
    payloadFetch<{ levels: StockLevel[] }>('/api/reports/stock-levels'),
    getCurrentUser(),
  ]);
  const canSeeProfit = me.role === 'owner';
  const lowStock = levels.filter((l) => l.lowStock);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <p className="text-sm text-muted-foreground">Today so far, across all stores.</p>

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${canSeeProfit ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <Card>
          <CardHeader>
            <CardDescription>Today&apos;s sales</CardDescription>
            <CardTitle className="text-2xl">{today.totalSales.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Orders today</CardDescription>
            <CardTitle className="text-2xl">{today.orderCount}</CardTitle>
          </CardHeader>
        </Card>
        {canSeeProfit ? (
          <Card>
            <CardHeader>
              <CardDescription>Today&apos;s profit</CardDescription>
              <CardTitle className="text-2xl">{(today.profitTotal ?? 0).toFixed(2)}</CardTitle>
            </CardHeader>
          </Card>
        ) : null}
        <Link href="/dashboard/inventory">
          <Card className="transition-colors hover:bg-muted/50">
            <CardHeader>
              <CardDescription>Low stock</CardDescription>
              <CardTitle className="text-2xl">
                {lowStock.length}
                {lowStock.length > 0 ? <Badge variant="destructive" className="ml-2 align-middle">Needs reorder</Badge> : null}
              </CardTitle>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Cash vs Mobile Money vs Card</CardDescription>
            <CardTitle className="text-base font-medium">Today&apos;s payment mix</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentBreakdownChart {...today.paymentBreakdown} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Top sellers today</CardDescription>
            <CardTitle className="text-base font-medium">What&apos;s moving right now</CardTitle>
          </CardHeader>
          <CardContent>
            {today.topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales yet today.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {today.topProducts.slice(0, 5).map((p) => (
                  <li key={p.name} className="flex items-center justify-between">
                    <span>{p.name}</span>
                    <span className="text-muted-foreground">
                      {p.quantity} sold · {p.revenue.toFixed(0)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {lowStock.length > 0 ? (
        <Card>
          <CardHeader>
            <CardDescription>Reorder soon</CardDescription>
            <CardTitle className="text-base font-medium">{lowStock.length} product(s) at or below their reorder point</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {lowStock.slice(0, 8).map((l, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span>{l.productName}</span>
                  <span className="text-muted-foreground">
                    {l.quantity} left (reorder at {l.reorderPoint})
                  </span>
                </li>
              ))}
            </ul>
            {lowStock.length > 8 ? (
              <Link href="/dashboard/inventory" className="mt-2 inline-block text-sm text-primary underline underline-offset-2">
                View all {lowStock.length} in Inventory
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
