'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { nextBillingPeriod } from '@hardware-pos/business-logic';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  apiErrorMessage,
  dateInputToEndISO,
  dateInputToStartISO,
  formatDay,
  formatKES,
  toDateInput,
} from './format';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PayableTenant } from './types';

interface FormState {
  tenantId: string;
  amount: string;
  method: string;
  reference: string;
  paidAt: string;
  periodStart: string;
  periodEnd: string;
  note: string;
  // The exact instants the period was prefilled with - sent as-is when the
  // dates weren't touched, so a renewal continues from paidUntil to the
  // second instead of being rounded to a day boundary.
  prefillStartISO: string;
  prefillEndISO: string;
}

function initialState(tenant: PayableTenant | undefined): FormState {
  const today = toDateInput(new Date());
  if (!tenant) {
    return {
      tenantId: '',
      amount: '',
      method: 'mpesa',
      reference: '',
      paidAt: today,
      periodStart: '',
      periodEnd: '',
      note: '',
      prefillStartISO: '',
      prefillEndISO: '',
    };
  }
  const period = nextBillingPeriod(tenant.paidUntil, tenant.billingCycle);
  return {
    tenantId: String(tenant.id),
    amount: tenant.cyclePrice > 0 ? String(tenant.cyclePrice) : '',
    method: 'mpesa',
    reference: '',
    paidAt: today,
    periodStart: toDateInput(period.start),
    periodEnd: toDateInput(period.end),
    note: '',
    prefillStartISO: period.start.toISOString(),
    prefillEndISO: period.end.toISOString(),
  };
}

// One dialog for every "Record payment" entry point: fixed to one tenant
// (detail page, attention list) or with a tenant picker (payments ledger).
// The API recomputes the tenant's paidUntil from the payment's periodEnd
// and audit-logs it, so this only has to POST the payment itself.
export function RecordPaymentDialog({
  tenant,
  tenants,
  trigger,
}: {
  tenant?: PayableTenant;
  tenants?: PayableTenant[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(() => initialState(tenant));

  const selected = useMemo(
    () => tenant ?? tenants?.find((t) => String(t.id) === form.tenantId),
    [tenant, tenants, form.tenantId],
  );
  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));
  const periodInvalid = form.periodStart && form.periodEnd && form.periodEnd <= form.periodStart;

  function handleOpenChange(next: boolean) {
    if (next) setForm(initialState(tenant));
    setOpen(next);
  }

  function pickTenant(id: string) {
    const picked = tenants?.find((t) => String(t.id) === id);
    setForm(initialState(picked));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter the amount received');
      return;
    }
    if (periodInvalid) {
      toast.error('The period must end after it starts');
      return;
    }
    setSaving(true);

    const prefillStart = toDateInput(form.prefillStartISO || null);
    const prefillEnd = toDateInput(form.prefillEndISO || null);
    const today = toDateInput(new Date());
    const body: Record<string, unknown> = {
      tenant: selected.id,
      amount,
      method: form.method,
      reference: form.reference.trim() || undefined,
      // Today = right now; a back-dated payment = midday that Nairobi day.
      paidAt:
        form.paidAt === today || !form.paidAt
          ? new Date().toISOString()
          : new Date(new Date(dateInputToStartISO(form.paidAt)).getTime() + 12 * 60 * 60 * 1000).toISOString(),
      note: form.note.trim() || undefined,
    };
    if (form.periodStart) {
      body.periodStart = form.periodStart === prefillStart ? form.prefillStartISO : dateInputToStartISO(form.periodStart);
    }
    if (form.periodEnd) {
      body.periodEnd = form.periodEnd === prefillEnd ? form.prefillEndISO : dateInputToEndISO(form.periodEnd);
    }

    const response = await fetch('/api/platform/subscription-payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!response.ok) {
      toast.error(await apiErrorMessage(response, 'Failed to record the payment'));
      return;
    }
    toast.success(`${formatKES(amount)} recorded for ${selected.name}`, {
      description: form.periodEnd ? `Paid until ${formatDay(body.periodEnd as string)}` : undefined,
    });
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus aria-hidden /> Record payment
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {selected
              ? `${selected.name} · currently paid until ${selected.paidUntil ? formatDay(selected.paidUntil) : 'never'}. Paid-until moves to the end of this period automatically.`
              : 'Pick the tenant who paid. Paid-until is updated automatically.'}
          </DialogDescription>
        </DialogHeader>
        <form id="record-payment-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          {!tenant && tenants ? (
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="payment-tenant">Tenant</Label>
              <Select value={form.tenantId} onValueChange={pickTenant}>
                <SelectTrigger id="payment-tenant" className="w-full">
                  <SelectValue placeholder="Select a tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-amount">Amount (KES)</Label>
            <Input
              id="payment-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              required
              value={form.amount}
              onChange={(e) => set({ amount: e.target.value })}
              placeholder={selected && selected.cyclePrice > 0 ? String(selected.cyclePrice) : '0'}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-method">Method</Label>
            <Select value={form.method} onValueChange={(method) => set({ method })}>
              <SelectTrigger id="payment-method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-reference">Reference</Label>
            <Input
              id="payment-reference"
              value={form.reference}
              onChange={(e) => set({ reference: e.target.value.toUpperCase() })}
              placeholder={form.method === 'mpesa' ? 'e.g. QJK7ABC123' : 'Optional'}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-paid-at">Paid on</Label>
            <Input id="payment-paid-at" type="date" required value={form.paidAt} onChange={(e) => set({ paidAt: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-period-start">Covers from</Label>
            <Input
              id="payment-period-start"
              type="date"
              value={form.periodStart}
              onChange={(e) => set({ periodStart: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-period-end">Covers until</Label>
            <Input
              id="payment-period-end"
              type="date"
              value={form.periodEnd}
              aria-invalid={periodInvalid ? true : undefined}
              onChange={(e) => set({ periodEnd: e.target.value })}
            />
          </div>
          {periodInvalid ? (
            <p className="text-xs text-destructive sm:col-span-2">The period must end after it starts.</p>
          ) : (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Prefilled with the next {selected?.billingCycle ?? 'billing'} cycle, continuing from the current paid-until so
              paying early never loses days. Leave “Covers until” empty to let the server add one cycle.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="payment-note">Note</Label>
            <Textarea
              id="payment-note"
              rows={2}
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
              placeholder="Optional - e.g. paid by the shop manager"
            />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="record-payment-form" disabled={saving || !selected}>
            {saving ? 'Saving…' : `Record ${form.amount ? formatKES(Number(form.amount)) : 'payment'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
