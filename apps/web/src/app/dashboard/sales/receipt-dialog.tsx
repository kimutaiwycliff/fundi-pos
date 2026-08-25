'use client';

import { useState } from 'react';
import { Printer, Receipt as ReceiptIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { Order, TenantReceiptInfo } from './page';

function storeName(value: Order['store']) {
  return typeof value === 'object' ? value.name : `Store #${value}`;
}
function cashierLabel(value: Order['cashier']) {
  if (typeof value !== 'object') return `#${value}`;
  return value.name || value.email;
}
function customerLabel(value: Order['customer']) {
  if (!value) return null;
  return typeof value === 'object' ? value.name : `#${value}`;
}
function productLabel(value: Order['lineItems'][number]['product']) {
  return typeof value === 'object' ? value.name : `#${value}`;
}

const TENDER_LABEL: Record<Order['tenderType'], string> = {
  cash: 'Cash',
  mpesa: 'M-Pesa',
  card: 'Card',
  credit: 'Credit (pay later)',
};

// Derives the on-screen preview's banner state from the order - the print
// window (built separately in handlePrint below, as static HTML/CSS rather
// than React) recomputes the same two booleans from the same fields, so
// both views always agree.
function receiptBannerState(order: Order) {
  const isUnpaidCredit = order.tenderType === 'credit' && order.paymentStatus === 'pending';
  const isSettledCredit = order.tenderType === 'credit' && order.paymentStatus === 'paid' && Boolean(order.settledAt);
  const customer = customerLabel(order.customer);

  return { isUnpaidCredit, isSettledCredit, customer };
}

export function ReceiptDialog({ order, tenant }: { order: Order; tenant: TenantReceiptInfo }) {
  const [open, setOpen] = useState(false);
  const { isUnpaidCredit, isSettledCredit, customer } = receiptBannerState(order);

  function handlePrint() {
    const win = window.open('', '_blank', 'width=380,height=600');
    if (!win) {
      toast.error('Please allow popups for this site to print receipts');
      return;
    }

    const lineRows = order.lineItems
      .map((li) => {
        const lineTotal = li.quantity * li.unitPrice - li.discount;
        return `<div class="line"><span>${escapeHtml(productLabel(li.product))} x${li.quantity}</span><span>${lineTotal.toFixed(2)}</span></div>`;
      })
      .join('');

    const html = `<!doctype html>
<html>
<head>
<title>Receipt ${order.id.slice(0, 8)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Courier New", Courier, monospace;
    width: 280px;
    margin: 0 auto;
    padding: 12px;
    font-size: 12px;
    color: #000;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .divider { border-top: 1px dashed #000; margin: 8px 0; }
  .line { display: flex; justify-content: space-between; gap: 8px; }
  .banner {
    border: 2px solid #b45309;
    color: #b45309;
    padding: 6px;
    text-align: center;
    font-weight: bold;
    margin: 8px 0;
  }
  .settled { text-align: center; color: #555; margin: 8px 0; }
  .totals .line { margin-top: 2px; }
  .totals .grand { font-weight: bold; font-size: 13px; }
  .footer { margin-top: 10px; white-space: pre-wrap; text-align: center; }
  @media print {
    body { width: 100%; }
  }
</style>
</head>
<body>
  <div class="center bold">${escapeHtml(tenant.name)}</div>
  ${tenant.receiptHeader ? `<div class="center">${escapeHtml(tenant.receiptHeader)}</div>` : ''}
  <div class="divider"></div>
  <div class="line"><span>Order #${order.id.slice(0, 8)}</span><span>${new Date(order.createdAt).toLocaleString()}</span></div>
  <div class="line"><span>Cashier</span><span>${escapeHtml(cashierLabel(order.cashier))}</span></div>
  ${customer ? `<div class="line"><span>Customer</span><span>${escapeHtml(customer)}</span></div>` : ''}
  <div class="divider"></div>
  ${lineRows}
  <div class="divider"></div>
  ${
    isUnpaidCredit
      ? '<div class="banner">UNPAID &mdash; pay on settlement</div>'
      : isSettledCredit
        ? `<div class="settled">Settled ${new Date(order.settledAt as string).toLocaleDateString()}</div>`
        : ''
  }
  <div class="totals">
    <div class="line"><span>Tax</span><span>${order.taxTotal.toFixed(2)}</span></div>
    ${order.discountTotal > 0 ? `<div class="line"><span>Discount</span><span>-${order.discountTotal.toFixed(2)}</span></div>` : ''}
    <div class="line grand"><span>Total</span><span>${order.total.toFixed(2)}</span></div>
    <div class="line"><span>Tender</span><span>${TENDER_LABEL[order.tenderType]}</span></div>
  </div>
  ${tenant.receiptFooter ? `<div class="footer">${escapeHtml(tenant.receiptFooter)}</div>` : ''}
</body>
</html>`;

    win.document.open();
    win.document.write(html);
    win.document.close();

    // The print dialog needs the document fully painted first - onload
    // fires once the write()'d document (and its inline styles) settle,
    // which is more reliable here than calling print() immediately.
    win.onload = () => {
      win.focus();
      win.print();
    };
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ReceiptIcon data-icon="inline-start" />
          Receipt
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Receipt</DialogTitle>
        </DialogHeader>
        <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
          <p className="text-center font-bold">{tenant.name}</p>
          {tenant.receiptHeader ? <p className="text-center whitespace-pre-wrap">{tenant.receiptHeader}</p> : null}
          <div className="my-2 border-t border-dashed" />
          <p>
            Order #{order.id.slice(0, 8)} · {new Date(order.createdAt).toLocaleString()}
          </p>
          <p>Cashier: {cashierLabel(order.cashier)}</p>
          {customer ? <p>Customer: {customer}</p> : null}
          <div className="my-2 border-t border-dashed" />
          {order.lineItems.map((li, idx) => {
            const lineTotal = li.quantity * li.unitPrice - li.discount;
            return (
              <div key={idx} className="flex justify-between gap-2">
                <span className="truncate">
                  {productLabel(li.product)} x{li.quantity}
                </span>
                <span className="shrink-0">{lineTotal.toFixed(2)}</span>
              </div>
            );
          })}
          <div className="my-2 border-t border-dashed" />
          {isUnpaidCredit ? (
            <p className="mb-2 rounded border border-destructive/40 bg-destructive/10 p-1.5 text-center font-bold text-destructive">
              UNPAID — pay on settlement
            </p>
          ) : isSettledCredit ? (
            <p className="mb-2 text-center text-muted-foreground">
              Settled {new Date(order.settledAt as string).toLocaleDateString()}
            </p>
          ) : null}
          <div className="flex justify-between">
            <span>Tax</span>
            <span>{order.taxTotal.toFixed(2)}</span>
          </div>
          {order.discountTotal > 0 ? (
            <div className="flex justify-between">
              <span>Discount</span>
              <span>-{order.discountTotal.toFixed(2)}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span>{order.total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tender</span>
            <span>{TENDER_LABEL[order.tenderType]}</span>
          </div>
          {tenant.receiptFooter ? (
            <>
              <div className="my-2 border-t border-dashed" />
              <p className="text-center whitespace-pre-wrap">{tenant.receiptFooter}</p>
            </>
          ) : null}
        </div>
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
