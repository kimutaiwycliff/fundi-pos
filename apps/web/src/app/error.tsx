'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/marketing/logo-mark';

// Root-level error boundary for everything outside /dashboard (which has its
// own error.tsx). These routes have no persistent header/sidebar of their
// own, so the logo is shown here to keep the page recognizably branded.
export default function RootError({
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
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-4 text-center">
      <LogoMark className="mb-1 size-10 rounded-md" />
      <AlertTriangle className="size-10 animate-in fade-in zoom-in-95 text-destructive/60 duration-500" />
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This page hit an unexpected error. You can try again, or head back to the homepage.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
