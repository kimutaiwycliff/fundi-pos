'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, LayoutDashboard, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/platform', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/platform/tenants', label: 'Tenants', icon: Building2, exact: false },
  { href: '/platform/payments', label: 'Payments', icon: Receipt, exact: false },
];

// Same links in two layouts: inline in the header from sm up, and a full-
// width tab strip under the header on phones (three items always fit at
// 360px, so nothing needs to hide behind a menu).
export function PlatformNav({ variant }: { variant: 'inline' | 'tabs' }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Platform" className={cn(variant === 'tabs' ? 'grid grid-cols-3' : 'flex items-center gap-1')}>
      {LINKS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              variant === 'inline'
                ? 'h-8 rounded-lg px-3 text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground'
                : 'h-11 border-b-2 border-transparent text-muted-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
