import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { SellClient } from './sell-client';

export type Product = {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  sellPrice: number;
  taxRate: number;
  maxDiscountPercent: number;
};

export type StoreRef = { id: number; name: string };
export type CustomerRef = { id: number; name: string; phone: string | null; email: string | null };

export type TenantReceiptInfo = {
  name: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
};

interface StockLevel {
  store: number;
  product: number;
  quantity: number;
}

export default async function SellPage() {
  const me = await getCurrentUser();
  const tenantId = typeof me.tenant === 'object' ? me.tenant.id : me.tenant;

  const [{ docs: products }, { docs: stores }, tenant, { docs: customers }, { levels: stockLevels }] =
    await Promise.all([
      payloadFetch<{ docs: Product[] }>('/api/products?sort=name&limit=1000'),
      payloadFetch<{ docs: StoreRef[] }>('/api/stores?sort=name&limit=100'),
      payloadFetch<TenantReceiptInfo>(`/api/tenants/${tenantId}`),
      payloadFetch<{ docs: CustomerRef[] }>('/api/customers?sort=name&limit=1000'),
      payloadFetch<{ levels: StockLevel[] }>('/api/reports/stock-levels'),
    ]);

  return (
    <SellClient me={me} products={products} stores={stores} tenant={tenant} customers={customers} stockLevels={stockLevels} />
  );
}
