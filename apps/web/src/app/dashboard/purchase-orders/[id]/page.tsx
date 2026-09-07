import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { PurchaseOrderActions } from './purchase-order-actions';
import { ReceiveChecklist } from './receive-checklist';

type PurchaseOrderDetail = {
  id: number;
  store: { id: number; name: string };
  supplier: { id: number; name: string };
  status: 'draft' | 'sent' | 'partially_received' | 'received';
  createdAt: string;
  receivedAt: string | null;
  lineItems: Array<{
    product: { id: number; name: string; variants?: Array<{ id: string; label: string }> };
    variant: string | null;
    quantity: number;
    unitCost: number;
    receivedQuantity: number;
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
          {po.store.name} · {po.supplier.name} · {po.status.replace('_', ' ')}
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
        document={{
          poNumber: `PO-${po.id}`,
          storeName: po.store.name,
          supplierName: po.supplier.name,
          createdAtLabel: new Date(po.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
          lines,
          estimatedTotal,
        }}
      />

      {(me.role === 'owner' || me.role === 'manager') && po.status !== 'received' ? (() => {
        const checklistLines = po.lineItems
          .map((l, index) => ({
            index,
            label: l.product?.name ?? `#${l.product}` + (l.variant ? ` (${l.product?.variants?.find((v) => v.id === l.variant)?.label})` : ''),
            outstanding: l.quantity - (l.receivedQuantity ?? 0),
          }))
          .filter((l) => l.outstanding > 0);
        return (
          <ReceiveChecklist
            // Forces a remount (fresh initial checkbox/quantity state) any
            // time the outstanding amounts actually change, e.g. right
            // after a partial receive - otherwise the input's useState
            // initializer only runs once and keeps showing the pre-receive
            // quantity even though the server-side outstanding total moved.
            key={checklistLines.map((l) => `${l.index}:${l.outstanding}`).join(',')}
            poId={po.id}
            lines={checklistLines}
          />
        );
      })() : null}
    </div>
  );
}
