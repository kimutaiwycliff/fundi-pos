'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, MessageCircle, Plus } from 'lucide-react';
import { buildWhatsAppLink } from '@hardware-pos/business-logic';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDay } from './format';

interface PriorTrial {
  id: number;
  businessName: string;
  createdAt: string;
  matchedOn: string[];
}

const TIER_OPTIONS = [
  { value: 'trial', label: 'Free trial' },
  { value: 'starter', label: 'Starter · KES 1,000/mo' },
  { value: 'growth', label: 'Growth · KES 2,800/mo' },
  { value: 'enterprise', label: 'Enterprise (custom)' },
];

// "Add tenant": the operator sets up a shop for someone (e.g. after a call
// or a visit). The owner gets an email with a set-password link; the same
// link is shown here to copy or send on WhatsApp.
export function AddTenantDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ businessName: '', ownerName: '', ownerEmail: '', ownerPhone: '', tier: 'trial', trialDays: '14' });
  const [priors, setPriors] = useState<PriorTrial[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ tenantId: number; link: string; emailed: string } | null>(null);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  function reset() {
    setForm({ businessName: '', ownerName: '', ownerEmail: '', ownerPhone: '', tier: 'trial', trialDays: '14' });
    setPriors(null);
    setError(null);
    setCreated(null);
  }

  async function submit(allowRepeatTrial: boolean) {
    setSaving(true);
    setError(null);
    const response = await fetch('/api/platform/platform-provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, trialDays: Number(form.trialDays), allowRepeatTrial }),
    });
    setSaving(false);
    const body = await response.json().catch(() => ({}));
    if (response.status === 409 && body.code === 'prior_trial') {
      setPriors(body.priors ?? []);
      return;
    }
    if (!response.ok) {
      setError(body.error ?? 'Could not add the tenant');
      return;
    }
    setCreated({ tenantId: body.tenantId, link: body.setPasswordLink, emailed: body.emailed });
    router.refresh();
  }

  const whatsapp =
    created && form.ownerPhone
      ? buildWhatsAppLink(
          form.ownerPhone,
          `Hi${form.ownerName ? ` ${form.ownerName.split(' ')[0]}` : ''}, your Fundi POS account for ${form.businessName} is ready. Set your password here (link works for 72 hours): ${created.link}`,
        )
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden /> Add tenant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>{form.businessName} is set up</DialogTitle>
              <DialogDescription>
                {created.emailed === 'sent'
                  ? `We emailed ${form.ownerEmail} a link to set their password.`
                  : `Email isn't set up yet, so send the owner this link yourself.`}{' '}
                It works for 72 hours.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Input readOnly value={created.link} aria-label="Set-password link" onFocus={(e) => e.currentTarget.select()} />
              <Button
                variant="outline"
                size="icon"
                aria-label="Copy link"
                onClick={async () => {
                  await navigator.clipboard.writeText(created.link);
                  toast.success('Link copied');
                }}
              >
                <Copy />
              </Button>
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              {whatsapp ? (
                <Button asChild variant="outline">
                  <a href={whatsapp} target="_blank" rel="noreferrer">
                    <MessageCircle aria-hidden /> Send on WhatsApp
                  </a>
                </Button>
              ) : (
                <span />
              )}
              <Button asChild>
                <Link href={`/platform/tenants/${created.tenantId}`} onClick={() => setOpen(false)}>
                  Open tenant
                </Link>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(false);
            }}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>Add a tenant</DialogTitle>
              <DialogDescription>Creates the shop and its owner. The owner sets their own password from a link.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="at-business">Business name</Label>
                <Input id="at-business" required value={form.businessName} onChange={(e) => set('businessName')(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="at-owner">Owner name</Label>
                <Input id="at-owner" value={form.ownerName} onChange={(e) => set('ownerName')(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="at-phone">Owner phone</Label>
                <Input id="at-phone" inputMode="tel" placeholder="07XX XXX XXX" value={form.ownerPhone} onChange={(e) => set('ownerPhone')(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="at-email">Owner email (their username)</Label>
                <Input id="at-email" type="email" required value={form.ownerEmail} onChange={(e) => set('ownerEmail')(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="at-tier">Plan</Label>
                <Select value={form.tier} onValueChange={set('tier')}>
                  <SelectTrigger id="at-tier" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIER_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="at-days">Free trial (days)</Label>
                <Input id="at-days" type="number" min={0} max={90} value={form.trialDays} onChange={(e) => set('trialDays')(e.target.value)} />
              </div>
            </div>
            {priors ? (
              <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
                <p className="font-medium">This email or phone has had a free trial before:</p>
                <ul className="mt-1 list-disc pl-5">
                  {priors.map((p) => (
                    <li key={p.id}>
                      {p.businessName} · {formatDay(p.createdAt)} · matched on {p.matchedOn.join(' + ')}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              {priors ? (
                <Button type="button" variant="destructive" disabled={saving} onClick={() => submit(true)}>
                  {saving ? 'Adding…' : 'Grant the trial anyway'}
                </Button>
              ) : (
                <Button type="submit" disabled={saving}>
                  {saving ? 'Adding…' : 'Add tenant'}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
