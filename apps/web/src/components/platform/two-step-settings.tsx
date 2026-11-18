'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

async function call(body: Record<string, unknown>) {
  const response = await fetch('/api/platform/platform-2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Something went wrong');
  return data;
}

// Turn the console's 2-step sign-in on (QR code -> confirm with a code) or off.
export function TwoStepSettings({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const codeInput = (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="twostep-code">6-digit code from the app</Label>
      <Input
        id="twostep-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        className="w-40 tracking-widest"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
      />
    </div>
  );

  if (enabled) {
    return (
      <div className="flex flex-col gap-3">
        {codeInput}
        <Button
          variant="outline"
          className="w-fit"
          disabled={busy || code.length !== 6}
          onClick={() =>
            run(async () => {
              await call({ action: 'disable', code });
              toast.success('2-step sign-in turned off');
              setCode('');
              router.refresh();
            })
          }
        >
          Turn off 2-step sign-in
        </Button>
      </div>
    );
  }

  if (!setup) {
    return (
      <Button
        disabled={busy}
        className="w-fit"
        onClick={() =>
          run(async () => {
            const data = await call({ action: 'setup' });
            setSetup({ secret: data.secret, qr: await QRCode.toDataURL(data.otpauthUrl, { margin: 1, width: 200 }) });
          })
        }
      >
        Set up 2-step sign-in
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
        <li>Install Google Authenticator (or Microsoft Authenticator, 1Password, Authy) on your phone.</li>
        <li>In the app, add an account and scan this QR code.</li>
        <li>Type the 6-digit code it shows to finish.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- local data: URL, never fetched */}
      <img src={setup.qr} alt="QR code to add Fundi POS to your authenticator app" width={200} height={200} className="rounded-lg bg-white p-2" />
      <p className="text-xs text-muted-foreground">
        Can&apos;t scan? Enter this key in the app instead: <code className="font-mono break-all text-foreground">{setup.secret}</code>
      </p>
      {codeInput}
      <Button
        className="w-fit"
        disabled={busy || code.length !== 6}
        onClick={() =>
          run(async () => {
            await call({ action: 'enable', code });
            toast.success('2-step sign-in is on');
            setSetup(null);
            setCode('');
            router.refresh();
          })
        }
      >
        Turn on 2-step sign-in
      </Button>
    </div>
  );
}

// Opens Payload's /admin (blog) already signed in, via a one-time handoff link.
export function AdminPanelButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      className="w-fit"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const response = await fetch('/api/platform/platform-admin-handoff', { method: 'POST' });
        const data = await response.json().catch(() => ({}));
        setBusy(false);
        if (!response.ok || !data.url) {
          toast.error(data.error ?? 'Could not open the admin panel');
          return;
        }
        window.open(data.url, '_blank', 'noopener');
      }}
    >
      <ExternalLink aria-hidden /> Open content admin
    </Button>
  );
}
