'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Draft-only by design - PurchaseOrders.ts's access.delete already enforces
// this server-side (status: draft ANDed into the tenant/role check), this
// button just doesn't render at all for anything past draft so there's
// nothing to click that would 403.
export function DeletePurchaseOrderButton({ id }: { id: number }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm('Delete this draft restock list? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/payload/purchase-orders/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      toast.success('Restock list deleted');
      router.refresh();
    } catch {
      toast.error('Could not delete restock list');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Button variant="ghost" size="icon" onClick={handleDelete} disabled={deleting} aria-label="Delete draft">
      <Trash2 className="size-4 text-destructive" />
    </Button>
  );
}
