'use client';

import { useState } from 'react';
import { Mail, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { mailtoInvoiceHref } from '@/lib/invoice-message';
import { sendInvoicePdfViaWhatsApp } from '@/lib/send-invoice-pdf';

// "Send" here means opening the customer's own WhatsApp/email client with
// the invoice pre-filled - no backend sending, no third-party account, per
// the user's explicit choice of the zero-setup deep-link approach over a
// real WhatsApp Business API / transactional email integration. WhatsApp
// specifically now attaches a real PDF (see send-invoice-pdf.ts) rather
// than just pre-filling text; email stays a plain mailto: link since
// mobile's own invoice upgrade left its email path text-only too.
export function SendInvoiceButtons({
  orderId,
  phone,
  email,
  subject,
  message,
  size = 'lg',
}: {
  orderId: string;
  phone: string | null;
  email: string | null;
  subject: string;
  message: string;
  size?: 'sm' | 'lg';
}) {
  const [sending, setSending] = useState(false);

  async function handleWhatsApp() {
    if (!phone) return;
    setSending(true);
    try {
      await sendInvoicePdfViaWhatsApp({ orderId, phone, subject, message });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {phone ? (
        <Button variant="outline" size={size} disabled={sending} onClick={handleWhatsApp}>
          <MessageCircle data-icon="inline-start" />
          {sending ? 'Preparing...' : 'WhatsApp'}
        </Button>
      ) : (
        <Button variant="outline" size={size} disabled title="No phone number on file for this customer">
          <MessageCircle data-icon="inline-start" />
          WhatsApp
        </Button>
      )}
      {email ? (
        <Button asChild variant="outline" size={size}>
          <a href={mailtoInvoiceHref(email, subject, message)}>
            <Mail data-icon="inline-start" />
            Email
          </a>
        </Button>
      ) : (
        <Button variant="outline" size={size} disabled title="No email on file for this customer">
          <Mail data-icon="inline-start" />
          Email
        </Button>
      )}
    </div>
  );
}
