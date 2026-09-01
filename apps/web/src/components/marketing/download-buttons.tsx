'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

type DetectedOs = 'windows' | 'macos' | 'android' | 'other';
type Platform = 'windows' | 'macos' | 'android';

// navigator.userAgentData isn't available in every browser yet (notably
// Safari/Firefox), so this falls back to the older userAgent string -
// checked in that order since userAgentData is the more reliable signal
// where it exists.
function detectOs(): DetectedOs {
  if (typeof navigator === 'undefined') return 'other';
  const platform = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform;
  const ua = platform ?? navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/win/i.test(ua)) return 'windows';
  if (/mac/i.test(ua)) return 'macos';
  return 'other';
}

const BASE_URL = process.env.NEXT_PUBLIC_DOWNLOADS_BASE_URL ?? '';

const DOWNLOADS: Record<Platform, { label: string; href: string; note: string }> = {
  windows: { label: 'Download for Windows', href: `${BASE_URL}/latest/FundiTill-Setup.exe`, note: 'Windows 10/11 · .exe installer' },
  macos: { label: 'Download for Mac', href: `${BASE_URL}/latest/FundiTill.dmg`, note: 'Apple Silicon & Intel · .dmg' },
  android: { label: 'Download for Android', href: `${BASE_URL}/latest/FundiTill.apk`, note: 'Android 8+ · .apk, sideloaded' },
};

// Renders every download button always (so the page works with JS
// disabled/before hydration), but visually promotes whichever one matches
// the visitor's own machine once detected client-side.
export function DownloadButtons() {
  const [os, setOs] = useState<DetectedOs>('other');

  useEffect(() => {
    // navigator isn't available during SSR, so this has to run post-mount;
    // deferring it (rather than reading it as the initial state) is what
    // keeps the server-rendered button order from mismatching the client's
    // real OS-based order during hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOs(detectOs());
  }, []);

  const rest: Platform[] = (['windows', 'macos', 'android'] as Platform[]).filter((p) => p !== os);
  const order: Platform[] = os === 'other' ? ['windows', 'macos', 'android'] : [os, ...rest];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {order.map((platform, index) => {
          const download = DOWNLOADS[platform];
          const isRecommended = os !== 'other' && index === 0;
          return (
            <div key={platform} className="flex flex-col items-center gap-1.5">
              <Button size="lg" variant={isRecommended ? 'default' : 'outline'} asChild>
                <a href={download.href}>
                  <Download />
                  {download.label}
                </a>
              </Button>
              <span className="text-xs text-muted-foreground">{download.note}</span>
            </div>
          );
        })}
      </div>
      {os === 'android' ? (
        <p className="text-xs text-muted-foreground">
          The Android app isn&apos;t on the Play Store - after downloading, you may need to allow &quot;install from
          unknown sources&quot; for your browser in Android&apos;s settings.
        </p>
      ) : null}
    </div>
  );
}
