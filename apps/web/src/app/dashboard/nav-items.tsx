'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings as SettingsIcon,
  ShoppingCart,
  Store,
  Users,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

const ICONS: Record<string, LucideIcon> = {
  '/dashboard': LayoutDashboard,
  '/dashboard/sell': ShoppingCart,
  '/dashboard/products': Package,
  '/dashboard/inventory': Boxes,
  '/dashboard/transfers': ArrowLeftRight,
  '/dashboard/exceptions': AlertTriangle,
  '/dashboard/reports': BarChart3,
  '/dashboard/customers': Users,
  '/dashboard/stores': Store,
  '/dashboard/staff': UserCog,
  '/dashboard/audit-log': ScrollText,
  '/dashboard/settings': SettingsIcon,
};

export function NavItems({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {items.map((item) => {
        const Icon = ICONS[item.href] ?? Package;
        // Overview's href ("/dashboard") is a prefix of every other route -
        // match it exactly, everything else by prefix so a sub-page (if
        // one ever exists) still highlights its parent nav item.
        const isActive = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton asChild isActive={isActive}>
              <Link href={item.href}>
                <Icon />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
