import { describe, expect, it } from 'vitest';
import { buildStkPassword, darajaTimestamp, parseStkCallback } from '../lib/daraja.ts';

describe('darajaTimestamp', () => {
  it('formats as YYYYMMDDHHmmss per Daraja\'s documented format', () => {
    const date = new Date(2026, 1, 16, 16, 56, 27); // month is 0-indexed: Feb
    expect(darajaTimestamp(date)).toBe('20260216165627');
  });

  it('zero-pads single-digit month/day/hour/minute/second', () => {
    const date = new Date(2026, 0, 2, 3, 4, 5);
    expect(darajaTimestamp(date)).toBe('20260102030405');
  });
});

describe('buildStkPassword', () => {
  it('base64-encodes the literal concatenation of shortcode+passkey+timestamp, per the documented formula', () => {
    const shortcode = '174379';
    const passkey = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
    const timestamp = '20260216165627';

    const expected = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    expect(buildStkPassword(shortcode, passkey, timestamp)).toBe(expected);
    // Also confirm it's genuinely reversible to the original concatenation -
    // catches a subtly wrong encoding (e.g. hex instead of base64) that
    // would still "look like a hash" but not decode back correctly.
    expect(Buffer.from(buildStkPassword(shortcode, passkey, timestamp), 'base64').toString('utf-8')).toBe(
      `${shortcode}${passkey}${timestamp}`,
    );
  });
});

describe('parseStkCallback', () => {
  it('extracts the CheckoutRequestID and treats ResultCode 0 as success', () => {
    const body = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'abc',
          CheckoutRequestID: 'ws_CO_123',
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
        },
      },
    };
    expect(parseStkCallback(body)).toEqual({ checkoutRequestId: 'ws_CO_123', succeeded: true });
  });

  it('treats any non-zero ResultCode as failure, not just a known failure code', () => {
    const body = { Body: { stkCallback: { CheckoutRequestID: 'ws_CO_456', ResultCode: 1032 } } };
    expect(parseStkCallback(body)).toEqual({ checkoutRequestId: 'ws_CO_456', succeeded: false });
  });

  it('returns null for a malformed/unexpected payload rather than throwing', () => {
    expect(parseStkCallback({})).toBeNull();
    expect(parseStkCallback(null)).toBeNull();
    expect(parseStkCallback({ Body: {} })).toBeNull();
  });
});
