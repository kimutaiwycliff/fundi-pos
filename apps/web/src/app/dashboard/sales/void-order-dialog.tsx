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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { clientFetch, errorMessageFrom } from '@/lib/client-fetch';
import type { ManagerRef, Order } from './page';

// Mirrors apps/desktop/src/VoidOrderPanel.tsx - authorize-status always
// requires a real managerId + PIN regardless of the caller's own session
// role (unlike settle, which skips PIN for an owner/manager session), so
// this is exposed to every role and gated purely by the PIN itself.
export function VoidOrderDialog({
  order,
  managers,
  open,
  onOpenChange,
}: {
  order: Order;
  managers: ManagerRef[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<'voided' | 'refunded'>('voided');
  const [managerId, setManagerId] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);

    try {
      const response = await clientFetch(`/api/payload/orders/${order.id}/authorize-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, managerId: Number(managerId), pin }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(errorMessageFrom(body, `Failed to ${status === 'voided' ? 'void' : 'refund'} sale`));
        return;
      }

      toast.success(`Order ${status}`);
      onOpenChange(false);
      setManagerId('');
      setPin('');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void or refund order #{order.id.slice(0, 8)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="void-status">Action</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as 'voided' | 'refunded')}>
              <SelectTrigger id="void-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="voided">Void</SelectItem>
                <SelectItem value="refunded">Refund</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="void-manager">Authorizing manager</Label>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger id="void-manager" className="w-full">
                <SelectValue placeholder="Select a manager or owner" />
              </SelectTrigger>
              <SelectContent>
                {managers.map((manager) => (
                  <SelectItem key={manager.id} value={String(manager.id)}>
                    {manager.name || manager.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="void-pin">Manager PIN</Label>
            <Input id="void-pin" type="password" required value={pin} onChange={(e) => setPin(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={busy || !managerId || !pin}>
              {busy ? 'Submitting...' : status === 'voided' ? 'Confirm void' : 'Confirm refund'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
