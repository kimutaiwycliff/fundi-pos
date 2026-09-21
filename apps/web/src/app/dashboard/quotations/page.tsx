import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';

type QuotationListItem = {
  id: number;
  name: string | null;
  customerName: string | null;
  total: number;
  createdAt: string;
};

export default async function QuotationsPage() {
  const me = await getCurrentUser();
  // Quotations.ts's access control is manager/owner only for every
  // operation - redirecting here too so a cashier doesn't land on a list
  // that a 403 would otherwise leave empty/broken, same pattern as
  // settings/page.tsx.
  if (me.role !== 'owner' && me.role !== 'manager') redirect('/dashboard');

  const { docs: quotations } = await payloadFetch<{ docs: QuotationListItem[] }>(
    '/api/quotations?sort=-createdAt&limit=200',
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Quotations</h1>
        <Button asChild>
          <Link href="/dashboard/quotations/new">New quotation</Link>
        </Button>
      </div>

      {quotations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No quotations yet. Create one to get started.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotations.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>
                    <Link href={`/dashboard/quotations/${q.id}`} className="hover:underline">
                      {q.name || q.customerName || `Quotation #${q.id}`}
                    </Link>
                  </TableCell>
                  <TableCell>{q.total.toFixed(2)}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(q.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/dashboard/quotations/${q.id}`}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
