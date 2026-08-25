'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

type DetectedOs = 'windows' | 'macos' | 'other';

// navigator.userAgentData isn't available in every browser yet (notably
// Safari/Firefox), so this falls back to the older userAgent string -
// checked in that order since userAgentData is the more reliable signal
// where it exists.
function detectOs(): DetectedOs {
  if (typeof navigator === 'undefined') return 'other';
  const platform = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform;
  const ua = platform ?? navigator.userAgent;
  if (/win/i.test(ua)) return 'windows';
  if (/mac/i.test(ua)) return 'macos';
  return 'other';
}

const BASE_URL = process.env.NEXT_PUBLIC_DOWNLOADS_BASE_URL ?? '';

const DOWNLOADS: Record<'windows' | 'macos', { label: string; href: string; note: string }> = {
  windows: { label: 'Download for Windows', href: `${BASE_URL}/latest/FundiTill-Setup.exe`, note: 'Windows 10/11 · .exe installer' },
  macos: { label: 'Download for Mac', href: `${BASE_URL}/latest/FundiTill.dmg`, note: 'Apple Silicon & Intel · .dmg' },
};

// Renders both download buttons always (so the page works with JS
// disabled/before hydration), but visually promotes whichever one matches
// the visitor's own machine once detected client-side.
export function DownloadButtons() {
  const [os, setOs] = useState<DetectedOs>('other');

  useEffect(() => {
    setOs(detectOs());
  }, []);

  const order: Array<'windows' | 'macos'> = os === 'macos' ? ['macos', 'windows'] : ['windows', 'macos'];

  return (
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
  );
}
