'use client';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { printRestockDocument, type RestockDocumentData } from '@/components/restock/restock-document';

// Receiving itself now lives in receive-checklist.tsx (tick which items
// actually arrived) - this component is just the document-generation
// action, which applies regardless of receive status.
export function PurchaseOrderActions({ document }: { document: RestockDocumentData }) {
  function handlePrint() {
    // Tenant name isn't fetched separately here - reusing the store name in
    // its place keeps this self-contained without an extra request, and the
    // document's header is genuinely about which store the goods are for.
    const ok = printRestockDocument(document, { name: document.storeName });
    if (!ok) toast.error('Could not open the print window - check your popup blocker.');
  }

  return (
    <Button variant="outline" onClick={handlePrint}>
      Generate document
    </Button>
  );
}
