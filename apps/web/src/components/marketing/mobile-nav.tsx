'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

// SheetClose and Button both use Radix Slot when `asChild` is set - nesting
// two Slot layers (SheetClose asChild > Button asChild > Link) is the same
// fragile pattern that broke the staff-page dialogs earlier. Styling the
// <Link> directly with buttonVariants keeps this to a single Slot layer.
export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon">
            <Menu />
            <span className="sr-only">Open menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="flex flex-col">
          <SheetHeader className="flex-row items-center justify-between space-y-0">
            <SheetTitle>Menu</SheetTitle>
            <ThemeToggle />
          </SheetHeader>
          <nav className="flex flex-col gap-1 px-4">
            {LINKS.map((link) => (
              <SheetClose asChild key={link.href}>
                <a href={link.href} className="rounded-md px-2 py-2.5 text-sm font-medium hover:bg-muted">
                  {link.label}
                </a>
              </SheetClose>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-2 p-4">
            <SheetClose asChild>
              <Link href="/login" className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
                Log in
              </Link>
            </SheetClose>
            <SheetClose asChild>
              <Link href="/signup" className={cn(buttonVariants({ variant: 'default' }), 'w-full')}>
                Start free trial
              </Link>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
