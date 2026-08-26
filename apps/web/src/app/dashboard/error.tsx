'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <AlertTriangle className="size-10 text-destructive/60" />
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This page hit an unexpected error. You can try again, or head back to the overview.
      </p>
      <Button onClick={reset} className="mt-2">
        Try again
      </Button>
    </div>
  );
}
