// Provider-agnostic payment interface (build plan Phase 7 / research finding
// #3: Pesapal is the default card-present adapter for Kenya, but the
// business-logic layer and Orders collection should never hard-code against
// one provider - a swap to DPO Network or another Pesapal-alike should only
// touch the adapter implementing this interface, not its callers.
export interface PaymentInitiateRequest {
  orderId: string;
  amount: number;
  phone?: string;
  description: string;
  callbackUrl: string;
}

export interface PaymentInitiateResult {
  // Opaque provider reference correlating an async callback back to this
  // payment attempt (Daraja's CheckoutRequestID, Pesapal's OrderTrackingId,
  // etc). Stored on Order so the callback handler can look the order back up.
  providerReference: string;
  // Present only for redirect-based flows (Pesapal's hosted checkout page) -
  // absent for phone-prompt flows (M-Pesa STK Push has nothing to redirect to).
  redirectUrl?: string;
}

export interface PaymentCallbackResult {
  providerReference: string;
  succeeded: boolean;
}

export interface PaymentProvider {
  initiate(request: PaymentInitiateRequest): Promise<PaymentInitiateResult>;
  // Async because Pesapal's IPN callback carries no success/failure itself -
  // resolving one requires a second live call (GetTransactionStatus). M-Pesa's
  // callback is self-contained, so its adapter just wraps a sync parse in a
  // resolved promise.
  parseCallback(body: unknown): Promise<PaymentCallbackResult | null>;
}
