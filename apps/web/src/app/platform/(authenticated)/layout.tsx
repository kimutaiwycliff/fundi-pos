import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { ThemeToggle } from '@/components/theme-toggle';
import { PlatformNav } from '@/components/platform/platform-nav';
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
  const name = me.name ?? me.email;

  return (
    <div className="flex min-h-svh flex-col bg-background font-[family-name:var(--font-geist-sans)] text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link
            href="/platform"
            className="flex items-center gap-2 rounded-md font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" aria-hidden />
            </span>
            <span>Platform</span>
          </Link>
          <div className="ml-2 hidden sm:block">
            <PlatformNav variant="inline" />
          </div>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <span className="hidden max-w-48 truncate text-sm text-muted-foreground md:inline" title={me.email}>
              {name}
            </span>
            <ThemeToggle />
            <PlatformLogoutButton />
          </div>
        </div>
        <div className="border-t sm:hidden">
          <PlatformNav variant="tabs" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      <Toaster />
    </div>
  );
}
