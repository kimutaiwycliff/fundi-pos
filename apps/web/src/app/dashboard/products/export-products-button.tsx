'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { clientFetch, errorMessageFrom } from '@/lib/client-fetch';

// A live DB-backed export (unlike the static bulk-upload template) can
// meaningfully fail - auth expiry, timeout - so this fetches and builds its
// own download rather than a bare <a href>, same fetch-blob-anchor pattern
// already used for invoice PDFs (send-invoice-pdf.ts), so a failure shows a
// toast instead of a broken/silent download.
export function ExportProductsButton() {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const response = await clientFetch('/api/products/export');
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(errorMessageFrom(body, 'Failed to export products'));
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `products-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button type="button" variant="outline" disabled={exporting} onClick={handleExport}>
      <Download data-icon="inline-start" />
      {exporting ? 'Exporting...' : 'Export products'}
    </Button>
  );
}
