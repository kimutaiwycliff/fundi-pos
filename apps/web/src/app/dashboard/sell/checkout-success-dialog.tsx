'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ReceiptView } from '@/components/receipt/receipt-view';
import { printReceipt } from '@/components/receipt/print-receipt';
import type { ReceiptData } from '@/components/receipt/types';
import { SendInvoiceButtons } from '@/components/invoice/send-invoice-buttons';
import { buildInvoiceText, invoiceSubject } from '@/lib/invoice-message';
import { toast } from 'sonner';
import type { CustomerRef, TenantReceiptInfo } from './page';

export function CheckoutSuccessDialog({
  receipt,
  customer,
  tenant,
  onClose,
}: {
  receipt: ReceiptData | null;
  customer: CustomerRef | null;
  tenant: TenantReceiptInfo;
  onClose: () => void;
}) {
  function handlePrint() {
    if (!receipt) return;
    const opened = printReceipt(receipt, tenant);
    if (!opened) toast.error('Please allow popups for this site to print receipts');
  }

  const invoiceData = receipt
    ? {
        orderId: receipt.orderId,
        createdAt: receipt.createdAt,
        customerName: customer?.name ?? receipt.customerLabel ?? 'Customer',
        lines: receipt.lines,
        total: receipt.total,
        isPaid: !receipt.isUnpaidCredit,
        settledAtLabel: receipt.settledAtLabel,
      }
    : null;

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
        {receipt?.tenderType === 'credit' && invoiceData ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">Send invoice to customer</p>
            <SendInvoiceButtons
              phone={customer?.phone ?? null}
              email={customer?.email ?? null}
              subject={invoiceSubject(invoiceData, tenant)}
              message={buildInvoiceText(invoiceData, tenant)}
              size="sm"
            />
          </div>
        ) : null}
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
