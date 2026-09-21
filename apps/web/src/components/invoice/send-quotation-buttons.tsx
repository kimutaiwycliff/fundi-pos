'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { sendQuotationPdfViaWhatsApp } from '@/lib/send-quotation-pdf';

// Sibling to send-invoice-buttons.tsx, trimmed to just the WhatsApp path -
// a quotation has no email-on-file concept the way a Customer record does,
// and the caller (quotations/[id]/page.tsx) already only renders this when
// a customerPhone exists, so the no-phone case here is just a defensive
// fallback, not the expected path.
export function SendQuotationButtons({
  quotationId,
  phone,
  message,
  size = 'lg',
}: {
  quotationId: string;
  phone: string | null;
  message: string;
  size?: 'sm' | 'lg';
}) {
  const [sending, setSending] = useState(false);

  if (!phone) return null;

  async function handleWhatsApp() {
    if (!phone) return;
    setSending(true);
    try {
      await sendQuotationPdfViaWhatsApp({ quotationId, phone, message });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Button variant="outline" size={size} disabled={sending} onClick={handleWhatsApp}>
      <MessageCircle data-icon="inline-start" />
      {sending ? 'Preparing...' : 'Send via WhatsApp'}
    </Button>
  );
}
