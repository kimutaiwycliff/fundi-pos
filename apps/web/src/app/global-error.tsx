'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/marketing/logo-mark';
// global-error replaces the root layout entirely when it activates (the
// root layout itself may be what threw), so it can't rely on that layout's
// fonts/ThemeProvider - it must define its own <html>/<body> and pull in
// its own styles. Button and LogoMark are safe to reuse here: neither
// depends on any provider from layout.tsx, just plain CSS classes.
import './globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-4 text-center font-sans text-foreground antialiased">
        <title>Something went wrong · Fundi POS</title>
        <LogoMark className="mb-1 size-10 rounded-md" />
        <AlertTriangle className="size-10 animate-in fade-in zoom-in-95 text-destructive/60 duration-500" />
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The app hit an unexpected error while loading. You can try again, or head back to the homepage.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          {/* Plain anchor, not next/link: this is a standalone document
              outside the normal app tree, so a full navigation is the
              more reliable recovery path here than a client-side one. */}
          <Button asChild variant="outline">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Back to home</a>
          </Button>
        </div>
      </body>
    </html>
  );
}
