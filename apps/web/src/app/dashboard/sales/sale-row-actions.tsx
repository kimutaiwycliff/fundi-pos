'use client';

import { useState } from 'react';
import { CreditCard, Mail, MessageCircle, MoreHorizontal, Receipt as ReceiptIcon, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buildInvoiceText, invoiceSubject, mailtoInvoiceHref, whatsappInvoiceHref } from '@/lib/invoice-message';
import type { InvoiceData } from '@/lib/invoice-message';
import type { CreditPayment, ManagerRef, Order, TenantReceiptInfo } from './page';
import { ReceiptDialog } from './receipt-dialog';
import { VoidOrderDialog } from './void-order-dialog';
import { CreditPaymentDialog } from './credit-payment-dialog';

// One "..." menu per row instead of a growing row of buttons - which of
// these actions even apply varies a lot per order (credit vs cash, settled
// vs not, voided vs completed), so a static row either shows a lot of
// disabled buttons or reflows unpredictably row to row. A menu holds that
// variability without either problem.
export function SaleRowActions({
  order,
  tenant,
  managers,
  canSettle,
  contact,
  invoiceData,
  payments,
}: {
  order: Order;
  tenant: TenantReceiptInfo;
  managers: ManagerRef[];
  canSettle: boolean;
  contact: { phone: string | null; email: string | null };
  invoiceData: InvoiceData;
  payments: CreditPayment[];
}) {
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const canShowSettle =
    canSettle && order.tenderType === 'credit' && order.paymentStatus === 'pending' && order.status === 'completed';
  const canShowVoid = order.status === 'completed';
  const canShowInvoice = order.tenderType === 'credit' && order.status === 'completed';
  const invoiceMessage = canShowInvoice ? buildInvoiceText(invoiceData, tenant) : '';
  const invoiceSubjectLine = canShowInvoice ? invoiceSubject(invoiceData, tenant) : '';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Order actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setReceiptOpen(true)}>
            <ReceiptIcon data-icon="inline-start" />
            View receipt
          </DropdownMenuItem>
          {canShowInvoice ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!contact.phone} asChild={Boolean(contact.phone)}>
                {contact.phone ? (
                  <a
                    href={whatsappInvoiceHref(contact.phone, invoiceMessage)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle data-icon="inline-start" />
                    Send invoice via WhatsApp
                  </a>
                ) : (
                  <span>
                    <MessageCircle data-icon="inline-start" />
                    Send invoice via WhatsApp
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!contact.email} asChild={Boolean(contact.email)}>
                {contact.email ? (
                  <a href={mailtoInvoiceHref(contact.email, invoiceSubjectLine, invoiceMessage)}>
                    <Mail data-icon="inline-start" />
                    Send invoice via email
                  </a>
                ) : (
                  <span>
                    <Mail data-icon="inline-start" />
                    Send invoice via email
                  </span>
                )}
              </DropdownMenuItem>
            </>
          ) : null}
          {canShowVoid || canShowSettle ? <DropdownMenuSeparator /> : null}
          {canShowSettle ? (
            <DropdownMenuItem onSelect={() => setPaymentOpen(true)}>
              <CreditCard data-icon="inline-start" />
              Record payment
            </DropdownMenuItem>
          ) : null}
          {canShowVoid ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setVoidOpen(true)}>
              <ShieldAlert data-icon="inline-start" />
              Void / refund
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ReceiptDialog order={order} tenant={tenant} open={receiptOpen} onOpenChange={setReceiptOpen} />
      {canShowVoid ? (
        <VoidOrderDialog order={order} managers={managers} open={voidOpen} onOpenChange={setVoidOpen} />
      ) : null}
      {canShowSettle ? (
        <CreditPaymentDialog
          order={order}
          payments={payments}
          managers={managers}
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
        />
      ) : null}
    </>
  );
}
