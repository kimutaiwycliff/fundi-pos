'use client';

import { useMemo, useState } from 'react';
import { Receipt, Search, SearchX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { formatDate, formatDateTime } from '@/lib/format-date';
import type { InvoiceData } from '@/lib/invoice-message';
import type { CreditPayment, ManagerRef, Order, TenantReceiptInfo } from './page';
import { SaleRowActions } from './sale-row-actions';

function amountPaidFor(orderId: string, paymentsByOrder: Record<string, CreditPayment[]>): number {
  return (paymentsByOrder[orderId] ?? []).reduce((sum, p) => sum + p.amount, 0);
}

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
function customerContact(value: Order['customer']) {
  if (typeof value !== 'object' || !value) return { phone: null, email: null };
  return { phone: value.phone, email: value.email };
}
function productLabel(value: Order['lineItems'][number]['product']) {
  // `typeof null === 'object'` - a line item whose product has since been
  // deleted populates as null, not the numeric id, so the null check must
  // come first or this throws reading `.name` off null.
  if (!value) return 'Deleted product';
  return typeof value === 'object' ? value.name : `#${value}`;
}
function toInvoiceData(order: Order): InvoiceData {
  return {
    orderId: order.id,
    createdAt: order.createdAt,
    customerName: customerLabel(order.customer),
    lines: order.lineItems.map((li) => ({
      label: productLabel(li.product),
      quantity: li.quantity,
      lineTotal: li.quantity * li.unitPrice - li.discount,
    })),
    total: order.total,
    isPaid: order.paymentStatus === 'paid',
    settledAtLabel: order.settledAt ? formatDate(order.settledAt) : null,
  };
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

function PaymentStatusBadge({ order, amountPaid }: { order: Order; amountPaid: number }) {
  if (order.paymentStatus === 'paid') {
    return <Badge variant="secondary">Paid</Badge>;
  }
  if (order.paymentStatus === 'failed') {
    return <Badge variant="destructive">Failed</Badge>;
  }
  // pending - a credit tab gets the attention-grabbing "Unpaid"/"Partial"
  // treatment (this is the state the page is built to surface); any other
  // pending tender (e.g. an M-Pesa STK push still awaiting confirmation) is
  // transient and gets a quieter label.
  if (order.tenderType === 'credit') {
    return (
      <Badge className="border-amber-600/30 bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
        {amountPaid > 0 ? `Partial (${amountPaid.toFixed(2)} of ${order.total.toFixed(2)})` : 'Unpaid'}
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
  paymentsByOrder,
}: {
  orders: Order[];
  tenant: TenantReceiptInfo;
  canSettle: boolean;
  managers: ManagerRef[];
  paymentsByOrder: Record<string, CreditPayment[]>;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

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
                const contact = customerContact(order.customer);
                return (
                  <TableRow key={order.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(order.createdAt)}</TableCell>
                    <TableCell>{storeName(order.store)}</TableCell>
                    <TableCell>{customerLabel(order.customer)}</TableCell>
                    <TableCell className="hidden lg:table-cell">{cashierLabel(order.cashier)}</TableCell>
                    <TableCell className="text-right">{order.total.toFixed(2)}</TableCell>
                    <TableCell>
                      <TenderBadge tenderType={order.tenderType} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <PaymentStatusBadge order={order} amountPaid={amountPaidFor(order.id, paymentsByOrder)} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <SaleRowActions
                          order={order}
                          tenant={tenant}
                          managers={managers}
                          canSettle={canSettle}
                          contact={contact}
                          invoiceData={toInvoiceData(order)}
                          payments={paymentsByOrder[order.id] ?? []}
                        />
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
