import type { PaymentCallbackResult, PaymentInitiateRequest, PaymentInitiateResult, PaymentProvider } from './types.ts';

// Pesapal API v3 (research finding #3: Kenyan-licensed, bundles M-Pesa+card
// on one integration - the default card-present adapter). UNVERIFIED against
// the real Pesapal sandbox/production (no credentials in this environment) -
// shaped strictly from Pesapal's published API v3 reference
// (developer.pesapal.com), same "verify what's independently verifiable"
// approach as lib/daraja.ts: the request/response shapes and status mapping
// are pure functions tested below; the three live HTTP calls are not.
const PESAPAL_BASE_URL = process.env.PESAPAL_BASE_URL || 'https://cybqa.pesapal.com/pesapalv3';

interface PesapalAuthResponse {
  token: string;
  expiryDate: string;
  error: unknown;
  status: string;
}

export async function getPesapalAccessToken(): Promise<string> {
  const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
  const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    throw new Error('PESAPAL_CONSUMER_KEY / PESAPAL_CONSUMER_SECRET not configured');
  }

  const res = await fetch(`${PESAPAL_BASE_URL}/api/Auth/RequestToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ consumer_key: consumerKey, consumer_secret: consumerSecret }),
  });
  if (!res.ok) {
    throw new Error(`Pesapal auth failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as PesapalAuthResponse;
  if (body.status !== '200' || !body.token) {
    throw new Error(`Pesapal auth rejected: ${JSON.stringify(body.error ?? body)}`);
  }
  return body.token;
}

export interface PesapalOrderRequestBody {
  id: string;
  currency: 'KES';
  amount: number;
  description: string;
  callback_url: string;
  notification_id: string;
  billing_address: { phone_number?: string; email_address: string; country_code: 'KE' };
}

// Pure - the exact JSON body Pesapal's SubmitOrderRequest expects. No email
// is collected at a till, so a synthesized placeholder is used - Pesapal
// requires the field to be present but does not appear to validate its
// deliverability for a card-present transaction (unverified assumption,
// flagged since it can't be checked against a real sandbox from here).
export function buildPesapalOrderRequest(
  req: PaymentInitiateRequest,
  notificationId: string,
): PesapalOrderRequestBody {
  return {
    id: req.orderId,
    currency: 'KES',
    amount: req.amount,
    description: req.description,
    callback_url: req.callbackUrl,
    notification_id: notificationId,
    billing_address: {
      phone_number: req.phone,
      email_address: `${req.orderId}@no-reply.hardware-pos.invalid`,
      country_code: 'KE',
    },
  };
}

interface PesapalOrderResponse {
  order_tracking_id: string;
  merchant_reference: string;
  redirect_url: string;
  error: unknown;
  status: string;
}

export async function submitPesapalOrder(
  req: PaymentInitiateRequest,
  notificationId: string,
): Promise<PaymentInitiateResult> {
  const token = await getPesapalAccessToken();
  const res = await fetch(`${PESAPAL_BASE_URL}/api/Transactions/SubmitOrderRequest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(buildPesapalOrderRequest(req, notificationId)),
  });
  if (!res.ok) {
    throw new Error(`Pesapal SubmitOrderRequest failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as PesapalOrderResponse;
  if (body.status !== '200' || !body.order_tracking_id) {
    throw new Error(`Pesapal rejected order: ${JSON.stringify(body.error ?? body)}`);
  }
  return { providerReference: body.order_tracking_id, redirectUrl: body.redirect_url };
}

// Pesapal's documented numeric transaction statuses (GetTransactionStatus's
// `status_code`): 0=INVALID, 1=COMPLETED, 2=FAILED, 3=REVERSED. Pure and
// independently testable against the published enum without a live call.
export function isPesapalStatusSuccessful(statusCode: number): boolean {
  return statusCode === 1;
}

interface PesapalStatusResponse {
  payment_status_description: string;
  status_code: number;
  order_tracking_id: string;
}

export async function getPesapalTransactionStatus(orderTrackingId: string): Promise<PaymentCallbackResult> {
  const token = await getPesapalAccessToken();
  const res = await fetch(
    `${PESAPAL_BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
    { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`Pesapal GetTransactionStatus failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as PesapalStatusResponse;
  return {
    providerReference: body.order_tracking_id,
    succeeded: isPesapalStatusSuccessful(body.status_code),
  };
}

// Pesapal's IPN hits the registered callback URL with these as query
// params (GET) - pure parsing, no network call, independently testable.
export function parsePesapalIpnQuery(params: URLSearchParams): { orderTrackingId: string } | null {
  const orderTrackingId = params.get('OrderTrackingId');
  if (!orderTrackingId) return null;
  return { orderTrackingId };
}

export const pesapalProvider: PaymentProvider = {
  async initiate(req) {
    const notificationId = process.env.PESAPAL_IPN_ID;
    if (!notificationId) {
      throw new Error('PESAPAL_IPN_ID not configured - register an IPN URL via /api/URLSetup/RegisterIPN first');
    }
    return submitPesapalOrder(req, notificationId);
  },
  async parseCallback(body) {
    // Pesapal's IPN is a GET with query params, not a JSON POST body - the
    // callback route is expected to pass a URLSearchParams here.
    if (!(body instanceof URLSearchParams)) return null;
    const parsed = parsePesapalIpnQuery(body);
    if (!parsed) return null;
    return getPesapalTransactionStatus(parsed.orderTrackingId);
  },
};
