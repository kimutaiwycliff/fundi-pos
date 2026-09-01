'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

export interface DailyPoint {
  date: string; // "YYYY-MM-DD", a Nairobi calendar date - see salesAggregate.ts
  totalSales: number;
  orderCount: number;
  voidedCount: number;
  refundedCount: number;
}

const config: ChartConfig = {
  totalSales: { label: 'Sales', color: 'var(--chart-1)' },
};

// Parsed from its own y/m/d components, never `new Date("YYYY-MM-DD")` -
// the latter parses as UTC midnight, which can print as the wrong day in a
// browser west of UTC. There's no time-of-day in this string to get wrong,
// only the calendar date itself.
function formatShortDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Each bar is a day - clicking one opens that day's full breakdown in the
// Sheet the Reports page renders (onSelectDate), the literal "click on any
// date and see analytics on that day" the user asked for.
export function DailyTrendChart({ data, onSelectDate }: { data: DailyPoint[]; onSelectDate: (date: string) => void }) {
  return (
    <ChartContainer config={config} className="h-[220px] w-full">
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickFormatter={formatShortDate}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis hide />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => (payload?.[0] ? formatShortDate(String(payload[0].payload.date)) : '')}
              formatter={(value, _name, item) => {
                const point = item.payload as DailyPoint;
                return (
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium tabular-nums">{Number(value).toFixed(2)}</span>
                    <span className="text-xs text-muted-foreground">
                      {point.orderCount} order{point.orderCount === 1 ? '' : 's'}
                      {point.voidedCount + point.refundedCount > 0
                        ? ` · ${point.voidedCount + point.refundedCount} voided/refunded`
                        : ''}
                    </span>
                  </div>
                );
              }}
            />
          }
        />
        <Bar
          dataKey="totalSales"
          radius={4}
          fill="var(--color-totalSales)"
          cursor="pointer"
          onClick={(point) => onSelectDate((point as unknown as DailyPoint).date)}
        />
      </BarChart>
    </ChartContainer>
  );
}
