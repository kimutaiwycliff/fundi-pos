'use client';

import { usePathname } from 'next/navigation';

// Mirrors NavItems' own active-route matching (exact for the Overview root,
// prefix for everything else) so the header title always agrees with
// whichever sidebar item is highlighted.
export function PageTitle({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const active = items.find((item) =>
    item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href),
  );

  return <h1 className="truncate text-sm font-medium text-foreground sm:text-base">{active?.label ?? 'Fundi'}</h1>;
}
