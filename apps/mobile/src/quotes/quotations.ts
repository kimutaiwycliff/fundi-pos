import { API_BASE_URL } from '../lib/auth';

// Quotations are REST-only, exactly like restock/purchaseOrders.ts - not in
// PowerSync's sync-config.yaml bucket list (a quote is a back-office
// planning document, not something that must survive a mid-sale blackout),
// so this talks straight to the API the same way purchaseOrders.ts does,
// using the same `Authorization: JWT <token>` scheme every other REST call
// in this app already uses (see purchaseOrders.ts/auth.ts).

export interface QuotationLineItem {
  product: number;
  variant: string | null;
  label: string;
  quantity: number;
  unitPrice: number;
}

export interface QuotationListItem {
  id: number;
  name: string | null;
  store: { id: number; name: string } | number | null;
  customerName: string;
  customerPhone: string | null;
  total: number;
  createdAt: string;
}

export interface QuotationDetail extends QuotationListItem {
  notes: string | null;
  lineItems: QuotationLineItem[];
}

export async function fetchQuotations(payloadToken: string): Promise<QuotationListItem[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/quotations?sort=-createdAt&limit=200`, {
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
    const res = await fetch(`${API_BASE_URL}/api/quotations/${id}`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

// Unlike purchaseOrders.ts's create/fetch helpers (which collapse any
// failure down to a bare `null`), the builder screen needs the server's
// actual message on failure - customerPhone is normalized/validated
// server-side and rejected with a friendly 400 error the cashier/manager
// needs to see (e.g. "That doesn't look like a valid phone number"), not a
// generic "something went wrong". Mirrors auth.ts's own
// `body?.errors?.[0]?.message ?? body?.error` extraction.
export async function createQuotation(
  payloadToken: string,
  args: {
    store?: number | null;
    customerName: string;
    customerPhone?: string;
    notes?: string;
    lineItems: QuotationLineItem[];
  },
): Promise<{ doc: QuotationDetail } | { error: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
      body: JSON.stringify({
        store: args.store ?? undefined,
        customerName: args.customerName,
        customerPhone: args.customerPhone,
        notes: args.notes,
        lineItems: args.lineItems,
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { error: body?.errors?.[0]?.message ?? body?.error ?? `Could not create quotation (HTTP ${res.status})` };
    }
    return { doc: body?.doc ?? body };
  } catch {
    return { error: 'Could not reach the server. Check your connection and try again.' };
  }
}
