'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ReceiptView } from '@/components/receipt/receipt-view';
import { printReceipt } from '@/components/receipt/print-receipt';
import type { ReceiptData } from '@/components/receipt/types';
import { toast } from 'sonner';
import type { TenantReceiptInfo } from './page';

export function CheckoutSuccessDialog({
  receipt,
  tenant,
  onClose,
}: {
  receipt: ReceiptData | null;
  tenant: TenantReceiptInfo;
  onClose: () => void;
}) {
  function handlePrint() {
    if (!receipt) return;
    const opened = printReceipt(receipt, tenant);
    if (!opened) toast.error('Please allow popups for this site to print receipts');
  }

  return (
    <Dialog
      open={receipt != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Sale complete</DialogTitle>
        </DialogHeader>
        {receipt ? <ReceiptView data={receipt} tenant={tenant} /> : null}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={handlePrint}>
            <Printer data-icon="inline-start" />
            Print receipt
          </Button>
          <Button type="button" onClick={onClose}>
            New sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
