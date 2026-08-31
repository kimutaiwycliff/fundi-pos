export interface InvoiceLine {
  label: string;
  quantity: number;
  lineTotal: number;
}

export interface InvoiceData {
  orderId: string;
  createdAt: string;
  customerName: string;
  lines: InvoiceLine[];
  total: number;
  isPaid: boolean;
  settledAtLabel: string | null;
}

export interface InvoiceTenantInfo {
  name: string;
  receiptFooter?: string | null;
}

// Plain text (not HTML) so the same string works as both a WhatsApp message
// body and a mailto: body - WhatsApp's *bold* markdown renders there and is
// harmless as literal asterisks in an email client.
export function buildInvoiceText(data: InvoiceData, tenant: InvoiceTenantInfo): string {
  const lineRows = data.lines.map((l) => `- ${l.label} x${l.quantity}: ${l.lineTotal.toFixed(2)}`).join('\n');
  const statusLine = data.isPaid
    ? `Status: Paid${data.settledAtLabel ? ` (settled ${data.settledAtLabel})` : ''}`
    : 'Status: *Payment due*';

  return [
    `*Invoice from ${tenant.name}*`,
    `Order #${data.orderId.slice(0, 8)} - ${new Date(data.createdAt).toLocaleDateString()}`,
    '',
    `Hi ${data.customerName},`,
    '',
    lineRows,
    '',
    `*Total: ${data.total.toFixed(2)}*`,
    statusLine,
    '',
    tenant.receiptFooter?.trim() || 'Thank you for your business!',
  ].join('\n');
}

export function invoiceSubject(data: InvoiceData, tenant: InvoiceTenantInfo): string {
  return `Invoice #${data.orderId.slice(0, 8)} from ${tenant.name}`;
}

// wa.me needs digits only, international format, no leading +/0 - phone is
// already Kenyan-normalized to "0712345678" by Customers.ts's beforeChange
// hook, so swapping the leading 0 for the country code is the only step
// needed here.
function toInternationalKenyanPhone(localPhone: string): string {
  return localPhone.startsWith('0') ? `254${localPhone.slice(1)}` : localPhone;
}

export function whatsappInvoiceHref(phone: string, message: string): string {
  return `https://wa.me/${toInternationalKenyanPhone(phone)}?text=${encodeURIComponent(message)}`;
}

export function mailtoInvoiceHref(email: string, subject: string, message: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}
