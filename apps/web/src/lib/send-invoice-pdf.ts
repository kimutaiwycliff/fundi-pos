import { clientFetch, errorMessageFrom } from './client-fetch';
import { whatsappInvoiceHref } from './invoice-message';

// A wa.me link can only ever pre-fill plain text, never attach a file - the
// same limitation mobile's own comment (SalesScreen.tsx) documents. The
// closest web equivalent of a native share sheet is the Web Share API's
// file support (Chrome/Edge/Safari); Firefox has no file-share support at
// all, so it falls back to today's exact behavior (download the PDF, open
// the pre-filled wa.me tab) rather than leaving those users with nothing.
export async function sendInvoicePdfViaWhatsApp({
  orderId,
  phone,
  subject,
  message,
}: {
  orderId: string;
  phone: string;
  subject: string;
  message: string;
}): Promise<void> {
  const response = await clientFetch(`/api/payload/orders/${orderId}/invoice-pdf`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(errorMessageFrom(body, 'Failed to generate invoice PDF'));
  }

  const blob = await response.blob();
  const file = new File([blob], `invoice-${orderId}.pdf`, { type: 'application/pdf' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: subject, text: message });
      return;
    } catch (err) {
      // A user dismissing the share sheet is not a failure - only a real
      // share error should surface as one.
      if (err instanceof Error && err.name === 'AbortError') return;
      throw err;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `invoice-${orderId}.pdf`;
  link.click();
  URL.revokeObjectURL(url);

  window.open(whatsappInvoiceHref(phone, message), '_blank', 'noopener,noreferrer');
}
