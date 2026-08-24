import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { NewProductDialog } from './new-product-dialog';
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
};

export default async function ProductsPage() {
  const [{ docs: products }, { docs: stores }, me] = await Promise.all([
    payloadFetch<{ docs: Product[] }>('/api/products?sort=-createdAt&limit=100'),
    payloadFetch<{ docs: Store[] }>('/api/stores?sort=name&limit=100'),
    getCurrentUser(),
  ]);
  const canSeeCost = me.role === 'owner';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        <div className="flex gap-2">
          <ImportProductsDialog stores={stores} />
          <NewProductDialog />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              {canSeeCost ? <TableHead className="text-right">Cost</TableHead> : null}
              <TableHead className="text-right">Sell</TableHead>
              {canSeeCost ? <TableHead className="text-right">Margin</TableHead> : null}
              <TableHead className="text-right">Tax</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canSeeCost ? 7 : 5} className="text-center text-muted-foreground">
                  No products yet.
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>
                    {product.category ? <Badge variant="secondary">{product.category}</Badge> : '—'}
                  </TableCell>
                  {canSeeCost ? (
                    <TableCell className="text-right">{(product.costPrice ?? 0).toFixed(2)}</TableCell>
                  ) : null}
                  <TableCell className="text-right">{product.sellPrice.toFixed(2)}</TableCell>
                  {canSeeCost ? (
                    <TableCell className="text-right">
                      {(product.sellPrice - (product.costPrice ?? 0)).toFixed(2)}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right">{(product.taxRate * 100).toFixed(0)}%</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
