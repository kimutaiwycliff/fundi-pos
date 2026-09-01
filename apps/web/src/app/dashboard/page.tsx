import Link from 'next/link';
import { AlertTriangle, ArrowRight, ShoppingCart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { formatTime } from '@/lib/format-date';
import { PaymentBreakdownChart } from './reports/payment-breakdown-chart';
import { ComparisonBadge } from './reports/comparison-badge';
import { MiniTrendChart } from './mini-trend-chart';

interface SalesSummary {
  totalSales: number;
  orderCount: number;
  averageOrderValue: number;
  profitTotal: number | null;
  paymentBreakdown: { cash: number; mpesa: number; card: number; credit: number };
  topProducts: Array<{ name: string; revenue: number; quantity: number }>;
  byStore: Array<{ store: number; revenue: number; orderCount: number }>;
  voidedCount: number;
  voidedTotal: number;
  refundedCount: number;
  refundedTotal: number;
  unpaidCreditCount: number;
  unpaidCreditTotal: number;
  comparison: { totalSales: number; orderCount: number; profitTotal: number | null } | null;
}
interface StockLevel {
  productName: string;
  quantity: number;
  reorderPoint: number;
  lowStock: boolean;
}
interface DailyPoint {
  date: string;
  totalSales: number;
}
type Store = { id: number; name: string };
type OrderRef = {
  id: string;
  createdAt: string;
  store: { id: number; name: string } | number;
  customer: { id: number; name: string } | number | null;
  total: number;
  tenderType: 'cash' | 'mpesa' | 'card' | 'credit';
  status: 'completed' | 'refunded' | 'voided';
};

const TENDER_LABELS: Record<OrderRef['tenderType'], string> = {
  cash: 'Cash',
  mpesa: 'M-Pesa',
  card: 'Card',
  credit: 'Credit',
};

export default async function DashboardOverviewPage() {
  const [today, { levels }, me, { days: last7 }, { docs: stores }, { docs: recentOrders }] = await Promise.all([
    payloadFetch<SalesSummary>('/api/reports/sales-summary?range=today'),
    payloadFetch<{ levels: StockLevel[] }>('/api/reports/stock-levels'),
    getCurrentUser(),
    payloadFetch<{ days: DailyPoint[] }>('/api/reports/sales-daily?range=7d'),
    payloadFetch<{ docs: Store[] }>('/api/stores?sort=name&limit=100'),
    payloadFetch<{ docs: OrderRef[] }>('/api/orders?sort=-createdAt&limit=6&depth=1'),
  ]);
  const canSeeProfit = me.role === 'owner';
  const lowStock = levels.filter((l) => l.lowStock);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const hasLossesToday = today.voidedCount + today.refundedCount > 0;
  const weekTotal = last7.reduce((sum, d) => sum + d.totalSales, 0);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <p className="text-sm text-muted-foreground">Today so far, across all stores.</p>

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${canSeeProfit ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Today&apos;s sales</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              {today.totalSales.toFixed(2)}
              <ComparisonBadge current={today.totalSales} previous={today.comparison?.totalSales ?? null} />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Orders today</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              {today.orderCount}
              <ComparisonBadge current={today.orderCount} previous={today.comparison?.orderCount ?? null} />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Average order</CardDescription>
            <CardTitle className="text-2xl">{today.averageOrderValue.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        {canSeeProfit ? (
          <Card>
            <CardHeader className="gap-1">
              <CardDescription>Today&apos;s profit</CardDescription>
              <CardTitle className="flex items-center gap-2 text-2xl">
                {(today.profitTotal ?? 0).toFixed(2)}
                <ComparisonBadge current={today.profitTotal ?? 0} previous={today.comparison?.profitTotal ?? null} />
              </CardTitle>
            </CardHeader>
          </Card>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/dashboard/sales">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader>
              <CardDescription>Unpaid credit</CardDescription>
              <CardTitle className="text-2xl">
                {today.unpaidCreditCount}
                {today.unpaidCreditCount > 0 ? (
                  <span className="ml-2 align-middle text-sm font-normal text-muted-foreground">
                    {today.unpaidCreditTotal.toFixed(2)} owed
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/dashboard/inventory">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader>
              <CardDescription>Low stock</CardDescription>
              <CardTitle className="text-2xl">
                {lowStock.length}
                {lowStock.length > 0 ? <Badge variant="destructive" className="ml-2 align-middle">Needs reorder</Badge> : null}
              </CardTitle>
            </CardHeader>
          </Card>
        </Link>
        {hasLossesToday ? (
          <Link href="/dashboard/sales">
            <Card className="h-full border-destructive/30 transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardDescription>Voided / refunded today</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  {today.voidedCount + today.refundedCount}
                  <span className="text-sm font-normal text-muted-foreground">
                    {(today.voidedTotal + today.refundedTotal).toFixed(2)}
                  </span>
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ) : null}
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
            <CardDescription>Last 7 days</CardDescription>
            <CardTitle className="text-base font-medium">{weekTotal.toFixed(2)} total</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <MiniTrendChart data={last7} />
            <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-sm text-primary underline underline-offset-2">
              View full report <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Top sellers today</CardDescription>
            <CardTitle className="text-base font-medium">What&apos;s moving right now</CardTitle>
          </CardHeader>
          <CardContent>
            {today.topProducts.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="No sales yet today" className="py-4" />
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

        <Card>
          <CardHeader>
            <CardDescription>Recent activity</CardDescription>
            <CardTitle className="text-base font-medium">Latest sales, as they happen</CardTitle>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="No sales yet" className="py-4" />
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {recentOrders.slice(0, 6).map((order) => {
                  const customerLabel =
                    typeof order.customer === 'object' && order.customer ? order.customer.name : 'Walk-in';
                  const storeLabel = typeof order.store === 'object' ? order.store.name : storeName.get(order.store);
                  return (
                    <li key={order.id} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate">{customerLabel}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">· {storeLabel}</span>
                        {order.status === 'voided' ? <Badge variant="destructive">Voided</Badge> : null}
                        {order.status === 'refunded' ? <Badge variant="outline">Refunded</Badge> : null}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {order.total.toFixed(0)} · {TENDER_LABELS[order.tenderType]} · {formatTime(order.createdAt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {stores.length > 1 && today.byStore.length > 0 ? (
        <Card>
          <CardHeader>
            <CardDescription>By branch</CardDescription>
            <CardTitle className="text-base font-medium">Today&apos;s sales per store</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {today.byStore.map((s) => (
                <li key={s.store} className="flex items-center justify-between">
                  <span>{storeName.get(s.store) ?? `Store #${s.store}`}</span>
                  <span className="text-muted-foreground">
                    {s.orderCount} order{s.orderCount === 1 ? '' : 's'} · {s.revenue.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {lowStock.length > 0 ? (
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" /> Reorder soon
            </CardDescription>
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
