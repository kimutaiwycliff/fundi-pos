import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { LogoutButton } from '@/components/logout-button';
import { payloadFetch, PayloadApiError } from '@/lib/payload-client';

type CurrentUser = {
  user: { id: number; email: string; role: string; tenant: { name: string } | number } | null;
};

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/products', label: 'Products' },
  { href: '/dashboard/stores', label: 'Stores' },
  { href: '/dashboard/staff', label: 'Staff' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let me: CurrentUser['user'] = null;
  try {
    const result = await payloadFetch<CurrentUser>('/api/users/me');
    me = result.user;
  } catch (err) {
    if (err instanceof PayloadApiError && err.status === 401) {
      redirect('/login');
    }
    throw err;
  }

  if (!me) redirect('/login');

  const tenantName = typeof me.tenant === 'object' ? me.tenant.name : `Tenant #${me.tenant}`;

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="px-4 py-3">
          <p className="text-sm font-semibold">Hardware POS</p>
          <p className="text-xs text-muted-foreground">{tenantName}</p>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Manage</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild>
                      <Link href={item.href}>{item.label}</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-2 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {me.email} · {me.role}
          </p>
          <LogoutButton />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
