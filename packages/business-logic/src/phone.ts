// Kenyan mobile numbers are 9 significant digits starting with 7 or 1
// (Safaricom/Airtel/Telkom all issue both 07XX and, more recently, 01XX
// ranges), optionally preceded by a leading 0 or the +254/254 country code.
// Shared by the desktop till's quick-add-customer form and the Customers
// collection's own server-side check, so neither can drift from the other.
const KENYA_MOBILE_PATTERN = /^(?:\+?254|0)?([17]\d{8})$/;

export function normalizeKenyanPhone(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '');
  const match = digits.match(KENYA_MOBILE_PATTERN);
  if (!match) return null;
  return `0${match[1]}`;
}

export function isValidKenyanPhone(raw: string): boolean {
  return normalizeKenyanPhone(raw) !== null;
}
