import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogoutButton } from '@/components/logout-button';

export default function SubscriptionCanceledPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <CardTitle>Subscription canceled</CardTitle>
          <CardDescription>
            This account&apos;s subscription has been canceled. Contact your platform administrator to reactivate it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  );
}
