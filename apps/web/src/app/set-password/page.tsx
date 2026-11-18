import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogoMark } from '@/components/marketing/logo-mark';
import { SetPasswordForm } from './set-password-form';

export const metadata: Metadata = { title: 'Set your password', robots: { index: false, follow: false } };

// Landing page for set-password links (owners added from the platform
// console; the link is emailed to them and can be sent over WhatsApp).
export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2">
            <LogoMark />
          </div>
          <CardTitle>Set your password</CardTitle>
          <CardDescription>Choose a password for Fundi POS. You&apos;ll sign in with your email and this password.</CardDescription>
        </CardHeader>
        <CardContent>
          {token ? (
            <SetPasswordForm token={token} />
          ) : (
            <p className="text-sm text-muted-foreground">
              This link is incomplete. Open it again from your email, or{' '}
              <Link href="/login" className="underline underline-offset-2">
                sign in
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
