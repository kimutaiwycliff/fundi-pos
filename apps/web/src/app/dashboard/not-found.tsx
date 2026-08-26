import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <FileQuestion className="size-10 text-muted-foreground/40" />
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Button asChild className="mt-2">
        <Link href="/dashboard">Back to overview</Link>
      </Button>
    </div>
  );
}
