'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { clientFetch, errorMessageFrom } from '@/lib/client-fetch';

function todayNairobi(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}

// "I've paid": sends the M-Pesa code for Fundi to check. Nothing changes
// until it's confirmed - the page says so, and an email follows.
export function ClaimForm({ defaultAmount }: { defaultAmount: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState(defaultAmount > 0 ? String(defaultAmount) : '');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(todayNairobi());
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await clientFetch(
        '/api/payload/billing/claim',
        {
          method: 'POST',
          body: JSON.stringify({ amount: Number(amount), reference, paidAt: `${paidOn}T12:00:00+03:00` }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(errorMessageFrom(body, 'Could not send your payment'));
        return;
      }
      setReference('');
      toast.success("Thanks - we'll confirm your payment shortly and email you.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="claim-amount">Amount paid (KES)</Label>
        <Input id="claim-amount" inputMode="numeric" required value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="claim-code">M-Pesa code</Label>
        <Input
          id="claim-code"
          required
          autoCapitalize="characters"
          placeholder="e.g. QJK7ABC123"
          value={reference}
          onChange={(e) => setReference(e.target.value.toUpperCase().replace(/\s/g, ''))}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="claim-date">Date paid</Label>
        <Input id="claim-date" type="date" required max={todayNairobi()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
      </div>
      <div className="sm:col-span-3">
        <Button type="submit" disabled={saving || !amount || !reference}>
          {saving ? 'Sending…' : "I've paid - send for confirmation"}
        </Button>
      </div>
    </form>
  );
}

export function TrialRequestForm() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await clientFetch(
        '/api/payload/billing/trial-extension',
        { method: 'POST', body: JSON.stringify({ message }) },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(errorMessageFrom(body, 'Could not send your request'));
        return;
      }
      toast.success("Request sent - we'll reply by email.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Label htmlFor="trial-message">Tell us why you need more time (optional)</Label>
      <Textarea
        id="trial-message"
        rows={3}
        maxLength={1000}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="e.g. Still entering our stock - need another week before we start selling."
      />
      <div>
        <Button type="submit" variant="outline" disabled={saving}>
          {saving ? 'Sending…' : 'Ask for more trial time'}
        </Button>
      </div>
    </form>
  );
}
