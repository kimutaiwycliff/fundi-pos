'use client';

import { useRouter } from 'next/navigation';

// Shared by LogoutButton (sidebar footer) and the header's user menu, so the
// sign-out request/redirect sequence lives in exactly one place.
export function useLogout() {
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return { logout };
}
