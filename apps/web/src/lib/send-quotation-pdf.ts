import { clientFetch, errorMessageFrom } from './client-fetch';
import { whatsappInvoiceHref } from './invoice-message';

// Sibling to send-invoice-pdf.ts - same navigator.share-with-file-then-
// wa.me-fallback logic, pointed at the quotation PDF route instead of the
// order's invoice-pdf route. See that file's own comment for why a
// download+wa.me fallback exists at all (Web Share API file support isn't
// universal, e.g. Firefox has none).
export async function sendQuotationPdfViaWhatsApp({
  quotationId,
  phone,
  message,
}: {
  quotationId: string;
  phone: string;
  message: string;
}): Promise<void> {
  const response = await clientFetch(`/api/payload/quotations/${quotationId}/quotation-pdf`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(errorMessageFrom(body, 'Failed to generate quotation PDF'));
  }

  const blob = await response.blob();
  const file = new File([blob], `quotation-${quotationId}.pdf`, { type: 'application/pdf' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Quotation', text: message });
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
  link.download = `quotation-${quotationId}.pdf`;
  link.click();
  URL.revokeObjectURL(url);

  window.open(whatsappInvoiceHref(phone, message), '_blank', 'noopener,noreferrer');
}
