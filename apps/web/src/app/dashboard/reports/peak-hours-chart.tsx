'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

export interface HourPoint {
  hour: number; // 0-23, Nairobi wall-clock hour - see salesAggregate.ts
  revenue: number;
  orderCount: number;
}

const config: ChartConfig = {
  revenue: { label: 'Revenue', color: 'var(--chart-3)' },
};

function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

// Which hours of the day actually sell - the same shape as the daily
// trend chart but bucketed by hour instead of by day, for staffing/opening-
// hours decisions ("do we actually need to be open past 7pm?") rather than
// day-to-day performance tracking.
export function PeakHoursChart({ data }: { data: HourPoint[] }) {
  return (
    <ChartContainer config={config} className="h-[200px] w-full">
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="hour"
          tickLine={false}
          axisLine={false}
          tickFormatter={formatHour}
          interval={3}
        />
        <YAxis hide />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => (payload?.[0] ? formatHour(Number(payload[0].payload.hour)) : '')}
              formatter={(value, _name, item) => {
                const point = item.payload as HourPoint;
                return (
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium tabular-nums">{Number(value).toFixed(2)}</span>
                    <span className="text-xs text-muted-foreground">
                      {point.orderCount} order{point.orderCount === 1 ? '' : 's'}
                    </span>
                  </div>
                );
              }}
            />
          }
        />
        <Bar dataKey="revenue" radius={4} fill="var(--color-revenue)" />
      </BarChart>
    </ChartContainer>
  );
}
