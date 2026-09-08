'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDateTime } from '@/lib/format-date';
import { clientFetch, errorMessageFrom } from '@/lib/client-fetch';
import type { CreditPayment, ManagerRef, Order } from './page';

const METHOD_LABEL: Record<CreditPayment['method'], string> = {
  cash: 'Cash',
  mpesa: 'M-Pesa',
  card: 'Card',
  other: 'Other',
};

function recordedByLabel(id: number, managers: ManagerRef[]) {
  const manager = managers.find((m) => String(m.id) === String(id));
  return manager ? manager.name || manager.email : `#${id}`;
}

// Most credit customers don't clear a tab in one visit - this replaces the
// old one-click "mark as settled" with a real installment form. The amount
// defaults to the full outstanding balance, so a single click still fully
// settles an order exactly like before; changing it down records a partial
// payment instead. Balance and history are both derived from the
// credit-payments ledger (paymentsByOrder, computed in page.tsx), never
// stored on the order itself.
export function CreditPaymentDialog({
  order,
  payments,
  managers,
  open,
  onOpenChange,
}: {
  order: Order;
  payments: CreditPayment[];
  managers: ManagerRef[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = Math.max(0, Math.round((order.total - amountPaid) * 100) / 100);

  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState<CreditPayment['method']>('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (next) {
      // Re-seed the default every time the dialog opens (not just on
      // first mount) so re-opening after a partial payment prefills the
      // new, smaller remaining balance rather than the stale original one.
      setAmount(String(balance));
      setMethod('cash');
      setNote('');
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter an amount greater than zero');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await clientFetch(`/api/payload/orders/${order.id}/record-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parsed, method, note: note.trim() || undefined }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = errorMessageFrom(body, 'Failed to record payment');
        setError(message);
        toast.error(message);
        return;
      }

      toast.success(parsed >= balance ? 'Sale fully settled' : 'Payment recorded');
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment — order #{order.id.slice(0, 8)}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <div>
            <div className="text-muted-foreground">Total</div>
            <div className="font-medium tabular-nums">{order.total.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Paid so far</div>
            <div className="font-medium tabular-nums">{amountPaid.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Balance</div>
            <div className="font-semibold tabular-nums">{balance.toFixed(2)}</div>
          </div>
        </div>

        {payments.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Label>Payment history</Label>
            <div className="max-h-40 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b last:border-b-0">
                      <td className="px-2.5 py-1.5 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(p.paidAt)}
                      </td>
                      <td className="px-2.5 py-1.5 text-muted-foreground">{METHOD_LABEL[p.method]}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground">{recordedByLabel(p.recordedBy, managers)}</td>
                      <td className="px-2.5 py-1.5 text-right font-medium tabular-nums">{p.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-amount">Amount</Label>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={balance}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-method">Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as CreditPayment['method'])}>
                <SelectTrigger id="payment-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(METHOD_LABEL) as CreditPayment['method'][]).map((m) => (
                    <SelectItem key={m} value={m}>
                      {METHOD_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-note">Note (optional)</Label>
            <Input id="payment-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? 'Recording…' : Number(amount) >= balance ? 'Record & settle in full' : 'Record payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
