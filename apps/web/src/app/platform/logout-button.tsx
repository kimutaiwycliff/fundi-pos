'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

// Mirrors hooks/use-logout.ts, pointed at the platform-admin routes instead
// (that hook is hardcoded to /api/auth/logout + /login).
export function PlatformLogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/platform-auth/logout', { method: 'POST' });
    router.push('/platform/login');
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleLogout}>
      Sign out
    </Button>
  );
}
