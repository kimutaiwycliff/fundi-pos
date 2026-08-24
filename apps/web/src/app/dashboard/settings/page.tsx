import { redirect } from 'next/navigation';
import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { SettingsForm } from './settings-form';

interface Tenant {
  id: number;
  name: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
}

export default async function SettingsPage() {
  const me = await getCurrentUser();
  // Tenants.update is owner-only at the API layer already - redirecting
  // here too so a manager/cashier doesn't land on a form that will just
  // reject their save.
  if (me.role !== 'owner') redirect('/dashboard');

  const tenantId = typeof me.tenant === 'object' ? me.tenant.id : me.tenant;
  const tenant = await payloadFetch<Tenant>(`/api/tenants/${tenantId}`);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsForm tenant={tenant} />
    </div>
  );
}
