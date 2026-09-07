import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { payloadFetch } from '@/lib/payload-client';

type PurchaseOrderListItem = {
  id: number;
  store: { id: number; name: string } | number;
  supplier: { id: number; name: string } | number;
  status: 'draft' | 'sent' | 'received';
  lineItems: Array<{ quantity: number }>;
  createdAt: string;
};

const STATUS_VARIANT: Record<PurchaseOrderListItem['status'], 'secondary' | 'default' | 'outline'> = {
  draft: 'secondary',
  sent: 'default',
  received: 'outline',
};

export default async function PurchaseOrdersPage() {
  const { docs: orders } = await payloadFetch<{ docs: PurchaseOrderListItem[] }>(
    '/api/purchase-orders?sort=-createdAt&limit=50&depth=1',
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Restock lists</h1>
        <Button asChild>
          <Link href="/dashboard/purchase-orders/new">New restock list</Link>
        </Button>
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No restock lists yet. Create one to get started.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Store</th>
                <th className="p-3 font-medium">Supplier</th>
                <th className="p-3 font-medium">Items</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((po) => (
                <tr key={po.id} className="border-t hover:bg-muted/30">
                  <td className="p-3">
                    <Link href={`/dashboard/purchase-orders/${po.id}`} className="hover:underline">
                      {typeof po.store === 'object' ? po.store.name : `Store #${po.store}`}
                    </Link>
                  </td>
                  <td className="p-3">{typeof po.supplier === 'object' ? po.supplier.name : `#${po.supplier}`}</td>
                  <td className="p-3">{po.lineItems.length}</td>
                  <td className="p-3">
                    <Badge variant={STATUS_VARIANT[po.status]}>{po.status}</Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{new Date(po.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
