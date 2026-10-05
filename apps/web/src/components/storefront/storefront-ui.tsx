import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Availability } from './storefront-data';

// Server-safe storefront building blocks. Interactive pieces (bag,
// wishlist, search) live in shop-client.tsx.
//
// Palette: CSS custom properties on .sf-root (app/globals.css), with a
// light and a dark set - dark follows the visitor's system setting unless
// they pick one with the header toggle (ShopThemeToggle):
//   bg / surface   page / drawers, selects, badges
//   ink / on-ink   text + primary buttons / text on those buttons
//   muted, faint   secondary text, decorative placeholder initial
//   shell, line    image wells + panels, hairlines
//   petal          wishlist heart, "only a few left"
//   wa / wa-text   WhatsApp fills (white text) / WhatsApp-green on the page
export function ShopShell({ children }: { children: ReactNode }) {
  return <div className="sf-root flex min-h-full flex-1 flex-col overflow-x-clip antialiased">{children}</div>;
}

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden className={cn('size-5', className)}>
      <path d="M16.004 2.667c-7.363 0-13.333 5.97-13.333 13.333 0 2.351.615 4.646 1.782 6.667L2.667 29.333l6.836-1.793a13.29 13.29 0 0 0 6.5 1.727h.006c7.363 0 13.333-5.97 13.333-13.333 0-3.56-1.386-6.907-3.903-9.424a13.24 13.24 0 0 0-9.435-3.843Zm0 24.4h-.005a11.08 11.08 0 0 1-5.646-1.546l-.405-.24-4.057 1.064 1.083-3.955-.264-.406a11.05 11.05 0 0 1-1.694-5.884c0-6.122 4.983-11.104 11.11-11.104a11.04 11.04 0 0 1 7.86 3.257 11.04 11.04 0 0 1 3.25 7.856c-.003 6.123-4.986 11.958-11.232 11.958Zm6.098-8.316c-.334-.167-1.98-.977-2.287-1.088-.307-.111-.53-.167-.753.167-.223.334-.865 1.088-1.06 1.311-.195.223-.39.25-.723.083-.334-.167-1.409-.52-2.684-1.657-.992-.885-1.662-1.978-1.856-2.312-.195-.334-.02-.514.146-.68.15-.15.334-.39.5-.585.167-.195.223-.334.334-.557.111-.223.056-.418-.028-.585-.084-.167-.753-1.815-1.032-2.486-.272-.653-.548-.565-.753-.576a14.4 14.4 0 0 0-.641-.012.923.923 0 0 0-.669.223c-.223.223-.865.845-.865 2.062 0 1.216.886 2.39 1.008 2.556.125.167 1.744 2.663 4.226 3.734.59.255 1.05.407 1.409.52.592.188 1.13.161 1.556.098.475-.07 1.464-.598 1.67-1.176.204-.578.204-1.073.14-1.176-.06-.104-.223-.167-.446-.278Z" />
    </svg>
  );
}

const BUTTON_SIZES = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
} as const;

export function WhatsAppOrderButton({
  href,
  label = 'Order on WhatsApp',
  size = 'md',
  className,
}: {
  href: string | null;
  label?: string;
  size?: keyof typeof BUTTON_SIZES;
  className?: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full bg-(--sf-wa) font-medium text-white transition-colors hover:bg-(--sf-wa-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--sf-wa)',
        BUTTON_SIZES[size],
        className,
      )}
    >
      <WhatsAppIcon className={size === 'sm' ? 'size-4' : 'size-5'} />
      <span className="truncate">{label}</span>
    </a>
  );
}

export function AvailabilityBadge({ availability, className }: { availability: Availability; className?: string }) {
  if (availability === 'in_stock') return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium',
        availability === 'low' ? 'bg-(--sf-surface)/95 text-(--sf-petal)' : 'bg-(--sf-surface)/95 text-(--sf-muted)',
        className,
      )}
    >
      {availability === 'low' ? 'Only a few left' : 'Sold out'}
    </span>
  );
}

export function ImagePlaceholder({ name, className }: { name: string; className?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '•';
  return (
    <div
      aria-hidden
      className={cn('flex h-full w-full items-center justify-center bg-(--sf-shell) text-5xl font-light text-(--sf-faint)', className)}
    >
      {initial}
    </div>
  );
}

// "How ordering works" - a real three-step sequence, so it's numbered.
export function OrderingSteps() {
  const steps = ['Add pieces to your bag', 'Send the bag to us on WhatsApp', 'We confirm delivery and payment'];
  return (
    <ol className="grid gap-3 text-sm text-(--sf-muted) md:grid-cols-3">
      {steps.map((step, i) => (
        <li key={step} className="flex items-center gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-(--sf-line) text-xs font-medium text-(--sf-ink)">
            {i + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  );
}

export function ShopFooter({ shopName, socialHandles }: { shopName?: string; socialHandles?: string | null }) {
  return (
    <footer className="mt-auto border-t border-(--sf-line) bg-(--sf-shell)">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-(--sf-muted) sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 break-words">
          {shopName ? <span className="font-medium text-(--sf-ink)">{shopName}</span> : null}
          {socialHandles ? <span className="ml-2">{socialHandles}</span> : null}
        </p>
        <p className="text-xs">
          Shop powered by{' '}
          <Link href="/" className="text-(--sf-ink) underline-offset-4 hover:underline">
            Fundi POS
          </Link>
        </p>
      </div>
    </footer>
  );
}
