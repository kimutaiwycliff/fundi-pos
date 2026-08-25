'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

// Ban is the always-safe, always-reversible action (Users.ts's own `status`
// field comment: Orders/Shifts/AuditLog hold required relationships to a
// user, so an outright delete is often impossible once someone has actually
// worked a shift). Delete is offered too, per the user's own instruction,
// but a foreign-key-constrained delete fails server-side rather than
// silently corrupting history - surfaced here as a plain-language nudge
// toward banning instead, not a raw database error.
export function StaffStatusActions({ staffId, status }: { staffId: number; status: 'active' | 'banned' }) {
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
    if (!window.confirm('Delete this staff member permanently? This cannot be undone.')) return;
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
      <Button variant="outline" size="sm" disabled={loading} onClick={handleToggleBan}>
        {status === 'banned' ? 'Reactivate' : 'Ban'}
      </Button>
      <Button variant="destructive" size="sm" disabled={loading} onClick={handleDelete}>
        Delete
      </Button>
    </div>
  );
}
