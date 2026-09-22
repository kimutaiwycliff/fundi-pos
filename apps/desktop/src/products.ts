import { apiFetch, API_BASE_URL } from './auth';

// Product create/update/image-upload calls for ProductsScreen.tsx, mirroring
// apps/mobile/src/inventory/ProductsScreen.tsx's own plain-REST calls and
// apps/web/src/app/dashboard/products/product-dialog.tsx's request shapes -
// hitting Payload's own /api/products, /api/products/{id}, /api/media
// directly (not web's Next.js /api/payload/* proxy route - that route only
// exists inside apps/web's own server; desktop has no equivalent and
// doesn't need one, same reasoning as catalog.ts already hitting
// /api/products directly). `tenant` is deliberately never sent - Products.ts's
// own enforceOwnTenant beforeChange hook unconditionally stamps it from the
// logged-in user's session on create, so a client-supplied value would be
// ignored anyway.

export interface ProductVariantInput {
  // Omitted for a brand-new row (Payload assigns one on save); present when
  // patching an existing variant so it's updated in place rather than
  // appended as a new row.
  id?: string;
  label: string;
  sku?: string;
  barcode?: string;
  // null/undefined means "use the product's own price" - never send 0 for
  // "inherit", that means "free".
  sellPrice?: number | null;
  costPrice?: number | null;
  image?: number | null;
}

export interface ProductInput {
  name: string;
  category?: string | null;
  image?: number | null;
  costPrice?: number;
  sellPrice?: number;
  taxRate?: number;
  maxDiscountAmount?: number;
  reorderPoint?: number;
  isActive?: boolean;
  variants?: ProductVariantInput[];
  relatedProducts?: number[];
}

async function throwOnError(res: Response, fallback: string): Promise<void> {
  if (res.ok) return;
  const body = await res.json().catch(() => null);
  throw new Error(body?.errors?.[0]?.message ?? body?.error ?? `${fallback} (HTTP ${res.status})`);
}

/** POST /api/products - manager/owner only server-side (Products.access.create). */
export async function createProduct(payloadToken: string, data: ProductInput): Promise<{ id: number }> {
  const res = await apiFetch(`${API_BASE_URL}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
    body: JSON.stringify(data),
  });
  await throwOnError(res, 'Failed to create product');
  const body = await res.json().catch(() => ({}));
  return { id: (body?.doc?.id ?? body?.id) as number };
}

/**
 * PATCH /api/products/{id} - any tenant user can attempt this (a cashier
 * needs it to change a product's own photo), but Products.ts's field-level
 * access re-locks every field except `image` to manager/owner, so a
 * cashier's request only actually changes `image` no matter what else is
 * in the body. Client-side, ProductsScreen.tsx only ever includes the
 * fields a cashier is allowed to send in that case - this isn't the only
 * enforcement, just keeps the request honest about what it does.
 */
export async function updateProduct(payloadToken: string, id: number, data: Partial<ProductInput>): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/api/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
    body: JSON.stringify(data),
  });
  await throwOnError(res, 'Failed to update product');
}

/** DELETE /api/products/{id} - manager/owner only; blocked server-side (with a friendly message) if the product has order/stock-movement history. */
export async function deleteProduct(payloadToken: string, id: number): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/api/products/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `JWT ${payloadToken}` },
  });
  await throwOnError(res, 'Failed to delete product');
}

export interface UploadedImage {
  id: number;
  url: string;
}

/**
 * POST /api/media as multipart FormData - the same dedicated upload route
 * web's ImageField / mobile's pickImage both post to. Deliberately does NOT
 * set a Content-Type header: @tauri-apps/plugin-http's `fetch` builds a real
 * `Request` from (input, init) and only fills in headers not already present
 * on the caller's own `init.headers` (confirmed against
 * node_modules/@tauri-apps/plugin-http/dist-js/index.js) - an explicit
 * Content-Type here would clobber the multipart boundary FormData's own
 * auto-derived one supplies, exactly like a plain browser fetch. The Tauri
 * webview gives a genuine File/Blob from a real `<input type="file">`, so
 * this builds FormData the same way a browser page would - no
 * React-Native-style `{uri,name,type}` workaround needed.
 */
export async function uploadImage(payloadToken: string, file: File): Promise<UploadedImage> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiFetch(`${API_BASE_URL}/api/media`, {
    method: 'POST',
    headers: { Authorization: `JWT ${payloadToken}` },
    body: formData,
  });
  await throwOnError(res, 'Failed to upload image');
  const body = await res.json().catch(() => ({}));
  return { id: body.doc.id as number, url: body.doc.url as string };
}

/**
 * Bare id -> url map for every media doc, same "load once, join
 * client-side" pattern as apps/web's dashboard/products/page.tsx and
 * dashboard/sell/page.tsx - catalog.ts's own `image`/variant `image` fields
 * come back as a bare numeric id (not a populated doc) regardless of the
 * `depth` used on the products list, so resolving to an actual displayable
 * URL needs this separate lookup.
 */
export async function fetchMediaUrlMap(payloadToken: string): Promise<Record<number, string>> {
  const res = await apiFetch(`${API_BASE_URL}/api/media?limit=1000&depth=0`, {
    headers: { Authorization: `JWT ${payloadToken}` },
  });
  if (!res.ok) {
    throw new Error(`Could not load media (HTTP ${res.status})`);
  }
  const body = await res.json().catch(() => null);
  const docs = (body?.docs ?? []) as Array<{ id: number; url: string }>;
  return Object.fromEntries(docs.map((d) => [d.id, d.url]));
}
