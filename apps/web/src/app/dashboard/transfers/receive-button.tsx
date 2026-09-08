'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { clientFetch, errorMessageFrom } from '@/lib/client-fetch';

export function ReceiveButton({ transferId }: { transferId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReceive() {
    setLoading(true);
    setError(null);
    try {
      const res = await clientFetch(`/api/payload/stock-transfers/${transferId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'received' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(errorMessageFrom(body, 'Could not mark this transfer received'));
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="lg" variant="secondary" disabled={loading} onClick={handleReceive}>
        {loading ? 'Marking...' : 'Mark received'}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
