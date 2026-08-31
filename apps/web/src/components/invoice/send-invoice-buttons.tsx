'use client';

import { Mail, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mailtoInvoiceHref, whatsappInvoiceHref } from '@/lib/invoice-message';

// "Send" here means opening the customer's own WhatsApp/email client with
// the invoice pre-filled - no backend sending, no third-party account, per
// the user's explicit choice of the zero-setup deep-link approach over a
// real WhatsApp Business API / transactional email integration.
export function SendInvoiceButtons({
  phone,
  email,
  subject,
  message,
  size = 'lg',
}: {
  phone: string | null;
  email: string | null;
  subject: string;
  message: string;
  size?: 'sm' | 'lg';
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {phone ? (
        <Button asChild variant="outline" size={size}>
          <a href={whatsappInvoiceHref(phone, message)} target="_blank" rel="noopener noreferrer">
            <MessageCircle data-icon="inline-start" />
            WhatsApp
          </a>
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
