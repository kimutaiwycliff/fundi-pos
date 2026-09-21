import { redirect } from 'next/navigation';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { SendQuotationButtons } from '@/components/invoice/send-quotation-buttons';

interface QuotationDetail {
  id: number;
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  createdAt: string;
  lineItems: Array<{
    // May come back populated (object) or bare (id) depending on depth -
    // unused here either way, since `label` is already a plain-text
    // snapshot the PDF (and this page) can render directly.
    product: number | { id: number };
    variant: string | null;
    label: string;
    quantity: number;
    unitPrice: number;
  }>;
  total: number;
}

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  // Same manager/owner gate as the list/new pages.
  if (me.role !== 'owner' && me.role !== 'manager') redirect('/dashboard');

  const tenantId = typeof me.tenant === 'object' ? me.tenant.id : me.tenant;
  const [quotation, tenant] = await Promise.all([
    payloadFetch<QuotationDetail>(`/api/quotations/${id}`),
    payloadFetch<{ name: string }>(`/api/tenants/${tenantId}`),
  ]);

  const whatsappMessage = `Hi${quotation.customerName ? ' ' + quotation.customerName : ''}, here's your quotation from ${tenant.name}.`;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Quotation #{quotation.id}</h1>
        <p className="text-sm text-muted-foreground">
          {quotation.customerName || 'Walk-in customer'}
          {quotation.customerPhone ? ` · ${quotation.customerPhone}` : ''} ·{' '}
          {new Date(quotation.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Item</th>
              <th className="p-3 font-medium">Qty</th>
              <th className="p-3 font-medium">Unit price</th>
              <th className="p-3 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {quotation.lineItems.map((line, i) => (
              <tr key={i} className="border-t">
                <td className="p-3">{line.label}</td>
                <td className="p-3">{line.quantity}</td>
                <td className="p-3">{line.unitPrice.toFixed(2)}</td>
                <td className="p-3">{(line.quantity * line.unitPrice).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-right text-lg font-semibold">Total: {quotation.total.toFixed(2)}</p>

      {quotation.notes ? (
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">Notes</p>
          <p className="text-sm whitespace-pre-wrap">{quotation.notes}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline">
          <a href={`/api/payload/quotations/${quotation.id}/quotation-pdf`} target="_blank" rel="noopener noreferrer">
            <Download data-icon="inline-start" />
            Download PDF
          </a>
        </Button>
        {quotation.customerPhone ? (
          <SendQuotationButtons
            quotationId={String(quotation.id)}
            phone={quotation.customerPhone}
            message={whatsappMessage}
          />
        ) : null}
      </div>
    </div>
  );
}
