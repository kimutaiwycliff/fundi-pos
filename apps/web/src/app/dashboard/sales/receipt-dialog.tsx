'use client';

import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ReceiptView } from '@/components/receipt/receipt-view';
import { printReceipt } from '@/components/receipt/print-receipt';
import type { ReceiptData } from '@/components/receipt/types';
import type { Order, TenantReceiptInfo } from './page';

function cashierLabel(value: Order['cashier']) {
  if (typeof value !== 'object') return `#${value}`;
  return value.name || value.email;
}
function customerLabel(value: Order['customer']) {
  if (!value) return null;
  return typeof value === 'object' ? value.name : `#${value}`;
}
function productLabel(value: Order['lineItems'][number]['product']) {
  // `typeof null === 'object'` - a line item whose product has since been
  // deleted populates as null, not the numeric id, so the null check must
  // come first or this throws reading `.name` off null.
  if (!value) return 'Deleted product';
  return typeof value === 'object' ? value.name : `#${value}`;
}

function toReceiptData(order: Order): ReceiptData {
  const isUnpaidCredit = order.tenderType === 'credit' && order.paymentStatus === 'pending';
  const isSettledCredit = order.tenderType === 'credit' && order.paymentStatus === 'paid' && Boolean(order.settledAt);

  return {
    orderId: order.id,
    createdAt: order.createdAt,
    cashierLabel: cashierLabel(order.cashier),
    customerLabel: customerLabel(order.customer),
    lines: order.lineItems.map((li) => ({
      label: productLabel(li.product),
      quantity: li.quantity,
      lineTotal: li.quantity * li.unitPrice - li.discount,
    })),
    taxTotal: order.taxTotal,
    discountTotal: order.discountTotal,
    total: order.total,
    tenderType: order.tenderType,
    isUnpaidCredit,
    isSettledCredit,
    settledAtLabel: order.settledAt ? new Date(order.settledAt).toLocaleDateString() : null,
  };
}

export function ReceiptDialog({
  order,
  tenant,
  open,
  onOpenChange,
}: {
  order: Order;
  tenant: TenantReceiptInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const data = toReceiptData(order);

  function handlePrint() {
    const opened = printReceipt(data, tenant);
    if (!opened) {
      toast.error('Please allow popups for this site to print receipts');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Receipt</DialogTitle>
        </DialogHeader>
        <ReceiptView data={data} tenant={tenant} />
        <DialogFooter>
          <Button type="button" onClick={handlePrint}>
            <Printer data-icon="inline-start" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
