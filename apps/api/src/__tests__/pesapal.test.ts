import { describe, expect, it } from 'vitest';
import { buildPesapalOrderRequest, isPesapalStatusSuccessful, parsePesapalIpnQuery } from '../lib/payments/pesapal.ts';

describe('buildPesapalOrderRequest', () => {
  it('shapes the request per Pesapal API v3\'s documented SubmitOrderRequest body', () => {
    const body = buildPesapalOrderRequest(
      {
        orderId: 'order-123',
        amount: 799,
        phone: '0712345678',
        description: 'Order order-123',
        callbackUrl: 'https://api.example.com/api/payments/pesapal/callback',
      },
      'ipn-abc',
    );

    expect(body).toEqual({
      id: 'order-123',
      currency: 'KES',
      amount: 799,
      description: 'Order order-123',
      callback_url: 'https://api.example.com/api/payments/pesapal/callback',
      notification_id: 'ipn-abc',
      billing_address: {
        phone_number: '0712345678',
        email_address: 'order-123@no-reply.hardware-pos.invalid',
        country_code: 'KE',
      },
    });
  });
});

describe('isPesapalStatusSuccessful', () => {
  it('treats only status_code 1 (COMPLETED) as success', () => {
    expect(isPesapalStatusSuccessful(1)).toBe(true);
  });

  it('treats INVALID/FAILED/REVERSED as not successful', () => {
    expect(isPesapalStatusSuccessful(0)).toBe(false);
    expect(isPesapalStatusSuccessful(2)).toBe(false);
    expect(isPesapalStatusSuccessful(3)).toBe(false);
  });
});

describe('parsePesapalIpnQuery', () => {
  it('extracts OrderTrackingId from the IPN query string', () => {
    const params = new URLSearchParams('OrderTrackingId=abc-123&OrderMerchantReference=order-123&OrderNotificationType=IPNCHANGE');
    expect(parsePesapalIpnQuery(params)).toEqual({ orderTrackingId: 'abc-123' });
  });

  it('returns null when OrderTrackingId is missing', () => {
    expect(parsePesapalIpnQuery(new URLSearchParams('foo=bar'))).toBeNull();
  });
});
