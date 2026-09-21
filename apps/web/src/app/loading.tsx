import { LogoMark } from '@/components/marketing/logo-mark';

// Root-level loading UI - shown by Next.js while any route segment above
// (or without) a more specific loading.tsx is loading. Dashboard routes have
// their own skeletons (see dashboard/loading.tsx); this covers everything
// else: /, /login, /signup, /blog, /platform/*, etc.
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background"
    >
      <div className="relative flex items-center justify-center">
        <span aria-hidden="true" className="absolute size-16 animate-ping rounded-2xl bg-primary/20" />
        <LogoMark className="relative size-12 animate-pulse rounded-md" />
      </div>
      <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        Loading Fundi POS
        <span className="flex items-end gap-0.5">
          <span className="size-1 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
          <span className="size-1 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
          <span className="size-1 animate-bounce rounded-full bg-primary" />
        </span>
      </p>
    </div>
  );
}
