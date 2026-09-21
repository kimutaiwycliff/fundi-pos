import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { renderToBuffer } from '@react-pdf/renderer';
import { isTenantUser, toID } from '@/lib/relations';
import { QuotationDocument, type QuotationData } from '@/lib/quotation-pdf';

// Mirrors apps/api/src/app/api/orders/[id]/invoice-pdf/route.tsx exactly
// (auth -> tenant-scoped findByID -> render -> inline PDF response),
// against the quotations collection instead of orders. No stock/shift/
// tender concerns here at all - a quotation is just a document.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const requestingTenant = toID(user.tenant);

  const quotation = await payload.findByID({ collection: 'quotations', id, depth: 1, overrideAccess: true }).catch(() => null);
  if (!quotation || toID(quotation.tenant) !== requestingTenant) {
    return Response.json({ error: 'Quotation not found' }, { status: 404 });
  }

  const tenant = await payload.findByID({ collection: 'tenants', id: requestingTenant, overrideAccess: true });

  const preparedByLabel =
    quotation.createdBy && typeof quotation.createdBy === 'object'
      ? (quotation.createdBy.name ?? quotation.createdBy.email)
      : 'Staff';

  const data: QuotationData = {
    quotationId: String(quotation.id),
    createdAtLabel: new Date(quotation.createdAt).toLocaleString(),
    preparedByLabel,
    customerLabel: quotation.customerName ?? null,
    notes: quotation.notes ?? null,
    lines: quotation.lineItems.map((line) => ({
      label: line.label,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.quantity * line.unitPrice,
    })),
    total: quotation.total,
  };

  const pdfBuffer = await renderToBuffer(
    <QuotationDocument
      data={data}
      tenant={{ name: tenant.name, receiptHeader: tenant.receiptHeader, receiptFooter: tenant.receiptFooter }}
    />,
  );

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="quotation-${id}.pdf"`,
    },
  });
}
