'use client';

import { Clock, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { EmptyState } from '@/components/empty-state';
import { formatTime } from '@/lib/format-date';
import type { HeldSale } from '@/lib/held-sales';

export function HeldSalesDrawer({ heldSales, onResume }: { heldSales: HeldSale[]; onResume: (held: HeldSale) => void }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="lg">
          <Clock data-icon="inline-start" />
          Held sales
          {heldSales.length > 0 ? (
            <span className="ml-1 flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {heldSales.length}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Held sales</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
          {heldSales.length === 0 ? (
            <EmptyState icon={Clock} title="No held sales" description="Sales you hold will appear here to resume later." />
          ) : (
            heldSales.map((held) => (
              <div key={held.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                <div className="text-sm">
                  <p className="font-medium">
                    {held.cart.length} item{held.cart.length === 1 ? '' : 's'}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatTime(held.createdAt)}</p>
                </div>
                <SheetClose asChild>
                  <Button type="button" size="sm" onClick={() => onResume(held)}>
                    <Undo2 data-icon="inline-start" />
                    Resume
                  </Button>
                </SheetClose>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
