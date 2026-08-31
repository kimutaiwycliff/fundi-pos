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
import { CustomerDialog } from './customer-dialog';

interface Customer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  loyaltyPoints: number;
}

export default async function CustomersPage() {
  const { docs: customers } = await payloadFetch<{ docs: Customer[] }>('/api/customers?sort=name&limit=200');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Customers</h1>
        <CustomerDialog />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="hidden sm:table-cell">Email</TableHead>
              <TableHead className="text-right">Loyalty points</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No customers yet.
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>{customer.name}</TableCell>
                  <TableCell>{customer.phone ?? '—'}</TableCell>
                  <TableCell className="hidden sm:table-cell">{customer.email ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary">{customer.loyaltyPoints}</Badge>
                  </TableCell>
                  <TableCell>
                    <CustomerDialog customer={customer} />
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
