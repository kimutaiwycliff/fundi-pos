'use client';

import { useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import { formatKES } from './format';

function dayLabel(day: string, long = false): string {
  // day is a Nairobi calendar date; noon UTC keeps it on the same date everywhere.
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    ...(long ? { weekday: 'short' } : {}),
    timeZone: 'Africa/Nairobi',
  });
}

const shortKes = (value: number) => (value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(Math.round(value)));

const salesConfig: ChartConfig = {
  revenue: { label: 'Sales', color: 'var(--chart-2)' },
  profit: { label: 'Est. profit', color: 'var(--chart-4)' },
};

// One tenant's daily sales (bars) and estimated profit (line), 30 or 90 days.
export function SalesProfitChart({ data }: { data: { day: string; revenue: number; profit: number }[] }) {
  const [range, setRange] = useState<30 | 90>(30);
  const shown = data.slice(-range);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end gap-1">
        {([30, 90] as const).map((r) => (
          <Button key={r} size="sm" variant={range === r ? 'secondary' : 'ghost'} onClick={() => setRange(r)}>
            {r} days
          </Button>
        ))}
      </div>
      <ChartContainer config={salesConfig} className="h-[240px] w-full">
        <ComposedChart data={shown} margin={{ left: 4, right: 4, top: 8 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(d: string) => dayLabel(d)} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={shortKes} />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => (payload?.[0] ? dayLabel(String(payload[0].payload.day), true) : '')}
                formatter={(value, name) => (
                  <span className="flex w-full justify-between gap-3">
                    <span className="text-muted-foreground">{salesConfig[String(name)]?.label}</span>
                    <span className="font-medium tabular-nums">{formatKES(Number(value))}</span>
                  </span>
                )}
              />
            }
          />
          <Bar dataKey="revenue" fill="var(--color-revenue)" radius={3} maxBarSize={18} />
          <Line dataKey="profit" stroke="var(--color-profit)" strokeWidth={2} dot={false} type="monotone" />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}

const platformConfig: ChartConfig = {
  revenue: { label: 'Sales through Fundi', color: 'var(--chart-2)' },
  activeTenants: { label: 'Shops in use', color: 'var(--chart-1)' },
};

// Portfolio: total daily sales (bars, left axis) and how many shops were
// used that day (line, right axis).
export function PlatformDailyChart({ data }: { data: { day: string; revenue: number; activeTenants: number }[] }) {
  if (data.every((d) => d.revenue === 0 && d.activeTenants === 0)) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No sales or sign-ins in the last 30 days.</p>;
  }
  return (
    <ChartContainer config={platformConfig} className="h-[220px] w-full">
      <ComposedChart data={data} margin={{ left: 4, right: 4, top: 8 }} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(d: string) => dayLabel(d)} minTickGap={24} />
        <YAxis yAxisId="kes" tickLine={false} axisLine={false} width={44} tickFormatter={shortKes} />
        <YAxis yAxisId="shops" orientation="right" tickLine={false} axisLine={false} width={28} allowDecimals={false} />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => (payload?.[0] ? dayLabel(String(payload[0].payload.day), true) : '')}
              formatter={(value, name) => (
                <span className="flex w-full justify-between gap-3">
                  <span className="text-muted-foreground">{platformConfig[String(name)]?.label}</span>
                  <span className="font-medium tabular-nums">{name === 'revenue' ? formatKES(Number(value)) : Number(value)}</span>
                </span>
              )}
            />
          }
        />
        <Bar yAxisId="kes" dataKey="revenue" fill="var(--color-revenue)" radius={3} maxBarSize={18} />
        <Line yAxisId="shops" dataKey="activeTenants" stroke="var(--color-activeTenants)" strokeWidth={2} dot={false} type="monotone" />
      </ComposedChart>
    </ChartContainer>
  );
}
