'use client';

import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLogout } from '@/hooks/use-logout';
import { cn } from '@/lib/utils';

// className stays opt-in (not baked in) so the dashboard sidebar's footer
// can apply icon-collapse-aware sizing without affecting this component's
// other use on the subscription-canceled page, which isn't inside a
// sidebar's `group` context at all.
export function LogoutButton({ className }: { className?: string }) {
  const { logout } = useLogout();

  return (
    <Button variant="ghost" size="sm" onClick={logout} className={cn('gap-2', className)}>
      <LogOut />
      <span className="group-data-[collapsible=icon]:hidden">Log out</span>
    </Button>
  );
}
