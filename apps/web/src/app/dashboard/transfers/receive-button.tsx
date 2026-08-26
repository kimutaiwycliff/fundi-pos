'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function ReceiveButton({ transferId }: { transferId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleReceive() {
    setLoading(true);
    await fetch(`/api/payload/stock-transfers/${transferId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'received' }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <Button size="lg" variant="secondary" disabled={loading} onClick={handleReceive}>
      {loading ? 'Marking...' : 'Mark received'}
    </Button>
  );
}
