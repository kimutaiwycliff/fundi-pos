import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { renderToBuffer } from '@react-pdf/renderer';
import { isTenantUser, toID } from '@/lib/relations';
import { InvoiceDocument, type ReceiptOrderData } from '@/lib/invoice-pdf';

// A real A4 PDF invoice for the web dashboard's WhatsApp/download flow,
// matching the design mobile already has (see invoice-pdf.tsx's own
// comment) - this route builds the ReceiptOrderData from a real order the
// same way apps/mobile/src/sales/SalesScreen.tsx's buildReceiptData does,
// then renders it server-side so the client never needs its own PDF
// dependency.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const requestingTenant = toID(user.tenant);

  const order = await payload.findByID({ collection: 'orders', id, depth: 2, overrideAccess: true }).catch(() => null);
  if (!order || toID(order.tenant) !== requestingTenant) {
    return Response.json({ error: 'Order not found' }, { status: 404 });
  }

  const tenant = await payload.findByID({ collection: 'tenants', id: requestingTenant, overrideAccess: true });

  const cashierLabel =
    typeof order.cashier === 'object' ? (order.cashier.name ?? order.cashier.email) : `Unknown (#${order.cashier})`;

  const customerLabel =
    order.customer && typeof order.customer === 'object' ? (order.customer.name ?? order.customer.phone ?? null) : null;

  const data: ReceiptOrderData = {
    orderId: order.id,
    createdAtLabel: new Date(order.createdAt).toLocaleString(),
    cashierLabel,
    customerLabel,
    terminalLabel: order.terminalName ?? null,
    lines: order.lineItems.map((line) => ({
      label: typeof line.product === 'object' ? line.product.name : `Deleted product (#${line.product})`,
      quantity: line.quantity,
      lineTotal: line.quantity * line.unitPrice - line.discount,
    })),
    taxTotal: order.taxTotal,
    discountTotal: order.discountTotal,
    total: order.total,
    tenderType: order.tenderType,
    isUnpaidCredit: order.tenderType === 'credit' && order.paymentStatus === 'pending',
  };

  const pdfBuffer = await renderToBuffer(
    <InvoiceDocument
      data={data}
      tenant={{ name: tenant.name, receiptHeader: tenant.receiptHeader, receiptFooter: tenant.receiptFooter }}
    />,
  );

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="invoice-${id}.pdf"`,
    },
  });
}
