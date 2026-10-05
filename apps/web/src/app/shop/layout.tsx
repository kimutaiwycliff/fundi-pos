import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import { Jost } from 'next/font/google';
import { ShopThemeScript } from '@/components/storefront/shop-client';

// The public storefront is each shop's own brand surface, not the Fundi
// app UI - it gets its own typeface (one geometric family for everything,
// light weights for the shop name, regular/medium for UI and prices).
const jost = Jost({ subsets: ['latin'], weight: ['300', '400', '500', '600'], display: 'swap' });

// Browser chrome (mobile address bar) matches the shop's page background
// in both schemes - same values as --sf-bg in globals.css.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1424' },
  ],
};

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${jost.className} flex min-h-full flex-1 flex-col`}>
      {/* Before any shop markup, so a stored light/dark choice is on <html> by first paint. */}
      <ShopThemeScript />
      {children}
    </div>
  );
}
