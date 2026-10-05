'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Receipt, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { apiErrorMessage, formatDay, formatKES } from './format';
import { PAYMENT_METHOD_LABELS, recordedByName, type SubscriptionPayment } from './types';

function DeletePaymentButton({ payment }: { payment: SubscriptionPayment }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const response = await fetch(`/api/platform/subscription-payments/${payment.id}`, { method: 'DELETE' });
    setDeleting(false);
    if (!response.ok) {
      toast.error(await apiErrorMessage(response, 'Failed to delete the payment'));
      return;
    }
    toast.success(`Payment of ${formatKES(payment.amount)} deleted`, { description: 'Paid-until was recalculated.' });
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" disabled={deleting} aria-label={`Delete payment of ${formatKES(payment.amount)} on ${formatDay(payment.paidAt)}`}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
          <AlertDialogDescription>
            {formatKES(payment.amount)} via {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method} on {formatDay(payment.paidAt)}
            {payment.reference ? ` (${payment.reference})` : ''}. Use this for a payment recorded by mistake - the tenant&apos;s
            paid-until date is recalculated from the remaining payments, and the deletion is kept in the audit history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDelete}>
            Delete payment
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function PaymentHistory({ payments }: { payments: SubscriptionPayment[] }) {
  if (payments.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No payments recorded"
        description="When this tenant pays (M-Pesa, bank…), record it here - paid-until updates automatically."
      />
    );
  }
  const total = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  return (
    <>
      <ul className="flex flex-col divide-y sm:hidden">
        {payments.map((p) => (
          <li key={p.id} className="flex items-start justify-between gap-2 py-2.5 first:pt-0">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-semibold tabular-nums">{formatKES(p.amount)}</span>
              <span className="text-xs text-muted-foreground">
                {formatDay(p.paidAt)} · {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                {p.reference ? ` · ${p.reference}` : ''}
              </span>
              {p.periodEnd ? (
                <span className="text-xs text-muted-foreground">
                  Covers {p.periodStart ? `${formatDay(p.periodStart)} – ` : 'until '}
                  {formatDay(p.periodEnd)}
                </span>
              ) : null}
              {p.note ? <span className="text-xs text-muted-foreground italic">{p.note}</span> : null}
            </div>
            <DeletePaymentButton payment={p} />
          </li>
        ))}
        <li className="flex justify-between pt-2.5 text-sm font-medium">
          <span>Total paid ({payments.length})</span>
          <span className="tabular-nums">{formatKES(total)}</span>
        </li>
      </ul>

      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paid on</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="hidden lg:table-cell">Recorded by</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{formatDay(p.paidAt)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatKES(p.amount)}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
                    {p.reference ? <span className="font-mono text-xs text-muted-foreground">{p.reference}</span> : null}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.periodEnd ? (
                    <>
                      {p.periodStart ? `${formatDay(p.periodStart)} – ` : ''}
                      {formatDay(p.periodEnd)}
                    </>
                  ) : (
                    '—'
                  )}
                  {p.note ? <span className="block max-w-56 truncate text-xs italic" title={p.note}>{p.note}</span> : null}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{recordedByName(p)}</TableCell>
                <TableCell>
                  <DeletePaymentButton payment={p} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total ({payments.length})</TableCell>
              <TableCell className="text-right tabular-nums">{formatKES(total)}</TableCell>
              <TableCell colSpan={4} />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </>
  );
}
