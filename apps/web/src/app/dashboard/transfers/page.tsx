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
import { NewTransferDialog } from './new-transfer-dialog';
import { ReceiveButton } from './receive-button';

interface Transfer {
  id: number;
  fromStore: { id: number; name: string } | number;
  toStore: { id: number; name: string } | number;
  lineItems: Array<{ product: { name: string } | number; quantity: number }>;
  status: 'draft' | 'in_transit' | 'received';
}

function storeName(value: Transfer['fromStore']) {
  return typeof value === 'object' ? value.name : `#${value}`;
}

export default async function TransfersPage() {
  const [{ docs: transfers }, { docs: stores }, { docs: products }] = await Promise.all([
    payloadFetch<{ docs: Transfer[] }>('/api/stock-transfers?sort=-createdAt&limit=100&depth=1'),
    payloadFetch<{ docs: Array<{ id: number; name: string }> }>('/api/stores?limit=100'),
    payloadFetch<{ docs: Array<{ id: number; name: string; sku: string }> }>('/api/products?limit=200'),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Stock transfers</h1>
        <NewTransferDialog stores={stores} products={products} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transfers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No transfers yet.
                </TableCell>
              </TableRow>
            ) : (
              transfers.map((t) => {
                const itemsSummary = t.lineItems
                  .map((li) => `${typeof li.product === 'object' ? li.product.name : `#${li.product}`} x${li.quantity}`)
                  .join(', ');
                return (
                <TableRow key={t.id}>
                  <TableCell>{storeName(t.fromStore)}</TableCell>
                  <TableCell>{storeName(t.toStore)}</TableCell>
                  <TableCell className="max-w-64 truncate" title={itemsSummary}>
                    {itemsSummary}
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.status === 'received' ? 'secondary' : 'default'}>{t.status}</Badge>
                  </TableCell>
                  <TableCell>{t.status !== 'received' ? <ReceiveButton transferId={t.id} /> : null}</TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
