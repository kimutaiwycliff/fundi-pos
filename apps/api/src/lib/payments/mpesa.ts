import { initiateStkPush, parseStkCallback } from '../daraja.ts';
import type { PaymentProvider } from './types.ts';

// Thin adapter over lib/daraja.ts so the payments module has one uniform
// PaymentProvider surface regardless of provider - see types.ts.
export const mpesaProvider: PaymentProvider = {
  async initiate(req) {
    if (!req.phone) {
      throw new Error('M-Pesa STK Push requires a phone number');
    }
    const res = await initiateStkPush({
      phone: req.phone,
      amount: req.amount,
      accountReference: req.orderId,
      description: req.description,
      callbackUrl: req.callbackUrl,
    });
    return { providerReference: res.CheckoutRequestID };
  },
  async parseCallback(body) {
    const parsed = parseStkCallback(body);
    if (!parsed) return null;
    return { providerReference: parsed.checkoutRequestId, succeeded: parsed.succeeded };
  },
};
