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
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LogoutButton } from '@/components/logout-button';
import { LogoMark } from '@/components/marketing/logo-mark';
import { ThemeToggle } from '@/components/theme-toggle';
import { getCurrentUser } from '@/lib/current-user';
import { hasAddon, tenantAccess } from '@hardware-pos/business-logic';
import { BillingBanner } from './billing-banner';
import { NavItems } from './nav-items';
import { PageTitle } from './page-title';
import { UserMenu } from './user-menu';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/sell', label: 'Sell' },
  { href: '/dashboard/products', label: 'Products' },
  { href: '/dashboard/inventory', label: 'Inventory' },
  { href: '/dashboard/purchase-orders', label: 'Restocking' },
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
  const tenant = typeof me.tenant === 'object' ? me.tenant : null;
  const billingStatus = tenant?.billingStatus ?? 'active';
  // Same rule as login (Users.ts beforeLogin -> lib/billing.ts): a tenant
  // can lapse or be canceled while a session cookie is still valid, and
  // getCurrentUser() re-reads the tenant on every navigation, so this
  // catches the "already logged in when it happened" case on the next page.
  const access = tenant ? tenantAccess(tenant) : null;
  if (access && !access.allowed) redirect(`/subscription-canceled?reason=${access.reason}`);
  // Same "already logged in when it happened" reasoning, for a staff
  // member banned mid-session - getCurrentUser() re-fetches live on every
  // dashboard navigation, so this takes effect on their very next page
  // load rather than waiting for the JWT to naturally expire.
  if (me.status === 'banned') redirect('/login');
  const navItems = [
    ...NAV_ITEMS,
    ...(me.role === 'manager' || me.role === 'owner' ? [{ href: '/dashboard/audit-log', label: 'Audit Log' }] : []),
    ...(me.role === 'manager' || me.role === 'owner' ? [{ href: '/dashboard/quotations', label: 'Quotations' }] : []),
    // Sell Online add-on - only listed once a platform admin switches it on.
    ...((me.role === 'manager' || me.role === 'owner') && typeof me.tenant === 'object' && hasAddon(me.tenant, 'sell_online')
      ? [{ href: '/dashboard/promo-codes', label: 'Promo Codes' }]
      : []),
    ...(me.role === 'owner' ? [{ href: '/dashboard/settings', label: 'Settings' }] : []),
  ];

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="gap-2 px-4 py-4 group-data-[collapsible=icon]:px-2">
            <div className="flex items-center gap-2">
              <LogoMark className="size-8 rounded-md" />
              <p className="text-sm font-semibold group-data-[collapsible=icon]:hidden">Fundi</p>
            </div>
            <p className="truncate text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
              {tenantName}
            </p>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Manage</SidebarGroupLabel>
              <SidebarGroupContent>
                <NavItems items={navItems} />
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="gap-2 px-4 py-3 group-data-[collapsible=icon]:px-2">
            <p className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              {me.name || me.email} · {me.role}
            </p>
            <LogoutButton className="w-full justify-start group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2!" />
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="flex h-14 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <div className="min-w-0 flex-1">
              <PageTitle items={navItems} />
            </div>
            <ThemeToggle />
            <UserMenu name={me.name} email={me.email} role={me.role} />
          </header>
          {access ? (
            <BillingBanner access={access} tenantName={tenantName} paidUntil={tenant?.paidUntil} billingStatus={billingStatus} />
          ) : null}
          <main className="flex-1 p-4 sm:p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      <Toaster />
    </TooltipProvider>
  );
}
