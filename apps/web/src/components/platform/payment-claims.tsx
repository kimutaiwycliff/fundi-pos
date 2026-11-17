'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage, formatDay, formatKES } from './format';
import type { SubscriptionPayment } from './types';

function claimedByName(p: SubscriptionPayment): string {
  if (!p.claimedBy) return 'the shop';
  if (typeof p.claimedBy === 'object') return p.claimedBy.name || p.claimedBy.email;
  return `user #${p.claimedBy}`;
}

// "I've paid" claims from the tenant, waiting for the operator to match
// them against the M-Pesa statement. Confirming extends paid-until by one
// billing cycle (and lifts an automatic lockout); rejecting tells the
// tenant why. Either way they're emailed.
export function PaymentClaims({ claims, cycleLabel, onTrialTier }: { claims: SubscriptionPayment[]; cycleLabel: string; onTrialTier: boolean }) {
  return (
    <>
    {onTrialTier ? (
      <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
        This shop is still on the Trial tier. Confirming extends their paid-until, but set their plan in the Billing form below so MRR counts it.
      </p>
    ) : null}
    <ul className="flex flex-col divide-y">
      {claims.map((c) => (
        <ClaimRow key={c.id} claim={c} cycleLabel={cycleLabel} />
      ))}
    </ul>
    </>
  );
}

function ClaimRow({ claim, cycleLabel }: { claim: SubscriptionPayment; cycleLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');

  async function decide(status: 'confirmed' | 'rejected') {
    setBusy(true);
    const response = await fetch(`/api/platform/subscription-payments/${claim.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(status === 'rejected' ? { status, rejectReason: reason.trim() || null } : { status }),
    });
    setBusy(false);
    if (!response.ok) {
      toast.error(await apiErrorMessage(response, 'Could not update the claim'));
      return;
    }
    toast.success(status === 'confirmed' ? 'Payment confirmed - the shop has been emailed' : 'Claim rejected - the shop has been emailed');
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-semibold tabular-nums">
          {formatKES(claim.amount)} <span className="font-mono text-sm font-normal text-muted-foreground">{claim.reference}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          Paid {formatDay(claim.paidAt)} · sent by {claimedByName(claim)} {formatDay(claim.createdAt)}
        </span>
        {claim.note ? <span className="text-xs text-muted-foreground italic">{claim.note}</span> : null}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" disabled={busy} onClick={() => decide('confirmed')}>
          <Check aria-hidden /> Confirm · +1 {cycleLabel}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy}>
              <X aria-hidden /> Reject
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reject this payment claim?</AlertDialogTitle>
              <AlertDialogDescription>
                {formatKES(claim.amount)} with code {claim.reference}. Their paid-until date won&apos;t change, and they&apos;ll get an email
                asking them to check the code.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`reject-${claim.id}`}>Reason (shown to the shop)</Label>
              <Input
                id={`reject-${claim.id}`}
                value={reason}
                maxLength={200}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. No payment with this code on our statement"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => decide('rejected')}>
                Reject claim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}
