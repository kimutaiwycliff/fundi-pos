import { cn } from '@/lib/utils';

// Mirrors app/icon.svg exactly (same colors, same lucide "wrench" path) so
// the in-page logo and the browser-tab favicon read as the same mark.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn('size-8 shrink-0', className)}>
      <rect width="32" height="32" rx="7" fill="#16100e" />
      <path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"
        transform="translate(4 4)"
        stroke="#df5102"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
