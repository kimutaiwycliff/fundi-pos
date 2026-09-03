import { redirect } from 'next/navigation';
import { platformFetch, PlatformApiError } from './platform-client';

export type CurrentPlatformAdmin = {
  id: number;
  email: string;
  name: string | null;
};

// Mirrors lib/current-user.ts's getCurrentUser() exactly, hitting the
// platform-admins collection's own /me endpoint and redirecting to the
// platform login instead of the tenant one.
export async function getCurrentPlatformAdmin(): Promise<CurrentPlatformAdmin> {
  try {
    const result = await platformFetch<{ user: CurrentPlatformAdmin | null }>('/api/platform-admins/me');
    if (!result.user) redirect('/platform/login');
    return result.user;
  } catch (err) {
    if (err instanceof PlatformApiError && err.status === 401) {
      redirect('/platform/login');
    }
    throw err;
  }
}
