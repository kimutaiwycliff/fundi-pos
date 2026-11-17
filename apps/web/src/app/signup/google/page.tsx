import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogoMark } from '@/components/marketing/logo-mark';
import { SIGNUP_COOKIE } from '@/lib/google-oauth';
import { GoogleShopNameForm } from './shop-name-form';

export const metadata: Metadata = { title: 'Name your shop', robots: { index: false, follow: false } };

// Shown to someone signing up with Google for the first time. The email is
// only read for display - the API checks the signed token itself.
function emailFromToken(token: string | undefined): string | null {
  try {
    const claims = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return typeof claims.email === 'string' ? claims.email : null;
  } catch {
    return null;
  }
}

export default async function GoogleSignupPage() {
  const token = (await cookies()).get(SIGNUP_COOKIE)?.value;
  const email = token ? emailFromToken(decodeURIComponent(token)) : null;
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2">
            <LogoMark />
          </div>
          <CardTitle>What&apos;s your shop called?</CardTitle>
          <CardDescription>
            {email ? `Signing up as ${email}. ` : ''}Your 14-day free trial starts as soon as you continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {email ? (
            <GoogleShopNameForm />
          ) : (
            <p className="text-sm text-muted-foreground">
              This sign-up has expired.{' '}
              <Link href="/signup" className="text-primary underline underline-offset-2">
                Start again
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
