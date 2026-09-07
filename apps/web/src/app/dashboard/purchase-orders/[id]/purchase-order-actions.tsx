'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { printRestockDocument, type RestockDocumentData } from '@/components/restock/restock-document';

export function PurchaseOrderActions({
  poId,
  status,
  canReceive,
  document,
}: {
  poId: number;
  status: 'draft' | 'sent' | 'received';
  canReceive: boolean;
  document: RestockDocumentData;
}) {
  const router = useRouter();
  const [receiving, setReceiving] = useState(false);

  function handlePrint() {
    // Tenant name isn't fetched separately here - reusing the store name in
    // its place keeps this self-contained without an extra request, and the
    // document's header is genuinely about which store the goods are for.
    const ok = printRestockDocument(document, { name: document.storeName });
    if (!ok) toast.error('Could not open the print window - check your popup blocker.');
  }

  async function handleReceive() {
    setReceiving(true);
    try {
      const response = await fetch(`/api/payload/purchase-orders/${poId}/receive`, { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? 'Failed to mark received');
      }
      toast.success('Marked as received - stock levels updated');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not mark as received');
    } finally {
      setReceiving(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={handlePrint}>
        Generate document
      </Button>
      {canReceive && status !== 'received' ? (
        <Button onClick={handleReceive} disabled={receiving}>
          {receiving ? 'Marking received...' : 'Mark as received'}
        </Button>
      ) : null}
    </div>
  );
}
