'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { formatKES, formatMonthKey } from './format';

const config: ChartConfig = {
  amount: { label: 'Collected', color: 'var(--chart-2)' },
};

// Subscription money received per Nairobi calendar month, oldest first.
// A round axis maximum (1-2-5 steps) so the ticks read 0 / 1k / 2k... not 950.
function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

export function CollectionsChart({ data }: { data: { month: string; amount: number }[] }) {
  const ticks = niceTicks(Math.max(...data.map((d) => d.amount), 0));
  return (
    <ChartContainer config={config} className="h-[220px] w-full">
      <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickFormatter={(key: string) => formatMonthKey(key, true)}
          interval="preserveStartEnd"
          minTickGap={12}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          ticks={ticks}
          domain={[0, ticks[ticks.length - 1]]}
          tickFormatter={(value: number) => (value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(value))}
        />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => (payload?.[0] ? formatMonthKey(String(payload[0].payload.month)) : '')}
              formatter={(value) => <span className="font-medium tabular-nums">{formatKES(Number(value))}</span>}
            />
          }
        />
        <Bar dataKey="amount" radius={4} fill="var(--color-amount)" maxBarSize={36} />
      </BarChart>
    </ChartContainer>
  );
}
