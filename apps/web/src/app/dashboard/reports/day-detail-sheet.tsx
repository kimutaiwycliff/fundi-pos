'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, PackageX, ShoppingCart } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { PaymentBreakdownChart } from './payment-breakdown-chart';
import { ComparisonBadge } from './comparison-badge';

interface DaySummary {
  totalSales: number;
  orderCount: number;
  averageOrderValue: number;
  discountGivenTotal: number;
  profitTotal: number | null;
  paymentBreakdown: { cash: number; mpesa: number; card: number; credit: number };
  topProducts: Array<{ name: string; revenue: number; quantity: number }>;
  byCategory: Array<{ category: string; revenue: number; quantity: number }>;
  byCashier: Array<{ cashier: number; name: string; revenue: number; orderCount: number }>;
  voidedCount: number;
  voidedTotal: number;
  refundedCount: number;
  refundedTotal: number;
  comparison: { totalSales: number; orderCount: number; profitTotal: number | null } | null;
}

// Parsed from its own y/m/d components, never `new Date("YYYY-MM-DD")` -
// see daily-trend-chart.tsx's identical comment for why.
function formatLongDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Fetched on demand (not pre-loaded for every day in the range) - a click
// on the trend chart, or a date typed into the "jump to date" input, is
// the only thing that ever triggers this, so a 30-day view never pays for
// 30 days' worth of detail up front.
export function DayDetailSheet({
  date,
  storeId,
  onOpenChange,
}: {
  date: string | null;
  storeId?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!date) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null);
      return;
    }
    setLoading(true);
    setData(null);
    const qs = new URLSearchParams({ date });
    if (storeId) qs.set('store', storeId);
    let cancelled = false;
    fetch(`/api/payload/reports/sales-summary?${qs.toString()}`)
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, storeId]);

  return (
    <Sheet open={Boolean(date)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{date ? formatLongDate(date) : ''}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          {loading || !data ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : data.orderCount === 0 && data.voidedCount === 0 && data.refundedCount === 0 ? (
            <EmptyState icon={ShoppingCart} title="No sales this day" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardHeader className="gap-1">
                    <CardDescription>Sales</CardDescription>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      {data.totalSales.toFixed(2)}
                      <ComparisonBadge current={data.totalSales} previous={data.comparison?.totalSales ?? null} />
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="gap-1">
                    <CardDescription>Orders</CardDescription>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      {data.orderCount}
                      <ComparisonBadge current={data.orderCount} previous={data.comparison?.orderCount ?? null} />
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="gap-1">
                    <CardDescription>Avg order</CardDescription>
                    <CardTitle className="text-xl">{data.averageOrderValue.toFixed(2)}</CardTitle>
                  </CardHeader>
                </Card>
                {data.profitTotal != null ? (
                  <Card>
                    <CardHeader className="gap-1">
                      <CardDescription>Profit</CardDescription>
                      <CardTitle className="flex items-center gap-2 text-xl">
                        {data.profitTotal.toFixed(2)}
                        <ComparisonBadge current={data.profitTotal} previous={data.comparison?.profitTotal ?? null} />
                      </CardTitle>
                    </CardHeader>
                  </Card>
                ) : null}
              </div>

              {data.voidedCount + data.refundedCount > 0 ? (
                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <AlertTriangle className="size-4 shrink-0 text-destructive" />
                  <span>
                    {data.voidedCount > 0 ? `${data.voidedCount} voided (${data.voidedTotal.toFixed(2)})` : null}
                    {data.voidedCount > 0 && data.refundedCount > 0 ? ' · ' : null}
                    {data.refundedCount > 0 ? `${data.refundedCount} refunded (${data.refundedTotal.toFixed(2)})` : null}
                  </span>
                </div>
              ) : null}

              {data.discountGivenTotal > 0 ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{data.discountGivenTotal.toFixed(2)}</span> given in discounts
                </p>
              ) : null}

              <div>
                <p className="mb-2 text-sm font-medium">Payment mix</p>
                <PaymentBreakdownChart {...data.paymentBreakdown} />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Top products</p>
                {data.topProducts.length === 0 ? (
                  <EmptyState icon={PackageX} title="No products sold" className="py-3" />
                ) : (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {data.topProducts.slice(0, 6).map((p) => (
                      <li key={p.name} className="flex items-center justify-between">
                        <span className="truncate">{p.name}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {p.quantity} · {p.revenue.toFixed(0)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {data.byCategory.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-medium">By category</p>
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {data.byCategory.slice(0, 6).map((c) => (
                      <li key={c.category} className="flex items-center justify-between">
                        <span className="truncate">{c.category}</span>
                        <span className="shrink-0 text-muted-foreground">{c.revenue.toFixed(0)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {data.byCashier.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-medium">By cashier</p>
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {data.byCashier.map((c) => (
                      <li key={c.cashier} className="flex items-center justify-between">
                        <span className="truncate">{c.name}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {c.orderCount} · {c.revenue.toFixed(0)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
