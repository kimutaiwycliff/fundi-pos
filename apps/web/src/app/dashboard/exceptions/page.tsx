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

interface FlaggedMovement {
  id: string;
  quantityDelta: number;
  reason: string;
  sourceTerminal: string;
  createdAt: string;
  product: { name: string } | number;
  store: { name: string } | number;
}

export default async function ExceptionsPage() {
  const { docs } = await payloadFetch<{ docs: FlaggedMovement[] }>(
    '/api/stock-movements?where[flaggedForReview][equals]=true&sort=-createdAt&limit=100&depth=1',
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Stock exceptions</h1>
      <p className="text-sm text-muted-foreground">
        Movements that drove a product&apos;s stock negative - never auto-corrected (spec Section 5). Review and
        resolve manually (backorder, apology, substitute, or a compensating adjustment).
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Store</TableHead>
              <TableHead className="text-right">Delta</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Terminal</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No exceptions - nothing has gone negative.
                </TableCell>
              </TableRow>
            ) : (
              docs.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{typeof m.product === 'object' ? m.product.name : `#${m.product}`}</TableCell>
                  <TableCell>{typeof m.store === 'object' ? m.store.name : `#${m.store}`}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="destructive">{m.quantityDelta}</Badge>
                  </TableCell>
                  <TableCell>{m.reason}</TableCell>
                  <TableCell>{m.sourceTerminal}</TableCell>
                  <TableCell>{new Date(m.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
