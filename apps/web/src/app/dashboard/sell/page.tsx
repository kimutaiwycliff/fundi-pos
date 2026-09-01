import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { SellClient } from './sell-client';

export type Variant = {
  id?: string;
  label: string;
  sku: string;
  barcode?: string | null;
  sellPrice?: number | null;
  // Bare media doc id (depth=0) - look up the actual URL via mediaUrlById.
  image?: number | null;
};

export type Product = {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  sellPrice: number;
  taxRate: number;
  maxDiscountAmount: number;
  variants: Variant[];
  // Bare media doc id (depth=0) - look up the actual URL via mediaUrlById.
  image?: number | null;
  // Fetched at depth=0 below, so this is bare ids, not populated docs.
  relatedProducts: number[];
};

export type StoreRef = { id: number; name: string };
export type CustomerRef = { id: number; name: string; phone: string | null; email: string | null };

export type TenantReceiptInfo = {
  name: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
};

export interface StockLevel {
  store: number;
  product: number;
  variant: string | null;
  quantity: number;
}

export default async function SellPage() {
  const me = await getCurrentUser();
  const tenantId = typeof me.tenant === 'object' ? me.tenant.id : me.tenant;

  const [{ docs: products }, { docs: stores }, tenant, { docs: customers }, { levels: stockLevels }, { docs: mediaDocs }] =
    await Promise.all([
      payloadFetch<{ docs: Product[] }>(
        '/api/products?sort=name&limit=1000&depth=0&where[isActive][equals]=true',
      ),
      payloadFetch<{ docs: StoreRef[] }>('/api/stores?sort=name&limit=100'),
      payloadFetch<TenantReceiptInfo>(`/api/tenants/${tenantId}`),
      payloadFetch<{ docs: CustomerRef[] }>('/api/customers?sort=name&limit=1000'),
      payloadFetch<{ levels: StockLevel[] }>('/api/reports/stock-levels'),
      // Products/variants only store a bare media id at depth=0 - resolved
      // against actual URLs client-side via this map.
      payloadFetch<{ docs: { id: number; url: string }[] }>('/api/media?limit=1000&depth=0'),
    ]);
  const mediaUrlById: Record<number, string> = Object.fromEntries(mediaDocs.map((m) => [m.id, m.url]));

  return (
    <SellClient
      me={me}
      products={products}
      stores={stores}
      tenant={tenant}
      customers={customers}
      stockLevels={stockLevels}
      mediaUrlById={mediaUrlById}
    />
  );
}
