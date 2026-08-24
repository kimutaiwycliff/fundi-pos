import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { ProductDialog } from './product-dialog';
import { ProductsTable } from './products-table';
import { ImportProductsDialog } from './import-dialog';

type Store = { id: number; name: string };

type Product = {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  category: string | null;
  // Absent entirely from the API response for non-owners (Products.ts's
  // field-level access.read) - never assume it's there.
  costPrice?: number;
  sellPrice: number;
  taxRate: number;
  reorderPoint?: number;
  maxDiscountPercent?: number;
};

export default async function ProductsPage() {
  const [{ docs: products }, { docs: stores }, me] = await Promise.all([
    payloadFetch<{ docs: Product[] }>('/api/products?sort=-createdAt&limit=500'),
    payloadFetch<{ docs: Store[] }>('/api/stores?sort=name&limit=100'),
    getCurrentUser(),
  ]);
  const canSeeCost = me.role === 'owner';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Products</h1>
        <div className="flex gap-2">
          <ImportProductsDialog stores={stores} />
          <ProductDialog />
        </div>
      </div>

      <ProductsTable products={products} canSeeCost={canSeeCost} />
    </div>
  );
}
