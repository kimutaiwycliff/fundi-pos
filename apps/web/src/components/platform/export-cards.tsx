'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const day = (offsetDays: number) => new Date(Date.now() + 3 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

const DATASETS = [
  {
    key: 'tenants',
    title: 'Tenants',
    description: 'One row per shop: billing state, plan, health and why, setup stage, last active, 30-day sales and profit, stock value, total paid.',
    ranged: false,
  },
  {
    key: 'sales',
    title: 'Sales lines',
    description: 'Every line of every sale across all shops in the date range - product, quantity, price, discount, payment method, channel and till.',
    ranged: true,
  },
  {
    key: 'payments',
    title: 'Subscription payments',
    description: 'Confirmed payments to Fundi POS in the date range, with the period each one covers.',
    ranged: true,
  },
] as const;

export function ExportCards() {
  const [from, setFrom] = useState(day(-29));
  const [to, setTo] = useState(day(0));
  const invalid = from > to;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {DATASETS.map((d) => {
        const href = `/api/platform/platform-export?dataset=${d.key}${d.ranged ? `&from=${from}&to=${to}` : ''}`;
        return (
          <Card key={d.key}>
            <CardHeader>
              <CardTitle>{d.title}</CardTitle>
              <CardDescription>{d.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {d.ranged ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${d.key}-from`}>From</Label>
                    <Input id={`${d.key}-from`} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${d.key}-to`}>To</Label>
                    <Input id={`${d.key}-to`} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">As of right now.</p>
              )}
              {d.ranged && invalid ? (
                <Button disabled className="w-fit">
                  <Download aria-hidden /> Download CSV
                </Button>
              ) : (
                <Button asChild className="w-fit">
                  <a href={href} download>
                    <Download aria-hidden /> Download CSV
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
