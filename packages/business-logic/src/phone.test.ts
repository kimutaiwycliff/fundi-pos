import { describe, expect, it } from 'vitest';
import { isValidKenyanPhone, normalizeKenyanPhone } from './phone.ts';

describe('normalizeKenyanPhone', () => {
  it('accepts a local 07-prefixed number', () => {
    expect(normalizeKenyanPhone('0712345678')).toBe('0712345678');
  });

  it('accepts a local 01-prefixed number', () => {
    expect(normalizeKenyanPhone('0112345678')).toBe('0112345678');
  });

  it('accepts a bare 9-digit number with no leading 0', () => {
    expect(normalizeKenyanPhone('712345678')).toBe('0712345678');
  });

  it('accepts a +254 country code and normalizes to local format', () => {
    expect(normalizeKenyanPhone('+254712345678')).toBe('0712345678');
  });

  it('accepts a 254 country code without the plus', () => {
    expect(normalizeKenyanPhone('254712345678')).toBe('0712345678');
  });

  it('tolerates spaces and dashes', () => {
    expect(normalizeKenyanPhone('0712 345 678')).toBe('0712345678');
    expect(normalizeKenyanPhone('0712-345-678')).toBe('0712345678');
  });

  it('rejects an invalid prefix', () => {
    expect(normalizeKenyanPhone('0812345678')).toBeNull();
  });

  it('rejects too few digits', () => {
    expect(normalizeKenyanPhone('071234567')).toBeNull();
  });

  it('rejects too many digits', () => {
    expect(normalizeKenyanPhone('07123456789')).toBeNull();
  });

  it('rejects non-numeric input', () => {
    expect(normalizeKenyanPhone('not-a-phone')).toBeNull();
  });
});

describe('isValidKenyanPhone', () => {
  it('mirrors normalizeKenyanPhone', () => {
    expect(isValidKenyanPhone('0712345678')).toBe(true);
    expect(isValidKenyanPhone('0812345678')).toBe(false);
  });
});
