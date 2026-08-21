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

interface StockLevel {
  store: number;
  product: number;
  productName: string;
  quantity: number;
  reorderPoint: number;
  lowStock: boolean;
}

export default async function InventoryPage() {
  const { levels } = await payloadFetch<{ levels: StockLevel[] }>('/api/reports/stock-levels');
  const sorted = [...levels].sort((a, b) => Number(b.lowStock) - Number(a.lowStock));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Inventory levels</h1>
      <p className="text-sm text-muted-foreground">
        Current stock is always a derived sum over the StockMovements ledger - never a stored count.
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Store</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">Reorder point</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No stock movements yet.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((level) => (
                <TableRow key={`${level.store}-${level.product}`}>
                  <TableCell>{level.productName}</TableCell>
                  <TableCell>#{level.store}</TableCell>
                  <TableCell className="text-right">{level.quantity}</TableCell>
                  <TableCell className="text-right">{level.reorderPoint}</TableCell>
                  <TableCell>
                    {level.lowStock ? (
                      <Badge variant="destructive">Low stock</Badge>
                    ) : (
                      <Badge variant="secondary">OK</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
