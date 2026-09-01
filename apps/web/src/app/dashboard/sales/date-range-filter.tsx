'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

// Drives ?from=&to= URL params, same "the filtered view is a real,
// bookmarkable URL and the server re-fetches with it" convention as
// BranchFilter - necessary here specifically because the Sales page only
// ever loads the 200 most recent orders; a store doing real volume blows
// past that within a couple of weeks, so filtering to an older date has to
// happen server-side (a real query, not a client-side filter over
// whatever happened to already be loaded) or it would silently show
// nothing for a date that has real orders.
//
// from/to are local state, not read fresh from useSearchParams on every
// change - router.push doesn't commit synchronously, so setting both
// fields back-to-back (confirmed live: scripting both inputs' onChange in
// the same tick) had the second push read the first change's pre-navigation
// searchParams snapshot and silently drop it. Local state is always
// current for both fields regardless of whether the URL has caught up yet.
export function DateRangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(searchParams.get('from') ?? '');
  const [to, setTo] = useState(searchParams.get('to') ?? '');

  function push(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextFrom) params.set('from', nextFrom);
    else params.delete('from');
    if (nextTo) params.set('to', nextTo);
    else params.delete('to');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sales-from" className="text-xs text-muted-foreground">
          From
        </Label>
        <Input
          id="sales-from"
          type="date"
          className="w-40"
          value={from}
          max={to || undefined}
          onChange={(e) => {
            setFrom(e.target.value);
            push(e.target.value, to);
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sales-to" className="text-xs text-muted-foreground">
          To
        </Label>
        <Input
          id="sales-to"
          type="date"
          className="w-40"
          value={to}
          min={from || undefined}
          onChange={(e) => {
            setTo(e.target.value);
            push(from, e.target.value);
          }}
        />
      </div>
      {from || to ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setFrom('');
            setTo('');
            push('', '');
          }}
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}
