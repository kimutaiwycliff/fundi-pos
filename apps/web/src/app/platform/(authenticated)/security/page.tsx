import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminPanelButton, TwoStepSettings } from '@/components/platform/two-step-settings';
import { platformFetch } from '@/lib/platform-client';

export const metadata = { title: 'Security · Platform' };

export default async function PlatformSecurityPage() {
  const { enabled } = await platformFetch<{ enabled: boolean }>('/api/platform-2fa');
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign-in security</h1>
        <p className="text-sm text-muted-foreground">The console controls every shop&apos;s billing and data - protect it with more than a password.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>2-step sign-in</CardTitle>
          <CardDescription>
            {enabled
              ? 'On. Signing in needs your password and a 6-digit code from your authenticator app.'
              : 'Off. Turn it on so a stolen password alone can’t get into the console.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TwoStepSettings enabled={enabled} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Content admin (blog)</CardTitle>
          <CardDescription>
            Payload&apos;s admin panel, for blog posts. It can&apos;t ask for a 2-step code itself, so open it from here - you&apos;re signed in
            already.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminPanelButton />
        </CardContent>
      </Card>
    </div>
  );
}
