import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { PurchaseOrderActions } from './purchase-order-actions';

type PurchaseOrderDetail = {
  id: number;
  store: { id: number; name: string };
  supplier: { id: number; name: string };
  status: 'draft' | 'sent' | 'received';
  createdAt: string;
  receivedAt: string | null;
  lineItems: Array<{
    product: { id: number; name: string; variants?: Array<{ id: string; label: string }> };
    variant: string | null;
    quantity: number;
    unitCost: number;
  }>;
};

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, po] = await Promise.all([
    getCurrentUser(),
    payloadFetch<PurchaseOrderDetail>(`/api/purchase-orders/${id}?depth=1`),
  ]);
  const canSeeCost = me.role === 'owner';

  const lines = po.lineItems.map((l) => ({
    productName: l.product?.name ?? `#${l.product}`,
    variantLabel: l.variant ? (l.product?.variants?.find((v) => v.id === l.variant)?.label ?? null) : null,
    quantity: l.quantity,
    unitCost: canSeeCost ? l.unitCost : null,
  }));
  const estimatedTotal = canSeeCost ? po.lineItems.reduce((sum, l) => sum + l.quantity * l.unitCost, 0) : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Restock list #{po.id}</h1>
        <p className="text-sm text-muted-foreground">
          {po.store.name} · {po.supplier.name} · {po.status}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Item</th>
              <th className="p-3 font-medium">Qty</th>
              {canSeeCost ? <th className="p-3 font-medium">Unit cost</th> : null}
            </tr>
          </thead>
          <tbody>
            {po.lineItems.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="p-3">
                  {l.product?.name ?? `#${l.product}`}
                  {l.variant ? (
                    <span className="text-muted-foreground"> ({l.product?.variants?.find((v) => v.id === l.variant)?.label})</span>
                  ) : null}
                </td>
                <td className="p-3">{l.quantity}</td>
                {canSeeCost ? <td className="p-3">{l.unitCost.toFixed(2)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {estimatedTotal !== null ? <p className="text-right text-lg font-semibold">Estimated total: {estimatedTotal.toFixed(2)}</p> : null}

      <PurchaseOrderActions
        poId={po.id}
        status={po.status}
        canReceive={me.role === 'owner' || me.role === 'manager'}
        document={{
          poNumber: `PO-${po.id}`,
          storeName: po.store.name,
          supplierName: po.supplier.name,
          createdAtLabel: new Date(po.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
          lines,
          estimatedTotal,
        }}
      />
    </div>
  );
}
