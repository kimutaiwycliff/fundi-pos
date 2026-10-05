'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { normalizePromoCode } from '@hardware-pos/business-logic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { clientFetch, errorMessageFrom } from '@/lib/client-fetch';
import { nairobiDateToUTC } from '@/lib/format-date';
import { referrerId, type CustomerOption, type PromoCode } from './promo-format';

const CODE_PATTERN = /^[A-Z0-9_-]{3,30}$/;
const NO_REFERRER = 'none';
// The referrer picker filters client-side; cap what's rendered so a shop
// with thousands of customers doesn't mount thousands of select items.
const MAX_REFERRER_OPTIONS = 50;

// ISO instant -> the Nairobi calendar day it falls on, as <input type=date>
// wants it ("YYYY-MM-DD"; en-CA formats dates that way).
function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
}

// "YYYY-MM-DD" -> start (00:00) or end (23:59:59.999) of that Nairobi day,
// so an end date of the 30th means the code still works all day on the 30th.
function dateInputToIso(value: string, edge: 'start' | 'end'): string | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  if (edge === 'start') return nairobiDateToUTC(year, month, day).toISOString();
  return new Date(nairobiDateToUTC(year, month, day + 1).getTime() - 1).toISOString();
}

function optionalNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

// One dialog for both add and edit, same pattern as customer-dialog.tsx.
export function PromoCodeDialog({ promo, customers }: { promo?: PromoCode; customers: CustomerOption[] }) {
  const router = useRouter();
  const isEdit = Boolean(promo);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState(promo?.code ?? '');
  const [label, setLabel] = useState(promo?.label ?? '');
  const [kind, setKind] = useState<'percentage' | 'flat'>(promo?.kind ?? 'percentage');
  const [value, setValue] = useState(promo ? String(promo.value) : '');
  const [minSpend, setMinSpend] = useState(promo?.minSpend ? String(promo.minSpend) : '');
  const [startsAt, setStartsAt] = useState(isoToDateInput(promo?.startsAt));
  const [endsAt, setEndsAt] = useState(isoToDateInput(promo?.endsAt));
  const [maxUses, setMaxUses] = useState(promo?.maxUses ? String(promo.maxUses) : '');
  const initialReferrer = promo ? referrerId(promo) : null;
  const [isReferral, setIsReferral] = useState(initialReferrer != null);
  const [referrer, setReferrer] = useState(initialReferrer != null ? String(initialReferrer) : NO_REFERRER);
  const [referrerQuery, setReferrerQuery] = useState('');
  const [rewardPoints, setRewardPoints] = useState(
    promo?.referrerRewardPoints ? String(promo.referrerRewardPoints) : '',
  );

  const referrerOptions = useMemo(() => {
    const q = referrerQuery.trim().toLowerCase();
    const matches = q
      ? customers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
      : customers;
    const shown = matches.slice(0, MAX_REFERRER_OPTIONS);
    // Keep the current pick visible even when the filter would hide it.
    if (referrer !== NO_REFERRER && !shown.some((c) => String(c.id) === referrer)) {
      const selected = customers.find((c) => String(c.id) === referrer);
      if (selected) shown.unshift(selected);
    }
    return { shown, total: matches.length };
  }, [customers, referrerQuery, referrer]);

  // Mirrors the server's beforeChange checks (PromoCodes.ts) so the common
  // mistakes are caught before a round trip; the server still has the final say.
  function validate(): string | null {
    const normalized = normalizePromoCode(code);
    if (!CODE_PATTERN.test(normalized)) return 'Promo code must be 3-30 letters, numbers, hyphens or underscores.';
    const v = Number(value);
    if (value.trim() === '' || !Number.isFinite(v) || v <= 0) return 'Enter a discount value greater than 0.';
    if (kind === 'percentage' && v > 100) return 'A percentage discount cannot be more than 100.';
    const ms = optionalNumber(minSpend);
    if (ms != null && (Number.isNaN(ms) || ms < 0)) return 'Minimum spend must be 0 or more.';
    const mu = optionalNumber(maxUses);
    if (mu != null && (Number.isNaN(mu) || mu < 0 || !Number.isInteger(mu))) return 'Max uses must be a whole number.';
    if (startsAt && endsAt && endsAt < startsAt) return 'The end date must be after the start date.';
    if (isReferral) {
      if (referrer === NO_REFERRER) return 'Pick the customer who earns points for this referral code.';
      const rp = optionalNumber(rewardPoints);
      if (rp == null || Number.isNaN(rp) || rp < 0 || !Number.isInteger(rp)) {
        return 'Reward points must be a whole number.';
      }
    }
    return null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      toast.error(problem);
      return;
    }
    setLoading(true);
    setError(null);

    const body = {
      code: normalizePromoCode(code),
      label: label.trim() || null,
      kind,
      value: Number(value),
      minSpend: optionalNumber(minSpend),
      startsAt: dateInputToIso(startsAt, 'start'),
      endsAt: dateInputToIso(endsAt, 'end'),
      maxUses: optionalNumber(maxUses),
      referrerCustomer: isReferral && referrer !== NO_REFERRER ? Number(referrer) : null,
      referrerRewardPoints: isReferral ? Number(rewardPoints || 0) : 0,
    };

    try {
      const response = await clientFetch(isEdit ? `/api/payload/promo-codes/${promo!.id}` : '/api/payload/promo-codes', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? body : { ...body, active: true }),
      });

      if (!response.ok) {
        const resBody = await response.json().catch(() => null);
        const message = errorMessageFrom(resBody, `Failed to ${isEdit ? 'update' : 'create'} promo code`);
        setError(message);
        toast.error(message);
        return;
      }

      setOpen(false);
      toast.success(isEdit ? 'Promo code updated' : `Promo code ${body.code} created`);
      if (!isEdit) {
        setCode('');
        setLabel('');
        setValue('');
        setMinSpend('');
        setStartsAt('');
        setEndsAt('');
        setMaxUses('');
        setIsReferral(false);
        setReferrer(NO_REFERRER);
        setRewardPoints('');
      }
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const idPrefix = isEdit ? `promo-${promo!.id}` : 'promo-new';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="lg">
            Edit
          </Button>
        ) : (
          <Button>New promo code</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${promo!.code}` : 'New promo code'}</DialogTitle>
          <DialogDescription>Customers give this code at checkout to get the discount.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefix}-code`}>Code</Label>
              <Input
                id={`${idPrefix}-code`}
                required
                className="font-mono uppercase"
                placeholder="BF2026"
                maxLength={30}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefix}-label`}>Label</Label>
              <Input
                id={`${idPrefix}-label`}
                placeholder="Black Friday / Jane (influencer)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefix}-kind`}>Discount type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as 'percentage' | 'flat')}>
                <SelectTrigger id={`${idPrefix}-kind`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage off</SelectItem>
                  <SelectItem value="flat">Fixed amount off (KES)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefix}-value`}>{kind === 'percentage' ? 'Percent off' : 'KES off'}</Label>
              <Input
                id={`${idPrefix}-value`}
                type="number"
                inputMode="decimal"
                required
                min={0}
                max={kind === 'percentage' ? 100 : undefined}
                step="any"
                placeholder={kind === 'percentage' ? '15' : '200'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefix}-min`}>Minimum spend (KES)</Label>
              <Input
                id={`${idPrefix}-min`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                placeholder="Optional"
                value={minSpend}
                onChange={(e) => setMinSpend(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefix}-max`}>Max uses</Label>
              <Input
                id={`${idPrefix}-max`}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder="Unlimited"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefix}-start`}>Starts</Label>
              <Input id={`${idPrefix}-start`} type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefix}-end`}>Ends</Label>
              <Input
                id={`${idPrefix}-end`}
                type="date"
                min={startsAt || undefined}
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Leave dates empty to run the code until you switch it off. The end date is included.
          </p>

          <div className="flex flex-col gap-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor={`${idPrefix}-referral`}>Referral code</Label>
                <p className="text-xs text-muted-foreground">
                  A customer earns loyalty points each time someone else uses this code.
                </p>
              </div>
              <Switch id={`${idPrefix}-referral`} checked={isReferral} onCheckedChange={setIsReferral} />
            </div>
            {isReferral ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor={`${idPrefix}-referrer`}>Referring customer</Label>
                  <Input
                    placeholder="Search by name or phone"
                    value={referrerQuery}
                    onChange={(e) => setReferrerQuery(e.target.value)}
                  />
                  <Select value={referrer} onValueChange={setReferrer}>
                    <SelectTrigger id={`${idPrefix}-referrer`} className="w-full">
                      <SelectValue placeholder="Pick a customer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_REFERRER}>No customer selected</SelectItem>
                      {referrerOptions.shown.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                          {c.phone ? ` · ${c.phone}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {referrerOptions.total > MAX_REFERRER_OPTIONS ? (
                    <p className="text-xs text-muted-foreground">
                      Showing {MAX_REFERRER_OPTIONS} of {referrerOptions.total} - type to narrow down.
                    </p>
                  ) : null}
                  {customers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Add the customer on the Customers page first.</p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${idPrefix}-points`}>Points per use</Label>
                  <Input
                    id={`${idPrefix}-points`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    placeholder="50"
                    value={rewardPoints}
                    onChange={(e) => setRewardPoints(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Create promo code'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
