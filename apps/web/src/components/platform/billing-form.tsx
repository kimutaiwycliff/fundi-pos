'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { BILLING_CYCLES, cyclePrice, TIER_LIST_PRICE } from '@hardware-pos/business-logic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { apiErrorMessage, dateInputToEndISO, formatKES, titleCase, toDateInput } from './format';
import { BILLING_STATUSES, CYCLE_LABELS, SUBSCRIPTION_TIERS } from './types';

export interface BillingFields {
  subscriptionTier: string;
  billingStatus: string;
  billingCycle?: string | null;
  planPrice?: number | null;
  paidUntil?: string | null;
  trialEndsAt?: string | null;
  billingContactName?: string | null;
  billingContactPhone?: string | null;
  billingContactEmail?: string | null;
}

function initial(t: BillingFields) {
  return {
    subscriptionTier: t.subscriptionTier,
    billingStatus: t.billingStatus,
    billingCycle: t.billingCycle ?? 'monthly',
    planPrice: t.planPrice != null ? String(t.planPrice) : '',
    paidUntil: toDateInput(t.paidUntil),
    trialEndsAt: toDateInput(t.trialEndsAt),
    billingContactName: t.billingContactName ?? '',
    billingContactPhone: t.billingContactPhone ?? '',
    billingContactEmail: t.billingContactEmail ?? '',
  };
}

// Everything about how a tenant is billed, saved in one PATCH (replaces the
// old tier + billing-status-only form). Tenants.ts audit-logs the change.
export function BillingForm({ tenantId, tenant }: { tenantId: number; tenant: BillingFields }) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => initial(tenant));
  const [form, setForm] = useState(saved);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== saved[k]);
  const paidUntilChanged = form.paidUntil !== saved.paidUntil;
  const listPrice = cyclePrice(null, form.billingCycle, form.subscriptionTier);
  const effective = form.planPrice ? Number(form.planPrice) : listPrice;

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (form.planPrice && (!Number.isFinite(Number(form.planPrice)) || Number(form.planPrice) < 0)) {
      toast.error('Plan price must be a positive number');
      return;
    }
    setSaving(true);
    const body: Record<string, unknown> = {
      subscriptionTier: form.subscriptionTier,
      billingStatus: form.billingStatus,
      billingCycle: form.billingCycle,
      planPrice: form.planPrice ? Number(form.planPrice) : null,
      trialEndsAt: form.trialEndsAt ? dateInputToEndISO(form.trialEndsAt) : null,
      billingContactName: form.billingContactName.trim() || null,
      billingContactPhone: form.billingContactPhone.trim() || null,
      billingContactEmail: form.billingContactEmail.trim() || null,
    };
    // Only touch paidUntil when the admin deliberately overrode it, so a
    // save never clobbers the exact instant payments computed.
    if (paidUntilChanged) body.paidUntil = form.paidUntil ? dateInputToEndISO(form.paidUntil) : null;
    if (form.trialEndsAt === saved.trialEndsAt) delete body.trialEndsAt;

    const response = await fetch(`/api/platform/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!response.ok) {
      toast.error(await apiErrorMessage(response, 'Failed to update billing'));
      return;
    }
    toast.success('Billing details saved');
    setSaved(form);
    router.refresh();
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="billing-tier">Subscription tier</Label>
          <Select value={form.subscriptionTier} onValueChange={(subscriptionTier) => set({ subscriptionTier })}>
            <SelectTrigger id="billing-tier" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBSCRIPTION_TIERS.map((tier) => (
                <SelectItem key={tier} value={tier}>
                  {titleCase(tier)}
                  {TIER_LIST_PRICE[tier] ? ` · ${formatKES(TIER_LIST_PRICE[tier])}/mo` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="billing-status">Billing status</Label>
          <Select value={form.billingStatus} onValueChange={(billingStatus) => set({ billingStatus })}>
            <SelectTrigger id="billing-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BILLING_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {titleCase(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="billing-cycle">Billing cycle</Label>
          <Select value={form.billingCycle} onValueChange={(billingCycle) => set({ billingCycle })}>
            <SelectTrigger id="billing-cycle" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BILLING_CYCLES.map((cycle) => (
                <SelectItem key={cycle} value={cycle}>
                  {titleCase(cycle)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="billing-price">Price per cycle (KES)</Label>
          <Input
            id="billing-price"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={form.planPrice}
            onChange={(e) => set({ planPrice: e.target.value })}
            placeholder={listPrice > 0 ? `List price ${listPrice}` : 'Custom price'}
            aria-describedby="billing-price-hint"
          />
          <span id="billing-price-hint" className="text-xs text-muted-foreground">
            {form.planPrice ? 'Negotiated price.' : 'Empty = list price.'} Charges {formatKES(effective)} per {CYCLE_LABELS[form.billingCycle] ?? 'cycle'}.
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="billing-trial-end">Trial ends</Label>
          <Input id="billing-trial-end" type="date" value={form.trialEndsAt} onChange={(e) => set({ trialEndsAt: e.target.value })} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="billing-paid-until">Paid until</Label>
          <Input
            id="billing-paid-until"
            type="date"
            value={form.paidUntil}
            onChange={(e) => set({ paidUntil: e.target.value })}
            aria-describedby="billing-paid-until-hint"
          />
          <span
            id="billing-paid-until-hint"
            className={
              paidUntilChanged ? 'flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300' : 'text-xs text-muted-foreground'
            }
          >
            {paidUntilChanged ? (
              <>
                <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                Manual override. Recording or deleting a payment will recalculate this from the payment history.
              </>
            ) : (
              'Set automatically from payments.'
            )}
          </span>
        </div>
      </div>

      <Separator />

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-3 text-sm font-medium">Billing contact</legend>
        <div className="flex flex-col gap-2">
          <Label htmlFor="billing-contact-name">Name</Label>
          <Input
            id="billing-contact-name"
            value={form.billingContactName}
            onChange={(e) => set({ billingContactName: e.target.value })}
            placeholder="Defaults to the owner"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="billing-contact-phone">Phone</Label>
          <Input
            id="billing-contact-phone"
            type="tel"
            value={form.billingContactPhone}
            onChange={(e) => set({ billingContactPhone: e.target.value })}
            placeholder="07XX XXX XXX"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="billing-contact-email">Email</Label>
          <Input
            id="billing-contact-email"
            type="email"
            value={form.billingContactEmail}
            onChange={(e) => set({ billingContactEmail: e.target.value })}
            placeholder="accounts@…"
            autoComplete="off"
          />
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty ? (
          <Button type="button" variant="ghost" onClick={() => setForm(saved)} disabled={saving}>
            Discard changes
          </Button>
        ) : null}
        <Button type="submit" disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save billing'}
        </Button>
      </div>
    </form>
  );
}
