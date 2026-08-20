import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

// Cashier till PIN hashing (separate from Payload's own auth password hash,
// which is for the web dashboard's email/password login). Node's built-in
// scrypt avoids adding a bcrypt-style native dependency for a 4-6 digit PIN.
const KEY_LENGTH = 64;

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(pin, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
