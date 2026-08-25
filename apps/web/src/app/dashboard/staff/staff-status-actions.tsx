'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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

// Ban is the always-safe, always-reversible action (Users.ts's own `status`
// field comment: Orders/Shifts/AuditLog hold required relationships to a
// user, so an outright delete is often impossible once someone has actually
// worked a shift). Delete is offered too, per the user's own instruction,
// but a foreign-key-constrained delete fails server-side rather than
// silently corrupting history - surfaced here as a plain-language nudge
// toward banning instead, not a raw database error. Both actions confirm
// via a real dialog rather than the browser's own window.confirm(), which
// is unstyled, blocks the whole tab, and is easy to click through by habit.
export function StaffStatusActions({
  staffId,
  status,
  name,
}: {
  staffId: number;
  status: 'active' | 'banned';
  name: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleToggleBan() {
    setLoading(true);
    const nextStatus = status === 'banned' ? 'active' : 'banned';
    const response = await fetch(`/api/payload/users/${staffId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      toast.error(body?.errors?.[0]?.message ?? 'Failed to update status');
      setLoading(false);
      return;
    }
    toast.success(nextStatus === 'banned' ? 'Staff member banned' : 'Staff member reactivated');
    setLoading(false);
    router.refresh();
  }

  async function handleDelete() {
    setLoading(true);
    const response = await fetch(`/api/payload/users/${staffId}`, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      // Users.ts's beforeDelete hook pre-checks for referencing Orders/
      // Shifts/AuditLog rows and throws a clear, actionable APIError before
      // Postgres's own FK constraint would otherwise reject the delete with
      // a generic, unhelpful message - safe to show this verbatim.
      toast.error(body?.errors?.[0]?.message ?? 'Failed to delete staff member');
      setLoading(false);
      return;
    }
    toast.success('Staff member deleted');
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={loading}>
            {status === 'banned' ? 'Reactivate' : 'Ban'}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{status === 'banned' ? `Reactivate ${name}?` : `Ban ${name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {status === 'banned'
                ? 'They will be able to log in again on the web dashboard and at the till.'
                : 'They will immediately lose access to the web dashboard and the till, on every device.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleBan}>
              {status === 'banned' ? 'Reactivate' : 'Ban'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" disabled={loading}>
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name} permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. If they have any sales, shift, or audit history, this will fail and you should
              ban them instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
