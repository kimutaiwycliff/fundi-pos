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

interface AuditEntry {
  id: number;
  action:
    | 'price_changed'
    | 'order_voided'
    | 'order_refunded'
    | 'sale_settled'
    | 'login'
    | 'login_blocked'
    | 'staff_created'
    | 'staff_banned'
    | 'staff_reactivated'
    | 'staff_deleted'
    | 'store_created'
    | 'store_deleted';
  entityType: string;
  summary: string;
  actor: { email: string } | number;
  createdAt: string;
}

const ACTION_LABELS: Record<AuditEntry['action'], string> = {
  price_changed: 'Price changed',
  order_voided: 'Order voided',
  order_refunded: 'Order refunded',
  sale_settled: 'Credit sale settled',
  login: 'Login',
  login_blocked: 'Login blocked',
  staff_created: 'Staff added',
  staff_banned: 'Staff banned',
  staff_reactivated: 'Staff reactivated',
  staff_deleted: 'Staff deleted',
  store_created: 'Branch created',
  store_deleted: 'Branch deleted',
};
const ACTION_VARIANTS: Record<AuditEntry['action'], 'secondary' | 'destructive'> = {
  price_changed: 'secondary',
  order_voided: 'destructive',
  order_refunded: 'destructive',
  sale_settled: 'secondary',
  login: 'secondary',
  login_blocked: 'destructive',
  staff_created: 'secondary',
  staff_banned: 'destructive',
  staff_reactivated: 'secondary',
  staff_deleted: 'destructive',
  store_created: 'secondary',
  store_deleted: 'destructive',
};

export default async function AuditLogPage() {
  const { docs: entries } = await payloadFetch<{ docs: AuditEntry[] }>('/api/audit-log?sort=-createdAt&limit=200&depth=1');

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every price change, voided/refunded/settled sale, login attempt, and staff/branch change, and who did it -
          never editable, same as the sales ledger itself.
        </p>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Nothing logged yet.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ACTION_VARIANTS[entry.action]}>{ACTION_LABELS[entry.action]}</Badge>
                  </TableCell>
                  <TableCell className="max-w-sm min-w-48 whitespace-normal">{entry.summary}</TableCell>
                  <TableCell>{typeof entry.actor === 'object' ? entry.actor.email : `#${entry.actor}`}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
