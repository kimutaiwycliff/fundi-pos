'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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
import { apiErrorMessage } from './format';

// Revoke a till (lost/stolen phone, ex-employee's laptop): it can't sign in
// again, and an open session ends at its next refresh. Restore undoes it.
export function DeviceActions({ id, name, revoked }: { id: number; name: string; revoked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');

  async function update(revoke: boolean) {
    setBusy(true);
    const response = await fetch(`/api/platform/devices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(revoke ? { revokedAt: new Date().toISOString(), revokeReason: reason.trim() || null } : { revokedAt: null }),
    });
    setBusy(false);
    if (!response.ok) {
      toast.error(await apiErrorMessage(response, 'Could not update the till'));
      return;
    }
    toast.success(revoke ? `${name} revoked` : `${name} restored`);
    router.refresh();
  }

  if (revoked) {
    return (
      <Button size="sm" variant="outline" disabled={busy} onClick={() => update(false)}>
        Restore
      </Button>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={busy}>
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Nobody will be able to sign in on this till, and if it&apos;s open now it signs out at its next session refresh (within a few
            hours). Sales already synced are kept. You can restore it later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`revoke-${id}`}>Reason (for your records)</Label>
          <Input id={`revoke-${id}`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Phone stolen" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => update(true)}>
            Revoke till
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// A fresh set-password link for the tenant's owner (first one expired, or
// the email never arrived) - emailed, and shown to copy/send.
export function SetPasswordLinkButton({ tenantId }: { tenantId: number }) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    const response = await fetch(`/api/platform/tenants/${tenantId}/set-password-link`, { method: 'POST' });
    setBusy(false);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(body.error ?? 'Could not create a link');
      return;
    }
    setLink(body.setPasswordLink);
    toast.success(body.emailed === 'sent' ? `Emailed to ${body.email}` : 'Link ready - send it to the owner');
  }

  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={create} className="w-fit">
        {busy ? 'Creating…' : "New 'set password' link for the owner"}
      </Button>
      {link ? (
        <Input readOnly value={link} aria-label="Set-password link" onFocus={(e) => e.currentTarget.select()} className="text-xs" />
      ) : null}
    </div>
  );
}
