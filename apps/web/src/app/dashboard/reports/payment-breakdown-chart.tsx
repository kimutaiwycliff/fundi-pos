'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

const config: ChartConfig = {
  cash: { label: 'Cash', color: 'var(--chart-1)' },
  mpesa: { label: 'M-Pesa', color: 'var(--chart-2)' },
  card: { label: 'Card', color: 'var(--chart-3)' },
};

// So an owner can glance at this and know how much cash SHOULD be in the
// till drawer vs how much landed in the M-Pesa/bank account - the two
// numbers get reconciled completely differently at end of day.
export function PaymentBreakdownChart({ cash, mpesa, card }: { cash: number; mpesa: number; card: number }) {
  const data = [
    { method: 'cash', amount: cash, fill: 'var(--color-cash)' },
    { method: 'mpesa', amount: mpesa, fill: 'var(--color-mpesa)' },
    { method: 'card', amount: card, fill: 'var(--color-card)' },
  ];

  return (
    <ChartContainer config={config} className="h-[200px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          dataKey="method"
          type="category"
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => config[value as keyof typeof config]?.label ?? value}
          width={56}
        />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="amount" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
