import { API_BASE_URL, apiFetch } from './auth';

// Quotations are online-only, same as restock.ts's purchase-orders/
// suppliers (desktop's local schema.ts has no quotations table - there's no
// PowerSync bucket for them either) - this talks straight to apps/api via
// apiFetch, mirroring restock.ts's/reports.ts's own JWT-header REST calls.

export interface QuotationLineItem {
  product: number;
  variant: string | null;
  label: string;
  quantity: number;
  unitPrice: number;
}

export interface QuotationListItem {
  id: number;
  store: { id: number; name: string } | number | null;
  // Server-computed ("CustomerName - Date", falling back to "Walk-in - Date"
  // with no customer name) - see apps/api/src/collections/Quotations.ts's
  // beforeChange hook. Null only for a pre-migration row that hasn't been
  // backfilled yet.
  name: string | null;
  customerName: string;
  customerPhone: string;
  total: number;
  createdAt: string;
}

export interface QuotationDetail extends QuotationListItem {
  notes: string | null;
  lineItems: QuotationLineItem[];
}

export async function fetchQuotations(payloadToken: string): Promise<QuotationListItem[]> {
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/quotations?sort=-createdAt&limit=200`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    });
    if (!res.ok) return [];
    const body = await res.json().catch(() => null);
    return body?.docs ?? [];
  } catch {
    return [];
  }
}

export async function fetchQuotation(payloadToken: string, id: number): Promise<QuotationDetail | null> {
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/quotations/${id}`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

// Throws (rather than returning null, unlike this file's own fetch* siblings
// above) so the builder screen can surface the server's own friendly
// message - e.g. a rejected customerPhone - via a toast instead of a bare
// "something went wrong". Mirrors auth.ts's loginToPayload/CustomerPicker.tsx's
// own inline handleCreate, both of which read body?.errors?.[0]?.message the
// same way. tenant/total/createdBy are never sent - the server sets/computes
// every one of those itself and ignores anything sent here for them.
export async function createQuotation(
  payloadToken: string,
  args: {
    store?: number | null;
    customerName: string;
    customerPhone: string;
    notes?: string | null;
    lineItems: QuotationLineItem[];
  },
): Promise<QuotationDetail> {
  const res = await apiFetch(`${API_BASE_URL}/api/quotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
    body: JSON.stringify({
      store: args.store ?? undefined,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      notes: args.notes || undefined,
      lineItems: args.lineItems,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.errors?.[0]?.message ?? body?.error ?? `Could not save quotation (HTTP ${res.status})`);
  }
  return (body?.doc ?? body) as QuotationDetail;
}

/**
 * Slugifies a quotation's display name into a filename-safe string - the
 * exact same pattern used on web (apps/api's own quotation-pdf route, which
 * derives its `Content-Disposition` filename this way) and on mobile
 * (apps/mobile/src/quotes/QuotationDetailScreen.tsx's handleShareWhatsApp),
 * so all three platforms name the downloaded/shared file identically.
 */
export function slugifyQuotationName(name: string | null, id: number): string {
  const slug = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `quotation-${id}`;
}

/**
 * Fetches the server-rendered PDF (GET .../quotation-pdf, same bearer-token
 * auth as every other call in this file) and triggers the OS's normal save
 * flow via a Blob + temporary `<a download>` click - the desktop app has no
 * file-save/dialog Tauri plugin installed (checked src-tauri/Cargo.toml/
 * tauri.conf.json), and this needs no new one: `@tauri-apps/plugin-http`'s
 * `fetch` returns a real, spec-compliant `Response` (constructed via `new
 * Response(...)` - see its own dist-js/index.js), so `.blob()` behaves
 * exactly like the browser Fetch API here.
 */
export async function downloadQuotationPdf(payloadToken: string, id: number, name: string | null): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/api/quotations/${id}/quotation-pdf`, {
    headers: { Authorization: `JWT ${payloadToken}` },
  });
  if (!res.ok) {
    throw new Error(`Could not download PDF (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugifyQuotationName(name, id)}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
}
