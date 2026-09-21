import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';

type QuotationListItem = {
  id: number;
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Quotations</h1>
        <Button asChild>
          <Link href="/dashboard/quotations/new">New quotation</Link>
        </Button>
      </div>

      {quotations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No quotations yet. Create one to get started.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Customer</th>
                <th className="p-3 font-medium">Total</th>
                <th className="p-3 font-medium">Created</th>
                <th className="p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((q) => (
                <tr key={q.id} className="border-t hover:bg-muted/30">
                  <td className="p-3">
                    <Link href={`/dashboard/quotations/${q.id}`} className="hover:underline">
                      {q.customerName || `Quotation #${q.id}`}
                    </Link>
                  </td>
                  <td className="p-3">{q.total.toFixed(2)}</td>
                  <td className="p-3 text-muted-foreground">{new Date(q.createdAt).toLocaleDateString()}</td>
                  <td className="p-3 text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/dashboard/quotations/${q.id}`}>View</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
