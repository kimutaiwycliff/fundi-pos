'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

export interface ChannelPoint {
  label: string;
  revenue: number;
  orderCount: number;
}

const config: ChartConfig = {
  revenue: { label: 'Revenue', color: 'var(--chart-2)' },
};

// "Which platform actually brings in sales?" - revenue per sales channel
// (walk-in, WhatsApp, TikTok...), already sorted and labelled by the page.
export function SalesChannelChart({ data }: { data: ChannelPoint[] }) {
  return (
    <ChartContainer config={config} className="w-full" style={{ height: Math.max(120, data.length * 36) }}>
      <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" hide />
        <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={96} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
