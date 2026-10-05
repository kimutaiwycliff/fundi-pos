import type { ReactNode } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  formatPriceSummary,
  productImage,
  productOrderLink,
  productPath,
  type Availability,
  type StorefrontProduct,
  type StorefrontShop,
} from './storefront-data';

// Plain server components - wa.me links and anchors need no client state.

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden className={cn('size-5', className)}>
      <path d="M16.004 2.667c-7.363 0-13.333 5.97-13.333 13.333 0 2.351.615 4.646 1.782 6.667L2.667 29.333l6.836-1.793a13.29 13.29 0 0 0 6.5 1.727h.006c7.363 0 13.333-5.97 13.333-13.333 0-3.56-1.386-6.907-3.903-9.424a13.24 13.24 0 0 0-9.435-3.843Zm0 24.4h-.005a11.08 11.08 0 0 1-5.646-1.546l-.405-.24-4.057 1.064 1.083-3.955-.264-.406a11.05 11.05 0 0 1-1.694-5.884c0-6.122 4.983-11.104 11.11-11.104a11.04 11.04 0 0 1 7.86 3.257 11.04 11.04 0 0 1 3.25 7.856c-.003 6.123-4.986 11.958-11.232 11.958Zm6.098-8.316c-.334-.167-1.98-.977-2.287-1.088-.307-.111-.53-.167-.753.167-.223.334-.865 1.088-1.06 1.311-.195.223-.39.25-.723.083-.334-.167-1.409-.52-2.684-1.657-.992-.885-1.662-1.978-1.856-2.312-.195-.334-.02-.514.146-.68.15-.15.334-.39.5-.585.167-.195.223-.334.334-.557.111-.223.056-.418-.028-.585-.084-.167-.753-1.815-1.032-2.486-.272-.653-.548-.565-.753-.576a14.4 14.4 0 0 0-.641-.012.923.923 0 0 0-.669.223c-.223.223-.865.845-.865 2.062 0 1.216.886 2.39 1.008 2.556.125.167 1.744 2.663 4.226 3.734.59.255 1.05.407 1.409.52.592.188 1.13.161 1.556.098.475-.07 1.464-.598 1.67-1.176.204-.578.204-1.073.14-1.176-.06-.104-.223-.167-.446-.278Z" />
    </svg>
  );
}

export function WhatsAppOrderButton({
  href,
  label = 'Order on WhatsApp',
  size = 'md',
  className,
}: {
  href: string | null;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full bg-[#1f8f4e] font-medium text-white shadow-sm transition-colors hover:bg-[#187a41] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f8f4e]',
        size === 'sm' && 'h-9 px-3 text-sm',
        size === 'md' && 'h-11 px-5 text-sm',
        size === 'lg' && 'h-12 px-6 text-base',
        className,
      )}
    >
      <WhatsAppIcon className={size === 'sm' ? 'size-4' : 'size-5'} />
      <span className="truncate">{label}</span>
    </a>
  );
}

export function AvailabilityBadge({ availability, className }: { availability: Availability; className?: string }) {
  if (availability === 'low') {
    return <Badge className={cn('border-amber-300 bg-amber-100 text-amber-900', className)}>Last pieces</Badge>;
  }
  if (availability === 'sold_out') {
    return <Badge className={cn('border-stone-300 bg-stone-200 text-stone-600', className)}>Sold out</Badge>;
  }
  return null;
}

export function ImagePlaceholder({ name, className }: { name: string; className?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '•';
  return (
    <div
      aria-hidden
      className={cn(
        'flex h-full w-full items-center justify-center bg-gradient-to-br from-[#f3e7da] via-[#efe0cf] to-[#e6d2bd] font-serif text-5xl text-[#a07e5f]',
        className,
      )}
    >
      {initial}
    </div>
  );
}

export function ProductCard({ shop, product }: { shop: StorefrontShop; product: StorefrontProduct }) {
  const image = productImage(product);
  const soldOut = product.availability === 'sold_out';
  const href = productPath(shop.slug, product.id);
  const orderLink = soldOut ? null : productOrderLink(shop, product);

  return (
    <article
      className={cn(
        'group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#eadfd3] bg-white shadow-[0_1px_2px_rgba(60,40,20,0.04)] transition-shadow hover:shadow-md',
        soldOut && 'opacity-60',
      )}
    >
      <Link href={href} className="relative block aspect-[4/5] overflow-hidden bg-[#f6eee5]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            className={cn(
              'h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]',
              soldOut && 'grayscale',
            )}
          />
        ) : (
          <ImagePlaceholder name={product.name} />
        )}
        <AvailabilityBadge availability={product.availability} className="absolute top-2 left-2" />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link href={href} className="min-w-0">
          <h3 className="line-clamp-2 text-sm leading-snug font-medium text-stone-900 sm:text-base">{product.name}</h3>
          <p className={cn('mt-1 text-sm font-semibold text-[#8a5a33]', soldOut && 'text-stone-500 line-through')}>
            {formatPriceSummary(product)}
          </p>
        </Link>
        <div className="mt-auto pt-1">
          {orderLink ? (
            <WhatsAppOrderButton href={orderLink} label="Order" size="sm" className="w-full" />
          ) : soldOut ? (
            <span className="flex h-9 w-full items-center justify-center rounded-full border border-stone-200 text-xs text-stone-500">
              Sold out
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ShopFooter() {
  return (
    <footer className="border-t border-[#eadfd3] px-4 py-6 text-center text-xs text-stone-500">
      Powered by{' '}
      <Link href="/" className="font-medium text-stone-700 underline-offset-4 hover:underline">
        Fundi POS
      </Link>
    </footer>
  );
}

// Fixed light, warm palette regardless of the visitor's dark-mode setting -
// this page is the shop's own brand surface, not the Fundi app UI.
export function ShopShell({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full flex-1 flex-col overflow-x-hidden bg-[#fbf7f2] text-stone-900">{children}</div>;
}
