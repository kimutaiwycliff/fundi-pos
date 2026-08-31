import { TENDER_LABEL, type ReceiptData, type TenantReceiptInfo } from './types';

// Shared by the Sales page's reprint dialog and the Sell page's post-sale
// receipt - both build a ReceiptData from whatever they have on hand (a
// re-fetched Order vs. live cart state) and render through this one view, so
// the two can never drift out of sync with each other.
export function ReceiptView({ data, tenant }: { data: ReceiptData; tenant: TenantReceiptInfo }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
      <p className="text-center font-bold">{tenant.name}</p>
      {tenant.receiptHeader ? <p className="text-center whitespace-pre-wrap">{tenant.receiptHeader}</p> : null}
      <div className="my-2 border-t border-dashed" />
      <p>
        Order #{data.orderId.slice(0, 8)} · {new Date(data.createdAt).toLocaleString()}
      </p>
      <p>Cashier: {data.cashierLabel}</p>
      {data.customerLabel ? <p>Customer: {data.customerLabel}</p> : null}
      <div className="my-2 border-t border-dashed" />
      {data.lines.map((line, idx) => (
        <div key={idx} className="flex justify-between gap-2">
          <span className="truncate">
            {line.label} x{line.quantity}
          </span>
          <span className="shrink-0">{line.lineTotal.toFixed(2)}</span>
        </div>
      ))}
      <div className="my-2 border-t border-dashed" />
      {data.isUnpaidCredit ? (
        <p className="mb-2 rounded border border-destructive/40 bg-destructive/10 p-1.5 text-center font-bold text-destructive">
          UNPAID — pay on settlement
        </p>
      ) : data.isSettledCredit && data.settledAtLabel ? (
        <p className="mb-2 text-center text-muted-foreground">Settled {data.settledAtLabel}</p>
      ) : null}
      <div className="flex justify-between">
        <span>Tax</span>
        <span>{data.taxTotal.toFixed(2)}</span>
      </div>
      {data.discountTotal > 0 ? (
        <div className="flex justify-between">
          <span>Discount</span>
          <span>-{data.discountTotal.toFixed(2)}</span>
        </div>
      ) : null}
      <div className="flex justify-between font-bold">
        <span>Total</span>
        <span>{data.total.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span>Tender</span>
        <span>{TENDER_LABEL[data.tenderType]}</span>
      </div>
      {tenant.receiptFooter ? (
        <>
          <div className="my-2 border-t border-dashed" />
          <p className="text-center whitespace-pre-wrap">{tenant.receiptFooter}</p>
        </>
      ) : null}
    </div>
  );
}
