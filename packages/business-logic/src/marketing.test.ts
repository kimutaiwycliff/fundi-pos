import { describe, expect, it } from 'vitest';
import { computeCheckoutTotals, computeOrderTotals, type LineInput } from './pricing.ts';
import { evaluatePromo, loyaltyPointsEarnedFor, normalizePromoCode, resolveLoyaltyRedemption } from './promo.ts';
import {
  buildReceiptMarketingLines,
  buildWhatsAppLink,
  hasAddon,
  normalizeShopSlug,
  receiptFooterWithMarketing,
  salesChannelLabel,
  toWhatsAppNumber,
} from './marketing.ts';

describe('hasAddon', () => {
  it('is only true when the admin switched the add-on on', () => {
    expect(hasAddon({ addons: ['sell_online'], billingStatus: 'active' }, 'sell_online')).toBe(true);
    expect(hasAddon({ addons: [], billingStatus: 'active' }, 'sell_online')).toBe(false);
    expect(hasAddon({ addons: null, billingStatus: 'trialing' }, 'sell_online')).toBe(false);
    expect(hasAddon(null, 'sell_online')).toBe(false);
  });

  it('is lost when the subscription is canceled', () => {
    expect(hasAddon({ addons: ['sell_online'], billingStatus: 'canceled' }, 'sell_online')).toBe(false);
  });
});

describe('computeCheckoutTotals', () => {
  const lines: LineInput[] = [
    { quantity: 2, unitPrice: 58, discount: 10, taxRate: 0.16 },
    { quantity: 1, unitPrice: 232, discount: 0, taxRate: 0.16 },
  ];

  it('matches computeOrderTotals exactly when there are no order-level discounts', () => {
    const base = computeOrderTotals(lines);
    const checkout = computeCheckoutTotals(lines);
    expect(checkout.total).toBe(base.total);
    expect(checkout.taxTotal).toBe(base.taxTotal);
    expect(checkout.discountTotal).toBe(base.discountTotal);
    expect(checkout.subtotal).toBe(338);
    expect(checkout.promoDiscount).toBe(0);
  });

  it('takes promo and loyalty off the total and counts them in discountTotal', () => {
    const totals = computeCheckoutTotals(lines, { promoDiscount: 38, loyaltyDiscount: 50 });
    expect(totals.total).toBe(250);
    expect(totals.promoDiscount).toBe(38);
    expect(totals.loyaltyDiscount).toBe(50);
    expect(totals.discountTotal).toBe(98); // 10 line + 38 + 50
  });

  it('recomputes tax per line so VAT-exempt lines stay untaxed', () => {
    const mixed: LineInput[] = [
      { quantity: 1, unitPrice: 100, discount: 0, taxRate: 0 },
      { quantity: 1, unitPrice: 116, discount: 0, taxRate: 0.16 },
    ];
    const totals = computeCheckoutTotals(mixed, { promoDiscount: 21.6 });
    expect(totals.total).toBe(194.4);
    // 10% off each: exempt line 90 (no tax), taxed line 104.4 => tax 14.4
    expect(totals.taxTotal).toBeCloseTo(14.4, 2);
  });

  it('never discounts below zero', () => {
    const totals = computeCheckoutTotals([{ quantity: 1, unitPrice: 100, discount: 0, taxRate: 0.16 }], {
      promoDiscount: 80,
      loyaltyDiscount: 500,
    });
    expect(totals.total).toBe(0);
    expect(totals.promoDiscount).toBe(80);
    expect(totals.loyaltyDiscount).toBe(20);
  });

  it('allocates rounding remainders so the total is exact', () => {
    const three: LineInput[] = [
      { quantity: 1, unitPrice: 33.33, discount: 0, taxRate: 0.16 },
      { quantity: 1, unitPrice: 33.33, discount: 0, taxRate: 0.16 },
      { quantity: 1, unitPrice: 33.34, discount: 0, taxRate: 0.16 },
    ];
    expect(computeCheckoutTotals(three, { promoDiscount: 10 }).total).toBe(90);
  });
});

describe('evaluatePromo', () => {
  const now = new Date('2026-11-27T10:00:00Z');

  it('applies flat and percentage codes', () => {
    expect(evaluatePromo({ code: 'BF', kind: 'flat', value: 200 }, 1000, now)).toEqual({ ok: true, discount: 200 });
    expect(evaluatePromo({ code: 'BF', kind: 'percentage', value: 15 }, 1000, now)).toEqual({ ok: true, discount: 150 });
  });

  it('caps a flat code at the basket value', () => {
    expect(evaluatePromo({ code: 'BF', kind: 'flat', value: 500 }, 300, now)).toEqual({ ok: true, discount: 300 });
  });

  it('rejects inactive, not-yet-started, expired, used-up and under-minimum codes', () => {
    const base = { code: 'BF', kind: 'flat' as const, value: 100 };
    expect(evaluatePromo({ ...base, active: false }, 1000, now).ok).toBe(false);
    expect(evaluatePromo({ ...base, startsAt: '2026-11-28T00:00:00Z' }, 1000, now).ok).toBe(false);
    expect(evaluatePromo({ ...base, endsAt: '2026-11-26T00:00:00Z' }, 1000, now).ok).toBe(false);
    expect(evaluatePromo({ ...base, maxUses: 5, usesCount: 5 }, 1000, now).ok).toBe(false);
    const underMin = evaluatePromo({ ...base, minSpend: 3000 }, 1000, now);
    expect(underMin.ok).toBe(false);
    if (!underMin.ok) expect(underMin.reason).toContain('3,000');
  });

  it('treats maxUses 0/null as unlimited', () => {
    expect(evaluatePromo({ code: 'X', kind: 'flat', value: 10, maxUses: 0, usesCount: 99 }, 100, now).ok).toBe(true);
    expect(evaluatePromo({ code: 'X', kind: 'flat', value: 10, maxUses: null, usesCount: 99 }, 100, now).ok).toBe(true);
  });

  it('normalizes codes typed at the till', () => {
    expect(normalizePromoCode('  bf 2026 ')).toBe('BF2026');
  });
});

describe('loyalty', () => {
  it('earns 1 point per KES 100', () => {
    expect(loyaltyPointsEarnedFor(1999)).toBe(19);
    expect(loyaltyPointsEarnedFor(0)).toBe(0);
  });

  it('redeems whole points, capped by balance and by the bill', () => {
    expect(resolveLoyaltyRedemption({ requestedPoints: 50, availablePoints: 30, pointValue: 1, payable: 1000 })).toEqual({
      points: 30,
      discount: 30,
    });
    expect(resolveLoyaltyRedemption({ requestedPoints: 500, availablePoints: 500, pointValue: 2, payable: 101 })).toEqual({
      points: 50,
      discount: 100,
    });
    expect(resolveLoyaltyRedemption({ requestedPoints: 10, availablePoints: 10, pointValue: 0, payable: 100 }).points).toBe(0);
  });
});

describe('receipt marketing + links', () => {
  it('builds lines only for what the shop filled in', () => {
    expect(buildReceiptMarketingLines({})).toEqual([]);
    expect(
      buildReceiptMarketingLines({
        whatsappNumber: '+254 712 345 678',
        socialHandles: 'IG/TikTok @babyshop.ke',
        googleReviewUrl: 'https://g.page/r/abc/review',
      }),
    ).toEqual([
      'Order on WhatsApp: 0712345678',
      'Follow us: IG/TikTok @babyshop.ke',
      'Review us: https://g.page/r/abc/review',
    ]);
  });

  it('appends marketing to the existing footer and keeps the footer alone when nothing is set', () => {
    expect(receiptFooterWithMarketing('Thank you!', { socialHandles: '@shop' })).toBe('Thank you!\nFollow us: @shop');
    expect(receiptFooterWithMarketing('Thank you!', null)).toBe('Thank you!');
    expect(receiptFooterWithMarketing(null, null)).toBeNull();
  });

  it('builds wa.me links in international format', () => {
    expect(toWhatsAppNumber('0712345678')).toBe('254712345678');
    expect(toWhatsAppNumber('not a phone')).toBeNull();
    expect(buildWhatsAppLink('0712345678', 'Hi, I want this')).toBe('https://wa.me/254712345678?text=Hi%2C%20I%20want%20this');
  });

  it('labels missing channels as walk-in and normalizes shop slugs', () => {
    expect(salesChannelLabel(null)).toBe('Walk-in');
    expect(salesChannelLabel('tiktok')).toBe('TikTok');
    expect(normalizeShopSlug('  Mama & Baby Boutique! ')).toBe('mama-baby-boutique');
    expect(normalizeShopSlug('ab')).toBeNull();
  });
});
