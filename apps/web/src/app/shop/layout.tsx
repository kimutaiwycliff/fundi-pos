import type { ReactNode } from 'react';
import { Jost } from 'next/font/google';

// The public storefront is each shop's own brand surface, not the Fundi
// app UI - it gets its own typeface (one geometric family for everything,
// light weights for the shop name, regular/medium for UI and prices).
const jost = Jost({ subsets: ['latin'], weight: ['300', '400', '500', '600'], display: 'swap' });

export default function ShopLayout({ children }: { children: ReactNode }) {
  return <div className={`${jost.className} flex min-h-full flex-1 flex-col`}>{children}</div>;
}
