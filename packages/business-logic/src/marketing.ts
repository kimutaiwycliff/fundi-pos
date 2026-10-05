import { normalizeKenyanPhone } from './phone.ts';

// Paid add-ons a platform admin switches on/off per tenant (Tenants.addons).
// Deliberately independent of subscriptionTier - the admin decides who has
// what, at will, rather than it being derived from the plan. Shared by the
// API (server-side enforcement) and every client (hiding/locking screens),
// so "does this tenant have Sell Online?" has exactly one answer everywhere.
export const ADDONS = ['sell_online'] as const;
export type Addon = (typeof ADDONS)[number];

export const ADDON_LABELS: Record<Addon, string> = {
  sell_online: 'Sell Online',
};

export interface AddonTenant {
  addons?: readonly string[] | null;
  billingStatus?: string | null;
}

// A canceled subscription loses add-ons along with everything else - the
// tenant can't log in at that point anyway (lib/billing.ts), this just keeps
// the public storefront from outliving the account.
export function hasAddon(tenant: AddonTenant | null | undefined, addon: Addon): boolean {
  if (!tenant || tenant.billingStatus === 'canceled') return false;
  return Array.isArray(tenant.addons) && tenant.addons.includes(addon);
}

// Where a sale came from. Stored on every order (null on orders created
// before this existed - treat those as walk-in). Order matters: this is the
// order every checkout picker shows them in.
export const SALES_CHANNELS = [
  'walk_in',
  'whatsapp',
  'instagram',
  'tiktok',
  'facebook',
  'online_shop',
  'phone',
  'other',
] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

export const SALES_CHANNEL_LABELS: Record<SalesChannel, string> = {
  walk_in: 'Walk-in',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  online_shop: 'Online shop',
  phone: 'Phone call',
  other: 'Other',
};

export function salesChannelLabel(channel: string | null | undefined): string {
  return SALES_CHANNEL_LABELS[(channel ?? 'walk_in') as SalesChannel] ?? 'Other';
}

// "How did you hear about us?" - asked once, when a customer is first
// added, and stored on the customer (not the order) since it describes how
// the relationship started, not any one sale.
export const CUSTOMER_SOURCES = [
  'walk_by',
  'referral',
  'tiktok',
  'instagram',
  'facebook',
  'whatsapp',
  'google',
  'influencer',
  'ad',
  'other',
] as const;
export type CustomerSource = (typeof CUSTOMER_SOURCES)[number];

export const CUSTOMER_SOURCE_LABELS: Record<CustomerSource, string> = {
  walk_by: 'Walked by the shop',
  referral: 'Friend / referral',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  google: 'Google / Maps',
  influencer: 'Influencer',
  ad: 'Online ad',
  other: 'Other',
};

export function customerSourceLabel(source: string | null | undefined): string {
  if (!source) return 'Unknown';
  return CUSTOMER_SOURCE_LABELS[source as CustomerSource] ?? 'Other';
}

// wa.me needs the international form with no "+" (2547XXXXXXXX). Returns
// null for anything that isn't a valid Kenyan mobile number, so callers can
// simply hide the WhatsApp button rather than render a broken link.
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const local = normalizeKenyanPhone(raw);
  return local ? `254${local.slice(1)}` : null;
}

export function buildWhatsAppLink(raw: string | null | undefined, message?: string): string | null {
  const number = toWhatsAppNumber(raw);
  if (!number) return null;
  return message ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : `https://wa.me/${number}`;
}

export interface ReceiptMarketingTenant {
  whatsappNumber?: string | null;
  socialHandles?: string | null;
  googleReviewUrl?: string | null;
}

// The extra lines printed under the receipt footer - turning every receipt
// into a small advert (order again on WhatsApp, follow us, review us).
// Plain text only, so the exact same lines work on ESC/POS thermal
// printers, HTML receipts and PDF invoices alike.
export function buildReceiptMarketingLines(tenant: ReceiptMarketingTenant | null | undefined): string[] {
  if (!tenant) return [];
  const lines: string[] = [];
  const whatsapp = tenant.whatsappNumber ? normalizeKenyanPhone(tenant.whatsappNumber) : null;
  if (whatsapp) lines.push(`Order on WhatsApp: ${whatsapp}`);
  const socials = tenant.socialHandles?.trim();
  if (socials) lines.push(`Follow us: ${socials}`);
  const review = tenant.googleReviewUrl?.trim();
  if (review) lines.push(`Review us: ${review}`);
  return lines;
}

// Every client already prints `receiptFooter` as a free-text block, so the
// marketing lines ride along inside it rather than each printer path (TS
// ESC/POS, Rust ESC/POS, HTML, PDF) needing its own new field.
export function receiptFooterWithMarketing(
  footer: string | null | undefined,
  tenant: ReceiptMarketingTenant | null | undefined,
): string | null {
  const parts = [footer?.trim() || null, ...buildReceiptMarketingLines(tenant)].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join('\n') : null;
}

// ---- Storefront delivery (Settings -> Online shop -> Delivery & payment)

export interface DeliveryZone {
  name: string;
  fee: number;
  eta?: string | null; // e.g. "Same day", "1-2 days"
}

export interface DeliveryQuote {
  fee: number;
  free: boolean;
  // KES still needed to reach free delivery; null when there's no threshold
  // or it's already reached.
  remainingForFree: number | null;
  // 0-1 progress towards the threshold, for the bag's progress bar.
  progress: number | null;
}

// Delivery fee for a bag: the chosen zone's fee, waived once the subtotal
// reaches the shop's free-delivery threshold (when it has one).
export function quoteDelivery(subtotal: number, zone: DeliveryZone | null, freeThreshold: number | null | undefined): DeliveryQuote {
  const threshold = freeThreshold && freeThreshold > 0 ? freeThreshold : null;
  const reached = threshold != null && subtotal >= threshold;
  const baseFee = zone ? Math.max(0, zone.fee) : 0;
  return {
    fee: reached ? 0 : baseFee,
    free: reached || (zone != null && baseFee === 0),
    remainingForFree: threshold != null && !reached ? Math.round((threshold - subtotal) * 100) / 100 : null,
    progress: threshold != null ? Math.min(1, Math.max(0, subtotal / threshold)) : null,
  };
}

// "HH:MM" (24h) -> minutes after midnight, or null if it isn't a time.
export function parseCutoff(value: string | null | undefined): number | null {
  const match = value?.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function formatCutoff(value: string | null | undefined): string | null {
  const minutes = parseCutoff(value);
  if (minutes == null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

// Kenya is UTC+3 all year (no DST), so Nairobi wall-clock time is a fixed
// offset - the same convention the API's reports use.
function nairobiMinutes(now: Date): number {
  return ((now.getUTCHours() + 3) % 24) * 60 + now.getUTCMinutes();
}

// Whether an order placed now still makes today's same-day run.
export function sameDayOpen(cutoff: string | null | undefined, now: Date = new Date()): boolean | null {
  const minutes = parseCutoff(cutoff);
  if (minutes == null) return null;
  return nairobiMinutes(now) < minutes;
}

// Public storefront URL slug: lowercase letters, digits and single hyphens,
// 3-40 chars. Returns null when it can't be made valid.
export function normalizeShopSlug(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length < 3 || slug.length > 40) return null;
  return slug;
}
