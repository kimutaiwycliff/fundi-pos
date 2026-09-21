'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

type TenantStatus = 'active' | 'suspended' | 'deleted';

// Mirrors dashboard/staff/staff-status-actions.tsx's shape (real confirm
// dialogs, not window.confirm()) - PATCHes through the platform proxy
// (/api/platform/*), which forwards with the platform-admin's own cookie.
// Tenants.ts's afterChange hook does the audit logging automatically
// server-side once this PATCH lands, so nothing here has to write the
// audit entry itself.
export function TenantStatusActions({ tenantId, status, name }: { tenantId: number; status: TenantStatus; name: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [purging, setPurging] = useState(false);

  async function setStatus(nextStatus: TenantStatus) {
    setLoading(true);
    const response = await fetch(`/api/platform/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus, statusReason: reason.trim() || undefined }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      toast.error(body?.errors?.[0]?.message ?? 'Failed to update status');
      setLoading(false);
      return;
    }
    toast.success(`${name} is now ${nextStatus}`);
    setLoading(false);
    setReason('');
    router.refresh();
  }

  async function handlePurge() {
    setPurging(true);
    const response = await fetch(`/api/platform/tenants/${tenantId}/purge`, { method: 'POST' });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      toast.error(body?.error ?? 'Failed to permanently delete this tenant');
      setPurging(false);
      return;
    }
    toast.success(`${name} permanently deleted`);
    router.push('/platform');
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'active' ? (
        <>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={loading}>
                Suspend
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Suspend {name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Every staff member immediately loses access - web login, till PIN login, and PowerSync sync. Fully reversible by
                  reactivating. No data is touched.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="suspend-reason">Reason (optional, for the audit log)</Label>
                <Input id="suspend-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. non-payment" />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => setStatus('suspended')}>Suspend</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={loading}>
                Soft-delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Soft-delete {name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Same lockout as suspending, and hides this tenant from the default tenant list. Nothing is physically deleted - this is
                  fully reversible via Restore.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="delete-reason">Reason (optional, for the audit log)</Label>
                <Input id="delete-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. tenant requested closure" />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => setStatus('deleted')}>
                  Soft-delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : (
        <>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={loading}>{status === 'deleted' ? 'Restore' : 'Reactivate'}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {status === 'deleted' ? 'Restore' : 'Reactivate'} {name}?
                </AlertDialogTitle>
                <AlertDialogDescription>Every staff member regains access immediately, on every device.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => setStatus('active')}>{status === 'deleted' ? 'Restore' : 'Reactivate'}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {status === 'deleted' ? (
            <AlertDialog onOpenChange={(open) => !open && setConfirmName('')}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={purging}>
                  Delete permanently
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Permanently delete {name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This cannot be undone. Every product, order, staff member, and record this tenant owns is
                    permanently erased - not just hidden. Type the tenant&apos;s name to confirm.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="confirm-name">
                    Type <span className="font-semibold">{name}</span> to confirm
                  </Label>
                  <Input id="confirm-name" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" disabled={confirmName !== name || purging} onClick={handlePurge}>
                    {purging ? 'Deleting...' : 'Delete permanently'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </>
      )}
    </div>
  );
}

const SUBSCRIPTION_TIERS = ['trial', 'starter', 'growth', 'enterprise'];
const BILLING_STATUSES = ['active', 'trialing', 'past_due', 'canceled'];

export function TenantSubscriptionForm({
  tenantId,
  subscriptionTier,
  billingStatus,
}: {
  tenantId: number;
  subscriptionTier: string;
  billingStatus: string;
}) {
  const router = useRouter();
  const [tier, setTier] = useState(subscriptionTier);
  const [billing, setBilling] = useState(billingStatus);
  const [saving, setSaving] = useState(false);

  const dirty = tier !== subscriptionTier || billing !== billingStatus;

  async function handleSave() {
    setSaving(true);
    const response = await fetch(`/api/platform/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionTier: tier, billingStatus: billing }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      toast.error(body?.errors?.[0]?.message ?? 'Failed to update subscription');
      setSaving(false);
      return;
    }
    toast.success('Subscription updated');
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-2">
        <Label>Subscription tier</Label>
        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUBSCRIPTION_TIERS.map((option) => (
              <SelectItem key={option} value={option} className="capitalize">
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label>Billing status</Label>
        <Select value={billing} onValueChange={setBilling}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BILLING_STATUSES.map((option) => (
              <SelectItem key={option} value={option} className="capitalize">
                {option.replace('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button onClick={handleSave} disabled={!dirty || saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
