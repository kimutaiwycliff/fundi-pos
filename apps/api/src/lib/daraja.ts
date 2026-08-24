// Safaricom M-Pesa Daraja API integration (STK Push / "Lipa na M-Pesa
// Online"), spec Section 6.5. UNVERIFIED against the real Daraja
// sandbox/production - that requires a registered Safaricom developer app's
// own consumer key/secret and shortcode/passkey, none of which exist in
// this environment. What IS verified: the request-shape/signing logic
// below, which is pure and independently checkable against Safaricom's
// published API documentation (developer.safaricom.co.ke) without needing
// live credentials - only the actual HTTP calls to Safaricom's servers are
// unverified.
//
// Sandbox base URL vs production is the one difference the actual network
// calls need; kept as an env var rather than hardcoded.
const DARAJA_BASE_URL = process.env.DARAJA_BASE_URL || 'https://sandbox.safaricom.co.ke';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/** YYYYMMDDHHmmss, exactly as Daraja's docs specify for the timestamp used in the password below. */
export function darajaTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** Password = Base64(Shortcode + Passkey + Timestamp), per Daraja's documented STK Push contract. */
export function buildStkPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

interface DarajaTokenResponse {
  access_token: string;
  expires_in: string;
}

/** OAuth2 client_credentials grant, Basic-Auth'd with the app's consumer key/secret. */
export async function getDarajaAccessToken(): Promise<string> {
  const consumerKey = requireEnv('DARAJA_CONSUMER_KEY');
  const consumerSecret = requireEnv('DARAJA_CONSUMER_SECRET');
  const basicAuth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  const res = await fetch(`${DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basicAuth}` },
  });
  if (!res.ok) {
    throw new Error(`Daraja OAuth failed: HTTP ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as DarajaTokenResponse;
  return body.access_token;
}

export interface StkPushRequest {
  phone: string; // MSISDN, 2547XXXXXXXX format per Daraja's docs
  amount: number;
  accountReference: string; // shown to the customer, e.g. the order id
  description: string;
  callbackUrl: string;
}

export interface StkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export async function initiateStkPush(req: StkPushRequest): Promise<StkPushResponse> {
  const shortcode = requireEnv('DARAJA_SHORTCODE');
  const passkey = requireEnv('DARAJA_PASSKEY');
  const timestamp = darajaTimestamp(new Date());
  const password = buildStkPassword(shortcode, passkey, timestamp);
  const accessToken = await getDarajaAccessToken();

  const res = await fetch(`${DARAJA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(req.amount),
      PartyA: req.phone,
      PartyB: shortcode,
      PhoneNumber: req.phone,
      CallBackURL: req.callbackUrl,
      AccountReference: req.accountReference,
      TransactionDesc: req.description,
    }),
  });
  if (!res.ok) {
    throw new Error(`Daraja STK push failed: HTTP ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as StkPushResponse;
}

/**
 * Safaricom's STK callback shape (per Daraja docs), reduced to what this
 * app needs: which CheckoutRequestID it's for, and whether it succeeded
 * (ResultCode 0) or failed (any other code).
 */
export function parseStkCallback(body: unknown): { checkoutRequestId: string; succeeded: boolean } | null {
  const stkCallback = (body as any)?.Body?.stkCallback;
  if (!stkCallback?.CheckoutRequestID) return null;
  return {
    checkoutRequestId: stkCallback.CheckoutRequestID as string,
    succeeded: stkCallback.ResultCode === 0,
  };
}
