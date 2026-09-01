'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DailyTrendChart, type DailyPoint } from './daily-trend-chart';
import { DayDetailSheet } from './day-detail-sheet';

// Two ways to land on a specific day, one state: clicking a bar in the
// trend chart (any day already visible) and typing a date directly (any
// day at all, including ones outside the current chart window) both just
// set `selectedDate`, which the Sheet below reacts to.
export function ReportsClient({ dailyData, storeId }: { dailyData: DailyPoint[]; storeId?: string }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Click a bar - or pick a date below - for that day&apos;s full breakdown.</p>
        <div className="flex items-center gap-2">
          <Label htmlFor="jump-date" className="text-xs whitespace-nowrap text-muted-foreground">
            Jump to date
          </Label>
          <Input
            id="jump-date"
            type="date"
            max={today}
            className="w-40"
            onChange={(e) => {
              if (e.target.value) setSelectedDate(e.target.value);
            }}
          />
        </div>
      </div>
      <DailyTrendChart data={dailyData} onSelectDate={setSelectedDate} />
      <DayDetailSheet
        date={selectedDate}
        storeId={storeId}
        onOpenChange={(open) => {
          if (!open) setSelectedDate(null);
        }}
      />
    </>
  );
}
