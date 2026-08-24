// KRA eTIMS groundwork (build plan Phase 8). eTIMS is already mandatory for
// VAT-registered businesses, but wiring a real OSCU/VSCU submission requires
// a formal KRA vendor-certification process (Bio Data Form, sandbox testing
// against etims-sbx.kra.go.ke) that is a business/paperwork lead time, not
// an engineering task, and cannot be completed from this environment. This
// stubs the interface so the Orders schema (kraInvoiceNumber/kraQrCode/
// kraCuSerial/kraSubmissionStatus, already on the collection since Phase 1)
// needs no migration once certification lands - only this file's
// implementation changes.
export interface EtimsInvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export interface EtimsInvoiceRequest {
  orderId: string;
  items: EtimsInvoiceItem[];
  totalTax: number;
  total: number;
}

export interface EtimsSubmissionResult {
  invoiceNumber: string;
  qrCode: string;
  cuSerial: string;
}

export interface EtimsProvider {
  submitInvoice(req: EtimsInvoiceRequest): Promise<EtimsSubmissionResult>;
}

// Shapes an order into the item/tax structure KRA's OSCU/VSCU invoice
// submission documents describe - pure, independently testable ahead of
// having real credentials to submit anything against.
export function buildEtimsInvoiceRequest(order: {
  id: string;
  taxTotal: number;
  total: number;
  lineItems: Array<{ productName: string; quantity: number; unitPrice: number; taxRate: number }>;
}): EtimsInvoiceRequest {
  return {
    orderId: order.id,
    items: order.lineItems.map((line) => ({
      description: line.productName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
    })),
    totalTax: order.taxTotal,
    total: order.total,
  };
}

// No-op mock standing in for a real OSCU/VSCU call. Deliberately deterministic
// (not random - Math.random()/crypto isn't the concern here, predictability
// for tests is) so it's obvious in any output that these are NOT real KRA
// values - never wire this into a receipt template as if it were certified.
export const stubEtimsProvider: EtimsProvider = {
  async submitInvoice(req) {
    return {
      invoiceNumber: `STUB-${req.orderId}`,
      qrCode: `stub-not-a-real-kra-qr:${req.orderId}`,
      cuSerial: 'STUB-CU-0000',
    };
  },
};
