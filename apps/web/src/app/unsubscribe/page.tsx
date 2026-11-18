import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogoMark } from '@/components/marketing/logo-mark';
import { UnsubscribeButton } from './unsubscribe-button';

export const metadata: Metadata = { title: 'Unsubscribe', robots: { index: false, follow: false } };

// Campaign emails link here. Unsubscribing takes a click (not just opening
// the link), so email scanners that pre-open links don't unsubscribe people.
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2">
            <LogoMark />
          </div>
          <CardTitle>Stop update emails?</CardTitle>
          <CardDescription>
            You&apos;ll stop getting tips and announcements from Fundi POS. Billing emails - receipts and renewal reminders - still come.
          </CardDescription>
        </CardHeader>
        <CardContent>{t ? <UnsubscribeButton token={t} /> : <p className="text-sm text-muted-foreground">This link is incomplete.</p>}</CardContent>
      </Card>
    </div>
  );
}
