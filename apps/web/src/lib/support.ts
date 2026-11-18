// Fundi POS's own support line (the marketing WhatsApp button, and the
// "pay / reactivate" links shown to tenants whose access is lapsing).
export const SUPPORT_WHATSAPP = '254716522948';

export function supportWhatsAppLink(message: string): string {
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
}
