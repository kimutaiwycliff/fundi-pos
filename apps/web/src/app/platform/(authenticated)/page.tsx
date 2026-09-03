import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { platformFetch } from '@/lib/platform-client';

type Tenant = {
  id: number;
  name: string;
  status: 'active' | 'suspended' | 'deleted';
  subscriptionTier: string;
  billingStatus: string;
  createdAt: string;
};

function statusVariant(status: Tenant['status']): 'secondary' | 'destructive' {
  return status === 'active' ? 'secondary' : 'destructive';
}

export default async function PlatformTenantsPage() {
  const { docs: tenants } = await platformFetch<{ docs: Tenant[] }>('/api/tenants?limit=200&sort=-createdAt&depth=0');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Tenants</h1>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Subscription</TableHead>
              <TableHead>Billing</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell className="font-medium">
                  <Link href={`/platform/tenants/${tenant.id}`} className="underline-offset-2 hover:underline">
                    {tenant.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(tenant.status)} className="capitalize">
                    {tenant.status}
                  </Badge>
                </TableCell>
                <TableCell className="capitalize">{tenant.subscriptionTier}</TableCell>
                <TableCell className="capitalize">{tenant.billingStatus.replace('_', ' ')}</TableCell>
                <TableCell>{new Date(tenant.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
