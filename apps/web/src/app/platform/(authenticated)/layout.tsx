import Link from 'next/link';
import { Toaster } from '@/components/ui/sonner';
import { getCurrentPlatformAdmin } from '@/lib/current-platform-admin';
import { PlatformLogoutButton } from '../logout-button';

// A route GROUP, not a plain nested folder - `(authenticated)` doesn't
// affect the URL (this still resolves to /platform, /platform/tenants/:id,
// etc), it only scopes this layout (and its auth gate) to these routes
// without also wrapping ../login/page.tsx, which sits as a sibling outside
// the group specifically so it's never subject to this same redirect.
//
// Deliberately NOT nested under dashboard/ - dashboard/layout.tsx assumes a
// tenant `users` session (me.tenant, me.role, billingStatus redirects) and
// would break for a platform-admin one. This is its own, much simpler tree.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentPlatformAdmin();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <Link href="/platform" className="font-semibold">
          Platform
        </Link>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{me.name ?? me.email}</span>
          <PlatformLogoutButton />
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
      <Toaster />
    </div>
  );
}
