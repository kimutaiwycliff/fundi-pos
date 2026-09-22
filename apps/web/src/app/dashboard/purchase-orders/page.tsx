import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
import { DeletePurchaseOrderButton } from './delete-purchase-order-button';

type PurchaseOrderListItem = {
  id: number;
  store: { id: number; name: string } | number;
  supplier: { id: number; name: string } | number;
  status: 'draft' | 'sent' | 'partially_received' | 'received';
  lineItems: Array<{ quantity: number }>;
  createdAt: string;
};

const STATUS_VARIANT: Record<PurchaseOrderListItem['status'], 'secondary' | 'default' | 'outline'> = {
  draft: 'secondary',
  sent: 'default',
  partially_received: 'default',
  received: 'outline',
};

const STATUS_LABEL: Record<PurchaseOrderListItem['status'], string> = {
  draft: 'draft',
  sent: 'sent',
  partially_received: 'partially received',
  received: 'received',
};

export default async function PurchaseOrdersPage() {
  const { docs: orders } = await payloadFetch<{ docs: PurchaseOrderListItem[] }>(
    '/api/purchase-orders?sort=-createdAt&limit=50&depth=1',
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Restock lists</h1>
        <Button asChild>
          <Link href="/dashboard/purchase-orders/new">New restock list</Link>
        </Button>
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No restock lists yet. Create one to get started.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((po) => (
                <TableRow key={po.id}>
                  <TableCell>
                    <Link href={`/dashboard/purchase-orders/${po.id}`} className="hover:underline">
                      {typeof po.store === 'object' ? po.store.name : `Store #${po.store}`}
                    </Link>
                  </TableCell>
                  <TableCell>{typeof po.supplier === 'object' ? po.supplier.name : `#${po.supplier}`}</TableCell>
                  <TableCell>{po.lineItems.length}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[po.status]}>{STATUS_LABEL[po.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(po.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">{po.status === 'draft' ? <DeletePurchaseOrderButton id={po.id} /> : null}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
