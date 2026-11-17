'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface Preview {
  count: number;
  optedOut: number;
  noEmail: number;
  max: number;
  names: string[];
  sample: { to: string; subject: string; html: string } | null;
}

const STARTER = `Hi {{owner}},

I noticed {{shop}} hasn't made its first sale on Fundi POS yet. Most shops get there in under 10 minutes once their main products are in.

Reply to this email or WhatsApp me and I'll walk you through it.`;

export function CampaignComposer({ segments, max }: { segments: Record<string, string>; max: number }) {
  const router = useRouter();
  const [segment, setSegment] = useState('never_started');
  const [subject, setSubject] = useState('Need a hand getting your first sale?');
  const [body, setBody] = useState(STARTER);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'test' | 'send' | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function call(action: 'preview' | 'test' | 'send', extra: Record<string, unknown> = {}) {
    setBusy(action);
    const response = await fetch('/api/platform/platform-campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, segment, subject, body, ...extra }),
    });
    setBusy(null);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error ?? 'Something went wrong');
      if (response.status === 409) setPreview(null);
      return null;
    }
    return data;
  }

  // Anything edited after a preview invalidates it - send always follows a fresh preview.
  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPreview(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New campaign</CardTitle>
        <CardDescription>
          Use {'{{owner}}'} for the owner&apos;s first name and {'{{shop}}'} for the shop name. Blank lines start a new paragraph. Up to {max}{' '}
          shops per campaign (Brevo&apos;s free plan sends 300 emails a day).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cmp-segment">Send to</Label>
            <Select value={segment} onValueChange={edit(setSegment)}>
              <SelectTrigger id="cmp-segment" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(segments).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cmp-subject">Subject</Label>
            <Input id="cmp-subject" maxLength={150} value={subject} onChange={(e) => edit(setSubject)(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cmp-body">Message</Label>
            <Textarea id="cmp-body" rows={10} maxLength={5000} value={body} onChange={(e) => edit(setBody)(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy !== null || !subject.trim() || !body.trim()} onClick={async () => setPreview(await call('preview'))}>
              {busy === 'preview' ? 'Checking…' : 'Preview'}
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null || !subject.trim() || !body.trim()}
              onClick={async () => {
                const r = await call('test');
                if (r) toast.success(r.result === 'sent' ? 'Test sent to your inbox' : 'Test logged (email not set up yet)');
              }}
            >
              {busy === 'test' ? 'Sending…' : 'Send test to me'}
            </Button>
            <Button disabled={busy !== null || !preview || preview.count === 0 || preview.count > max} onClick={() => setConfirming(true)}>
              <Send aria-hidden /> {preview ? `Send to ${preview.count} shop${preview.count === 1 ? '' : 's'}` : 'Preview first'}
            </Button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          {preview ? (
            <>
              <p className="text-sm">
                <span className="font-medium">{preview.count}</span> shop{preview.count === 1 ? '' : 's'} will get this
                {preview.optedOut ? ` · ${preview.optedOut} unsubscribed` : ''}
                {preview.noEmail ? ` · ${preview.noEmail} with no email` : ''}
                {preview.count > max ? ` - over the ${max} limit, pick a smaller group` : ''}
              </p>
              {preview.names.length ? <p className="line-clamp-2 text-xs text-muted-foreground">{preview.names.join(', ')}</p> : null}
              {preview.sample ? (
                <iframe
                  title="Email preview"
                  sandbox=""
                  srcDoc={preview.sample.html}
                  className="h-[420px] w-full rounded-lg border bg-white"
                />
              ) : (
                <p className="text-sm text-muted-foreground">Nobody in this group right now.</p>
              )}
            </>
          ) : (
            <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Preview to see who it reaches and how it looks.
            </div>
          )}
        </div>
      </CardContent>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to {preview?.count} shops?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{subject}&rdquo; goes out now, once per shop. This can&apos;t be recalled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const r = await call('send', { confirmCount: preview?.count });
                if (r) {
                  toast.success(`Sending to ${r.queued} shops`);
                  setPreview(null);
                  router.refresh();
                }
              }}
            >
              Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
