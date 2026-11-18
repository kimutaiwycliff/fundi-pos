import type { Metadata } from 'next';
import { AlertTriangle } from 'lucide-react';
import { ACCESS_BLOCK_MESSAGES, type AccessBlockReason } from '@hardware-pos/business-logic';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogoutButton } from '@/components/logout-button';
import { supportWhatsAppLink } from '@/lib/support';

export const metadata: Metadata = {
  title: 'Account paused',
  robots: { index: false, follow: true },
};

const TITLES: Record<AccessBlockReason, string> = {
  suspended: 'Account suspended',
  deleted: 'Account closed',
  canceled: 'Subscription canceled',
  trial_ended: 'Your free trial has ended',
  payment_overdue: 'Subscription payment overdue',
};

function isReason(value: unknown): value is AccessBlockReason {
  return typeof value === 'string' && value in TITLES;
}

// Where the dashboard layout sends a tenant whose access is blocked
// (business-logic's tenantAccess). The URL keeps its old name so existing
// links still land here.
export default async function AccountPausedPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason: raw } = await searchParams;
  const reason: AccessBlockReason = isReason(raw) ? raw : 'canceled';
  const canPay = reason === 'trial_ended' || reason === 'payment_overdue' || reason === 'canceled';

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <CardTitle>{TITLES[reason]}</CardTitle>
          <CardDescription>
            {ACCESS_BLOCK_MESSAGES[reason]}
            {reason !== 'deleted' ? " Your data is safe and everything comes back as soon as you're reactivated." : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {canPay ? (
            <Button asChild>
              <a href={supportWhatsAppLink("Hi Fundi POS, I'd like to pay to reactivate my account.")} target="_blank" rel="noopener noreferrer">
                Pay via WhatsApp
              </a>
            </Button>
          ) : null}
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  );
}
