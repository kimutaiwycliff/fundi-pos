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

// There's no "ban" equivalent for a branch - it either has no history yet
// (safe to delete) or it does (Stores.ts's own beforeDelete hook blocks the
// delete with a clear message telling the tenant to reassign/remove that
// data first, the same pattern as staff deletion).
export function StoreDeleteButton({ storeId, name }: { storeId: number; name: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const response = await fetch(`/api/payload/stores/${storeId}`, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      toast.error(body?.errors?.[0]?.message ?? 'Failed to delete branch');
      setLoading(false);
      return;
    }
    toast.success('Branch deleted');
    setLoading(false);
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="lg" disabled={loading}>
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name} permanently?</AlertDialogTitle>
          <AlertDialogDescription>
            This cannot be undone. If this branch has any staff, sales, or stock history, this will fail - reassign
            or remove that data first.
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
  );
}
