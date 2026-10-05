import Link from 'next/link';
import { Megaphone, PackageX, Tag, Users } from 'lucide-react';
import { customerSourceLabel, salesChannelLabel } from '@hardware-pos/business-logic';
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
import { cn } from '@/lib/utils';
import { SalesChannelChart } from './sales-channel-chart';

export interface ChannelRow {
  channel: string;
  revenue: number;
  orderCount: number;
}
export interface PromoRow {
  code: string;
  revenue: number;
  orderCount: number;
  discount: number;
}
export interface SourceRow {
  source: string;
  count: number;
}
export interface SlowMoverItem {
  product: number;
  name: string;
  category: string;
  quantity: number;
  lastSoldAt: string | null;
  daysSinceLastSale: number | null;
  retailValue: number;
  costValue: number | null;
}
export interface SlowMovers {
  days: number;
  items: SlowMoverItem[];
  totalRetailValue: number;
  totalCostValue: number | null;
}

export const SLOW_DAYS = [30, 60, 90] as const;

function kes(n: number): string {
  return `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

function sourceLabel(source: string): string {
  return !source || source === 'unknown' ? 'Not recorded' : customerSourceLabel(source);
}

export function SalesByChannelCard({ rows }: { rows: ChannelRow[] }) {
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  const total = sorted.reduce((sum, r) => sum + r.revenue, 0);
  return (
    <Card>
      <CardHeader>
        <CardDescription>Sales by channel</CardDescription>
        <CardTitle className="text-base font-medium">Which platform brings in the sales</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sorted.length === 0 ? (
          <EmptyState icon={Megaphone} title="No completed sales in this period" />
        ) : (
          <>
            <SalesChannelChart
              data={sorted.map((r) => ({ label: salesChannelLabel(r.channel), revenue: r.revenue, orderCount: r.orderCount }))}
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => (
                  <TableRow key={r.channel}>
                    <TableCell>{salesChannelLabel(r.channel)}</TableCell>
                    <TableCell className="text-right">{r.orderCount}</TableCell>
                    <TableCell className="text-right">{r.revenue.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {total > 0 ? `${Math.round((r.revenue / total) * 100)}%` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function NewCustomersBySourceCard({ total, rows }: { total: number; rows: SourceRow[] }) {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const max = sorted.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardDescription>New customers by source - &quot;How did you hear about us?&quot;</CardDescription>
        <CardTitle className="text-2xl">
          {total} <span className="text-sm font-normal text-muted-foreground">new customer{total === 1 ? '' : 's'}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <EmptyState icon={Users} title="No new customers in this period" />
        ) : (
          <ul className="flex flex-col gap-3">
            {sorted.map((r) => (
              <li key={r.source} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{sourceLabel(r.source)}</span>
                  <span className="font-medium tabular-nums">{r.count}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[var(--chart-1)]"
                    style={{ width: `${max > 0 ? (r.count / max) * 100 : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function PromoCodesCard({
  rows,
  promoDiscountTotal,
  loyaltyDiscountTotal,
  promoEnabled,
}: {
  rows: PromoRow[];
  promoDiscountTotal: number;
  loyaltyDiscountTotal: number;
  // Sell Online add-on. Without it this card must not even hint that promo
  // codes exist - it shrinks to the loyalty figure (an every-plan feature).
  promoEnabled: boolean;
}) {
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  if (!promoEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardDescription>Loyalty</CardDescription>
          <CardTitle className="text-base font-medium">Points customers spent at the till</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loyalty points redeemed (KES)</p>
          <p className="text-xl font-semibold">{loyaltyDiscountTotal.toFixed(2)}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardDescription>Promo codes</CardDescription>
        <CardTitle className="text-base font-medium">Which promotions actually brought in sales</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Promo discounts given</p>
            <p className="text-xl font-semibold">{promoDiscountTotal.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Loyalty points redeemed</p>
            <p className="text-xl font-semibold">{loyaltyDiscountTotal.toFixed(2)}</p>
          </div>
        </div>
        {sorted.length === 0 ? (
          <EmptyState icon={Tag} title="No promo codes used in this period" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Discount given</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((p) => (
                <TableRow key={p.code}>
                  <TableCell className="font-mono">{p.code}</TableCell>
                  <TableCell className="text-right">{p.orderCount}</TableCell>
                  <TableCell className="text-right">{p.revenue.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{p.discount.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function SlowMoversCard({
  data,
  slowDays,
  hrefForDays,
}: {
  data: SlowMovers;
  slowDays: number;
  hrefForDays: (days: number) => string;
}) {
  const top = data.items.slice(0, 10);
  const showCost = data.totalCostValue !== null && data.items.some((i) => i.costValue !== null);
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardDescription>Slow-moving stock</CardDescription>
          <CardTitle className="text-base font-medium">
            {data.items.length > 0
              ? `${kes(data.totalRetailValue)} tied up in ${data.items.length} product${data.items.length === 1 ? '' : 's'}`
              : `Nothing sitting unsold for ${slowDays}+ days`}
          </CardTitle>
          {showCost ? (
            <p className="text-sm text-muted-foreground">{kes(data.totalCostValue ?? 0)} at cost</p>
          ) : null}
        </div>
        <div className="flex gap-1 rounded-md border p-1">
          {SLOW_DAYS.map((d) => (
            <Link
              key={d}
              href={hrefForDays(d)}
              className={cn(buttonVariants({ variant: slowDays === d ? 'default' : 'ghost', size: 'sm' }))}
            >
              {d} days
            </Link>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {top.length === 0 ? (
          <EmptyState icon={PackageX} title={`Every product in stock has sold in the last ${slowDays} days`} />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              In stock but not sold in {slowDays}+ days. Bundle these or run a &apos;last pieces&apos; sale.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty on hand</TableHead>
                  <TableHead className="text-right">Last sold</TableHead>
                  <TableHead className="text-right">Retail value</TableHead>
                  {showCost ? <TableHead className="text-right">Cost value</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {top.map((i) => (
                  <TableRow key={i.product}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{i.name}</span>
                        <span className="text-xs text-muted-foreground">{i.category}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{i.quantity}</TableCell>
                    <TableCell className="text-right">
                      {i.daysSinceLastSale === null ? 'Never' : `${i.daysSinceLastSale} days ago`}
                    </TableCell>
                    <TableCell className="text-right">{i.retailValue.toFixed(2)}</TableCell>
                    {showCost ? (
                      <TableCell className="text-right">{i.costValue === null ? '-' : i.costValue.toFixed(2)}</TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data.items.length > top.length ? (
              <p className="text-xs text-muted-foreground">
                Showing the top {top.length} of {data.items.length} by retail value.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
