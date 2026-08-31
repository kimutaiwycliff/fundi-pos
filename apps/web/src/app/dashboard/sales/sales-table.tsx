'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Receipt, Search, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import type { ManagerRef, Order, TenantReceiptInfo } from './page';
import { ReceiptDialog } from './receipt-dialog';
import { VoidOrderDialog } from './void-order-dialog';

type StatusFilter = 'all' | 'unpaid' | 'paid' | 'voided' | 'refunded';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'voided', label: 'Voided' },
  { value: 'refunded', label: 'Refunded' },
];

function storeName(value: Order['store']) {
  return typeof value === 'object' ? value.name : `Store #${value}`;
}
function cashierLabel(value: Order['cashier']) {
  if (typeof value !== 'object') return `#${value}`;
  return value.name || value.email;
}
function customerLabel(value: Order['customer']) {
  if (!value) return 'Walk-in';
  return typeof value === 'object' ? value.name : `#${value}`;
}
function customerPhone(value: Order['customer']) {
  return typeof value === 'object' && value ? value.phone : '';
}

// The whole reason this page exists: a credit ("buy now, pay later") sale
// stays paymentStatus 'pending' until someone settles it - this predicate
// is the single source of truth for what counts as an outstanding tab,
// shared by the filter, the count badge, and the settle-button gate below.
function isUnpaidCredit(order: Order) {
  return order.tenderType === 'credit' && order.paymentStatus === 'pending';
}

const TENDER_LABEL: Record<Order['tenderType'], string> = {
  cash: 'Cash',
  mpesa: 'M-Pesa',
  card: 'Card',
  credit: 'Credit',
};

function TenderBadge({ tenderType }: { tenderType: Order['tenderType'] }) {
  return <Badge variant={tenderType === 'credit' ? 'secondary' : 'outline'}>{TENDER_LABEL[tenderType]}</Badge>;
}

function PaymentStatusBadge({ order }: { order: Order }) {
  if (order.paymentStatus === 'paid') {
    return <Badge variant="secondary">Paid</Badge>;
  }
  if (order.paymentStatus === 'failed') {
    return <Badge variant="destructive">Failed</Badge>;
  }
  // pending - a credit tab gets the attention-grabbing "Unpaid" treatment
  // (this is the state the page is built to surface); any other pending
  // tender (e.g. an M-Pesa STK push still awaiting confirmation) is
  // transient and gets a quieter label.
  if (order.tenderType === 'credit') {
    return (
      <Badge className="border-amber-600/30 bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
        Unpaid
      </Badge>
    );
  }
  return <Badge variant="outline">Pending</Badge>;
}

function StatusBadge({ status }: { status: Order['status'] }) {
  if (status === 'voided') return <Badge variant="destructive">Voided</Badge>;
  if (status === 'refunded') return <Badge variant="outline">Refunded</Badge>;
  return <Badge variant="secondary">Completed</Badge>;
}

export function SalesTable({
  orders,
  tenant,
  canSettle,
  managers,
}: {
  orders: Order[];
  tenant: TenantReceiptInfo;
  canSettle: boolean;
  managers: ManagerRef[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [settlingId, setSettlingId] = useState<string | null>(null);

  const unpaidCount = useMemo(() => orders.filter(isUnpaidCredit).length, [orders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return orders.filter((order) => {
      if (status === 'unpaid' && !isUnpaidCredit(order)) return false;
      if (status === 'paid' && order.paymentStatus !== 'paid') return false;
      if (status === 'voided' && order.status !== 'voided') return false;
      if (status === 'refunded' && order.status !== 'refunded') return false;

      if (!q) return true;
      const haystack = [
        order.id,
        order.id.slice(0, 8),
        customerLabel(order.customer),
        customerPhone(order.customer),
        typeof order.cashier === 'object' ? order.cashier.name ?? '' : '',
        typeof order.cashier === 'object' ? order.cashier.email : '',
        order.terminal,
        order.terminalName ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [orders, query, status]);

  async function handleSettle(order: Order) {
    setSettlingId(order.id);
    const response = await fetch(`/api/payload/orders/${order.id}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      toast.error(body?.error ?? 'Failed to settle sale');
      setSettlingId(null);
      return;
    }

    toast.success('Sale marked as settled');
    setSettlingId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by order, customer, cashier, or terminal..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {unpaidCount > 0 ? (
          <Badge className="border-amber-600/30 bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
            {unpaidCount} unpaid
          </Badge>
        ) : null}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden lg:table-cell">Cashier</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Tender</TableHead>
              <TableHead className="hidden lg:table-cell">Payment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9}>
                  {orders.length === 0 ? (
                    <EmptyState icon={Receipt} title="No sales yet" />
                  ) : (
                    <EmptyState icon={SearchX} title="No sales match your search" />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((order) => {
                const canShowSettle =
                  canSettle && order.tenderType === 'credit' && order.paymentStatus === 'pending' && order.status === 'completed';
                const canShowVoid = order.status === 'completed';
                return (
                  <TableRow key={order.id}>
                    <TableCell className="whitespace-nowrap">{new Date(order.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{storeName(order.store)}</TableCell>
                    <TableCell>{customerLabel(order.customer)}</TableCell>
                    <TableCell className="hidden lg:table-cell">{cashierLabel(order.cashier)}</TableCell>
                    <TableCell className="text-right">{order.total.toFixed(2)}</TableCell>
                    <TableCell>
                      <TenderBadge tenderType={order.tenderType} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <PaymentStatusBadge order={order} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <ReceiptDialog order={order} tenant={tenant} />
                        {canShowVoid ? <VoidOrderDialog order={order} managers={managers} /> : null}
                        {canShowSettle ? (
                          <Button
                            size="lg"
                            disabled={settlingId === order.id}
                            onClick={() => handleSettle(order)}
                          >
                            {settlingId === order.id ? 'Settling…' : 'Mark as settled'}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {query || status !== 'all' ? (
        <p className="text-xs text-muted-foreground">
          {filtered.length} of {orders.length} sales
        </p>
      ) : null}
    </div>
  );
}
