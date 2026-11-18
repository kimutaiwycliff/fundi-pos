import { CampaignComposer } from '@/components/platform/campaign-composer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDayTime } from '@/components/platform/format';
import { platformFetch } from '@/lib/platform-client';

export const metadata = { title: 'Campaigns · Platform' };

interface CampaignsResponse {
  segments: Record<string, string>;
  max: number;
  campaigns: {
    id: number;
    subject: string;
    segment: string;
    recipients: number;
    skippedOptedOut?: number | null;
    createdAt: string;
    sentBy?: { name?: string | null; email: string } | number | null;
  }[];
}

export default async function PlatformCampaignsPage() {
  const data = await platformFetch<CampaignsResponse>('/api/platform-campaign');
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="text-sm text-muted-foreground">
          Email a group of shops - help for ones that never started, a nudge before trials end, news for paying customers. Each shop gets
          it once; unsubscribed shops are skipped.
        </p>
      </div>
      <CampaignComposer segments={data.segments} max={data.max} />
      <Card>
        <CardHeader>
          <CardTitle>Sent</CardTitle>
        </CardHeader>
        <CardContent>
          {data.campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No campaigns yet.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {data.campaigns.map((c) => (
                <li key={c.id} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                  <span className="text-sm font-medium">{c.subject}</span>
                  <span className="text-xs text-muted-foreground">
                    {data.segments[c.segment] ?? c.segment} · {c.recipients} shop{c.recipients === 1 ? '' : 's'}
                    {c.skippedOptedOut ? ` (${c.skippedOptedOut} unsubscribed skipped)` : ''} · {formatDayTime(c.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
