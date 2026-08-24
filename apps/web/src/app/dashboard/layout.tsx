import { Wrench } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { LogoutButton } from '@/components/logout-button';
import { getCurrentUser } from '@/lib/current-user';
import { NavItems } from './nav-items';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/products', label: 'Products' },
  { href: '/dashboard/inventory', label: 'Inventory' },
  { href: '/dashboard/transfers', label: 'Transfers' },
  { href: '/dashboard/exceptions', label: 'Exceptions' },
  { href: '/dashboard/reports', label: 'Reports' },
  { href: '/dashboard/customers', label: 'Customers' },
  { href: '/dashboard/stores', label: 'Stores' },
  { href: '/dashboard/staff', label: 'Staff' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  const tenantName = typeof me.tenant === 'object' ? me.tenant.name : `Tenant #${me.tenant}`;
  const navItems = me.role === 'owner' ? [...NAV_ITEMS, { href: '/dashboard/settings', label: 'Settings' }] : NAV_ITEMS;

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="gap-2 px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <Wrench className="size-4" />
            </div>
            <p className="text-sm font-semibold">Hardware POS</p>
          </div>
          <p className="truncate text-xs text-sidebar-foreground/60">{tenantName}</p>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Manage</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavItems items={navItems} />
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
