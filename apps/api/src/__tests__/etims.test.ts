import { describe, expect, it } from 'vitest';
import { buildEtimsInvoiceRequest, stubEtimsProvider } from '../lib/etims.ts';

describe('buildEtimsInvoiceRequest', () => {
  it('shapes an order into KRA\'s documented item/tax invoice structure', () => {
    const req = buildEtimsInvoiceRequest({
      id: 'order-1',
      taxTotal: 27.59,
      total: 200,
      lineItems: [{ productName: 'Claw Hammer 16oz', quantity: 2, unitPrice: 100, taxRate: 0.16 }],
    });

    expect(req).toEqual({
      orderId: 'order-1',
      items: [{ description: 'Claw Hammer 16oz', quantity: 2, unitPrice: 100, taxRate: 0.16 }],
      totalTax: 27.59,
      total: 200,
    });
  });
});

describe('stubEtimsProvider', () => {
  it('returns clearly-marked placeholder values, never mistakable for a real KRA submission', async () => {
    const result = await stubEtimsProvider.submitInvoice({
      orderId: 'order-1', items: [], totalTax: 0, total: 0,
    });

    expect(result.invoiceNumber).toContain('STUB');
    expect(result.qrCode).toContain('stub-not-a-real-kra-qr');
    expect(result.cuSerial).toContain('STUB');
  });
});
