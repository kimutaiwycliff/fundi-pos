'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogoMark } from '@/components/marketing/logo-mark';
import { ThemeToggle } from '@/components/theme-toggle';
import { GoogleButton } from '@/components/auth/google-button';

// ?error= from the Google sign-in redirect (apps/web api/auth/google/callback).
const GOOGLE_ERRORS: Record<string, string> = {
  google_unavailable: "Google sign-in isn't set up yet - use your email and password.",
  google_cancelled: 'Google sign-in was cancelled.',
  google_expired: 'That Google sign-in took too long - try again.',
  google_failed: "Couldn't sign in with Google - try again, or use your email and password.",
};
import { clientFetch, errorMessageFrom } from '@/lib/client-fetch';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const expired = searchParams.get('expired') === '1';
  const errorParam = searchParams.get('error');
  const redirectError = errorParam ? (GOOGLE_ERRORS[errorParam] ?? errorParam) : null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // skipSessionRedirect: a wrong-password attempt here 401s same as an
      // actually-expired session would elsewhere - without this it'd hijack
      // every failed login into client-fetch.ts's "session expired, back to
      // /login" redirect instead of just showing "Login failed" below.
      const response = await clientFetch(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        },
        { skipSessionRedirect: true },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(errorMessageFrom(body, 'Login failed'));
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-muted/40 p-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Back to home
        </Link>
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <LogoMark className="mb-2 size-10 rounded-md" />
            <CardTitle>Fundi</CardTitle>
            <CardDescription>Sign in to manage your stores and inventory.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {redirectError ? <p className="text-sm text-destructive">{redirectError}</p> : null}
            <GoogleButton />
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {expired ? <p className="text-sm text-muted-foreground">Your session expired - please sign in again.</p> : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/forgot-password" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <PasswordInput
                  id="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground">
              New here?{' '}
              <Link href="/signup" className="text-primary underline underline-offset-2">
                Start a free trial
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
