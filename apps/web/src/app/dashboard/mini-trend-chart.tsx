'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';

interface MiniTrendPoint {
  date: string;
  totalSales: number;
}

// Deliberately not the full reports/daily-trend-chart.tsx - no axes, no
// click-to-drill-down, just the SHAPE of the last 7 days at a glance next
// to today's headline number ("is today normal, or an outlier?"). Anyone
// who wants the full interactive version already has Reports for that.
export function MiniTrendChart({ data }: { data: MiniTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={56}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="mini-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          cursor={false}
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const point = payload[0].payload as MiniTrendPoint;
            const [year, month, day] = point.date.split('-').map(Number);
            const label = new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            return (
              <div className="rounded-md border bg-popover px-2 py-1 text-xs shadow-md">
                <span className="font-medium">{label}</span> · {point.totalSales.toFixed(0)}
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="totalSales"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#mini-trend-fill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
