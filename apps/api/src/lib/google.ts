import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import type { Payload } from 'payload';

// "Continue with Google": apps/web runs the OAuth redirect and hands the ID
// token here; we verify it against Google's published keys ourselves.
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
}

export async function verifyGoogleIdToken(idToken: string, nonce: string | null): Promise<GoogleIdentity> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Google sign-in is not configured');
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId,
  });
  if (nonce && payload.nonce !== nonce) throw new Error('Google sign-in could not be verified (nonce)');
  if (payload.email_verified !== true || typeof payload.email !== 'string' || typeof payload.sub !== 'string') {
    throw new Error('Your Google account email is not verified');
  }
  return { sub: payload.sub, email: payload.email.toLowerCase(), name: typeof payload.name === 'string' ? payload.name : null };
}

// A first-time Google user gets one more step ("what's your shop called?").
// Their verified identity rides along in a short-lived signed token.
export async function signGoogleSignupToken(payload: Payload, id: GoogleIdentity): Promise<string> {
  return new SignJWT({ purpose: 'google-signup', sub: id.sub, email: id.email, name: id.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('20m')
    .sign(new TextEncoder().encode(payload.secret));
}

export async function readGoogleSignupToken(payload: Payload, token: string): Promise<GoogleIdentity> {
  const { payload: claims } = await jwtVerify(token, new TextEncoder().encode(payload.secret));
  if (claims.purpose !== 'google-signup' || typeof claims.sub !== 'string' || typeof claims.email !== 'string') {
    throw new Error('This sign-up link has expired - continue with Google again.');
  }
  return { sub: claims.sub, email: claims.email, name: typeof claims.name === 'string' ? claims.name : null };
}
