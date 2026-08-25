import { redirect } from 'next/navigation';
import { AlertTriangle, Wrench } from 'lucide-react';
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
  { href: '/dashboard/sales', label: 'Sales' },
  { href: '/dashboard/reports', label: 'Reports' },
  { href: '/dashboard/customers', label: 'Customers' },
  { href: '/dashboard/stores', label: 'Stores' },
  { href: '/dashboard/staff', label: 'Staff' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  const tenantName = typeof me.tenant === 'object' ? me.tenant.name : `Tenant #${me.tenant}`;
  const billingStatus = typeof me.tenant === 'object' ? me.tenant.billingStatus : 'active';
  // A tenant can go from active to canceled while an existing session's
  // cookie is still valid (login itself already blocks a canceled tenant -
  // see Users.ts's beforeLogin hook - this covers the "already logged in
  // when it happened" case the login-time check can't).
  if (billingStatus === 'canceled') redirect('/subscription-canceled');
  // Same "already logged in when it happened" reasoning, for a staff
  // member banned mid-session - getCurrentUser() re-fetches live on every
  // dashboard navigation, so this takes effect on their very next page
  // load rather than waiting for the JWT to naturally expire.
  if (me.status === 'banned') redirect('/login');
  const navItems = [
    ...NAV_ITEMS,
    ...(me.role === 'manager' || me.role === 'owner' ? [{ href: '/dashboard/audit-log', label: 'Audit Log' }] : []),
    ...(me.role === 'owner' ? [{ href: '/dashboard/settings', label: 'Settings' }] : []),
  ];

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="gap-2 px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <Wrench className="size-4" />
            </div>
            <p className="text-sm font-semibold">Fundi</p>
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
            {me.name || me.email} · {me.role}
          </p>
          <LogoutButton />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
        </header>
        {billingStatus === 'past_due' ? (
          <div className="flex items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            <span>Your subscription payment is past due. Please update billing to avoid service interruption.</span>
          </div>
        ) : null}
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
