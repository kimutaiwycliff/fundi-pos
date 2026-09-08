import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { NewPurchaseOrderForm } from './new-purchase-order-form';

type Store = { id: number; name: string };
type Supplier = { id: number; name: string };

export default async function NewPurchaseOrderPage() {
  const [me, { docs: stores }, { docs: suppliers }] = await Promise.all([
    getCurrentUser(),
    payloadFetch<{ docs: Store[] }>('/api/stores?sort=name&limit=100'),
    payloadFetch<{ docs: Supplier[] }>('/api/suppliers?sort=name&limit=100'),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New restock list</h1>
      <NewPurchaseOrderForm stores={stores} suppliers={suppliers} canSeeCost={me.role === 'owner' || me.role === 'manager'} />
    </div>
  );
}
