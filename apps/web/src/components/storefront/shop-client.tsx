'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { buildWhatsAppLink, formatCutoff, quoteDelivery, sameDayOpen } from '@hardware-pos/business-logic';
import { cn } from '@/lib/utils';
import { fuzzySearch } from '@/lib/fuzzy-search';
import {
  formatKes,
  formatPriceSummary,
  galleryPhotos,
  photoSrcSet,
  priceSummary,
  productPhotos,
  productPath,
  productUrl,
  shopPath,
  shopUrl,
  type StorefrontProduct,
  type StorefrontShop,
  type StorefrontVariant,
  variantPhotos,
} from './storefront-data';
import { AvailabilityBadge, ImagePlaceholder, WhatsAppIcon } from './storefront-ui';
import { ProductGallery } from './product-gallery';
import { sameLine, shopActions, useShopState, type LineRef } from './shop-store';

// ---------------------------------------------------------------- helpers

function findVariant(product: StorefrontProduct, variantId: string | null): StorefrontVariant | null {
  return variantId ? (product.variants.find((v) => v.id === variantId) ?? null) : null;
}

function linePrice(product: StorefrontProduct, variantId: string | null): number {
  return findVariant(product, variantId)?.price ?? product.price;
}

function lineLabel(product: StorefrontProduct, variantId: string | null): string {
  const variant = findVariant(product, variantId);
  return variant ? `${product.name} (${variant.label})` : product.name;
}

function lineSoldOut(product: StorefrontProduct, variantId: string | null): boolean {
  return (findVariant(product, variantId)?.availability ?? product.availability) === 'sold_out';
}

// Small (thumb-size) photo for bag / wishlist / saved-for-later lines.
function lineImage(product: StorefrontProduct, variantId: string | null): string | null {
  return (
    variantPhotos(findVariant(product, variantId))[0]?.thumb ??
    productPhotos(product)[0]?.thumb ??
    product.variants.map((v) => variantPhotos(v)[0]?.thumb).find(Boolean) ??
    null
  );
}

// Short human-friendly order reference the shop can quote back in chat.
function orderReference(): string {
  return Date.now().toString(36).slice(-5).toUpperCase();
}

function useProductIndex(products: StorefrontProduct[]) {
  return useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
}

// ---------------------------------------------------------------- icons

function HeartIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-5', className)} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.6}>
      <path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4 7.4 4c2 0 3.5 1.1 4.6 2.6C13.1 5.1 14.6 4 16.6 4c3.5 0 5.8 3.6 4.6 7.1-1.7 4.8-9.2 9.4-9.2 9.4Z" strokeLinejoin="round" />
    </svg>
  );
}

function BagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-5', className)} fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" strokeLinejoin="round" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-5', className)} fill="none" stroke="currentColor" strokeWidth={1.6}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" strokeLinecap="round" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-5', className)} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-5', className)} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-5', className)} fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------- drawer
// In-place (not portalled) so it inherits the shop's palette and typeface.

function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50 motion-safe:animate-in motion-safe:fade-in" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-(--sf-surface) text-(--sf-ink) shadow-2xl sm:max-w-md sm:border-l sm:border-(--sf-line) outline-none motion-safe:animate-in motion-safe:slide-in-from-right"
      >
        <div className="flex items-center justify-between border-b border-(--sf-line) py-2 pr-2 pl-4 sm:pl-5">
          <h2 className="text-lg font-medium">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 items-center justify-center rounded-full text-(--sf-muted) hover:bg-(--sf-shell) hover:text-(--sf-ink)">
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
        {footer ? <div className="border-t border-(--sf-line) px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">{footer}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- theme
// Light/dark follows the visitor's system setting until they tap the
// toggle; the choice is kept per browser under THEME_KEY and applied as
// data-sf-theme on <html> (the .sf-root palette in globals.css keys off
// it). Picking the theme the system would give anyway clears the stored
// value, so the shop goes back to following the system.

const THEME_KEY = 'fundi-shop-theme';
type ShopTheme = 'light' | 'dark';

// Runs during HTML parsing (rendered by app/shop/layout.tsx) so the first
// paint already has the stored theme - no flash. On the client it renders
// as text/plain, so soft navigations don't re-run it or trip React's
// "script tag" dev warning; ShopThemeToggle's layout effect covers those.
export function ShopThemeScript() {
  const html = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-sf-theme",t)}catch(e){}`;
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function storedTheme(): ShopTheme | null {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

function systemTheme(): ShopTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: ShopTheme | null) {
  if (theme) document.documentElement.setAttribute('data-sf-theme', theme);
  else document.documentElement.removeAttribute('data-sf-theme');
}

const THEME_EVENT = 'shop:theme';

function subscribeTheme(onChange: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    media.removeEventListener('change', onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

// <html data-sf-theme> is the source of truth once the inline script or the
// toggle has run; without it the shop is following the system.
function resolvedTheme(): ShopTheme {
  const attr = document.documentElement.getAttribute('data-sf-theme');
  return attr === 'light' || attr === 'dark' ? attr : systemTheme();
}
// Unknown on the server - the button renders a neutral state until hydrated.
const serverTheme = (): ShopTheme | null => null;

export function ShopThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, resolvedTheme, serverTheme);

  // Re-apply on mount: covers soft navigations into the shop (the inline
  // script only runs on a full page load) and the dev Strict Mode remount
  // resetting <html> attributes. Also keeps other tabs in sync.
  useLayoutEffect(() => {
    const sync = () => {
      applyTheme(storedTheme());
      window.dispatchEvent(new Event(THEME_EVENT));
    };
    sync();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  function toggle() {
    const next: ShopTheme = resolvedTheme() === 'dark' ? 'light' : 'dark';
    const explicit = next !== systemTheme();
    try {
      if (explicit) localStorage.setItem(THEME_KEY, next);
      else localStorage.removeItem(THEME_KEY);
    } catch {
      // Storage blocked (private mode): still switch for this page view.
    }
    applyTheme(explicit ? next : null);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button type="button" onClick={toggle} aria-label={theme ? label : 'Switch colour theme'} title={theme ? label : undefined} className={ICON_BUTTON}>
      {theme === 'dark' ? <SunIcon /> : <MoonIcon className={theme ? undefined : 'opacity-0'} />}
    </button>
  );
}

// ---------------------------------------------------------------- header

// 44px touch targets; relative so count dots can sit on the corner.
const ICON_BUTTON =
  'relative flex size-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-(--sf-shell) focus-visible:outline-2 focus-visible:outline-(--sf-ink)';

export function ShopTopBar({ shop, products, back }: { shop: StorefrontShop; products: StorefrontProduct[]; back?: boolean }) {
  const state = useShopState(shop.slug);
  const [bagOpen, setBagOpen] = useState(false);
  const [wishOpen, setWishOpen] = useState(false);
  const bagCount = state.bag.reduce((sum, l) => sum + l.quantity, 0);

  // Lets "Add to bag" elsewhere on the page open the bag.
  useEffect(() => {
    const open = () => setBagOpen(true);
    window.addEventListener('shop:open-bag', open);
    return () => window.removeEventListener('shop:open-bag', open);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-(--sf-line) bg-(--sf-bg)/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 pr-2 pl-4 sm:pr-3">
          {back ? (
            <Link href={shopPath(shop.slug)} className="flex min-w-0 items-center gap-2 text-(--sf-muted) hover:text-(--sf-ink)">
              <svg viewBox="0 0 24 24" aria-hidden className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6}>
                <path d="M15 5 8 12l7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="truncate text-base font-medium tracking-wide text-(--sf-ink)">{shop.name}</span>
            </Link>
          ) : (
            <span className="min-w-0 truncate text-base font-medium tracking-wide">{shop.name}</span>
          )}
          <div className="ml-auto flex shrink-0 items-center">
            <ShopThemeToggle />
            {back ? (
              <Link href={`${shopPath(shop.slug)}#search`} aria-label="Search the shop" className={ICON_BUTTON}>
                <SearchIcon />
              </Link>
            ) : null}
            <button type="button" onClick={() => setWishOpen(true)} aria-label={`Wishlist, ${state.wishlist.length} items`} className={ICON_BUTTON}>
              <HeartIcon />
              {state.wishlist.length > 0 ? <CountDot value={state.wishlist.length} tone="petal" /> : null}
            </button>
            <button type="button" onClick={() => setBagOpen(true)} aria-label={`Bag, ${bagCount} items`} className={ICON_BUTTON}>
              <BagIcon />
              {bagCount > 0 ? <CountDot value={bagCount} tone="ink" /> : null}
            </button>
          </div>
        </div>
      </header>
      <BagDrawer open={bagOpen} onClose={() => setBagOpen(false)} shop={shop} products={products} />
      <WishlistDrawer open={wishOpen} onClose={() => setWishOpen(false)} shop={shop} products={products} />
    </>
  );
}

function CountDot({ value, tone }: { value: number; tone: 'ink' | 'petal' }) {
  return (
    <span
      className={cn(
        'absolute top-1.5 right-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-medium tabular-nums',
        tone === 'ink' ? 'bg-(--sf-ink) text-(--sf-on-ink)' : 'bg-(--sf-petal) text-(--sf-on-petal)',
      )}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}

// ---------------------------------------------------------------- bag

function QuantityStepper({
  value,
  onChange,
  label,
  size = 'sm',
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  size?: 'sm' | 'lg';
}) {
  const step = cn('rounded-full text-lg leading-none hover:bg-(--sf-shell)', size === 'lg' ? 'size-11' : 'size-9');
  return (
    <div className="inline-flex shrink-0 items-center rounded-full border border-(--sf-line)" role="group" aria-label={`Quantity for ${label}`}>
      <button type="button" onClick={() => onChange(value - 1)} className={step} aria-label="Decrease quantity">
        −
      </button>
      <span className="w-7 text-center text-sm tabular-nums">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} className={step} aria-label="Increase quantity">
        +
      </button>
    </div>
  );
}

function LineThumb({ product, variantId }: { product: StorefrontProduct; variantId: string | null }) {
  const image = lineImage(product, variantId);
  return (
    <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-(--sf-shell)">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <ImagePlaceholder name={product.name} className="text-2xl" />
      )}
    </div>
  );
}

function BagDrawer({ open, onClose, shop, products }: { open: boolean; onClose: () => void; shop: StorefrontShop; products: StorefrontProduct[] }) {
  const state = useShopState(shop.slug);
  const byId = useProductIndex(products);
  const lines = state.bag.map((l) => ({ ...l, product: byId.get(l.productId) })).filter((l) => l.product) as Array<
    (typeof state.bag)[number] & { product: StorefrontProduct }
  >;
  const saved = state.saved.map((l) => ({ ...l, product: byId.get(l.productId) })).filter((l) => l.product) as Array<
    LineRef & { product: StorefrontProduct }
  >;
  const orderable = lines.filter((l) => !lineSoldOut(l.product, l.variantId));
  const total = orderable.reduce((sum, l) => sum + linePrice(l.product, l.variantId) * l.quantity, 0);

  // Delivery (Settings -> Online shop -> Delivery & payment). With a single
  // zone it's picked automatically; with none, the total stays "before
  // delivery" exactly as before.
  const delivery = shop.delivery;
  const zones = delivery?.zones ?? [];
  const zone = zones.find((z) => z.name === state.deliveryZone) ?? (zones.length === 1 ? zones[0] : null);
  const quote = quoteDelivery(total, zone, delivery?.freeThreshold);
  const grandTotal = total + quote.fee;
  const offersPayOnDelivery = delivery?.payOnDelivery === true;

  function sendOrder() {
    const ref = orderReference();
    const rows = orderable.map(
      (l, i) => `${i + 1}. ${lineLabel(l.product, l.variantId)} × ${l.quantity} = ${formatKes(linePrice(l.product, l.variantId) * l.quantity)}`,
    );
    const message = [
      `Hi ${shop.name}! I'd like to order (ref ${ref}):`,
      ...rows,
      zone ? `Subtotal: ${formatKes(total)}` : null,
      zone ? `Delivery (${zone.name}): ${quote.fee === 0 ? 'FREE' : formatKes(quote.fee)}` : null,
      zone ? `Total: ${formatKes(grandTotal)}` : `Total: ${formatKes(total)} (before delivery)`,
      offersPayOnDelivery ? `Payment: ${state.payOnDelivery ? 'pay on delivery' : 'M-Pesa'}` : null,
      state.customerName.trim() ? `Name: ${state.customerName.trim()}` : null,
      state.deliveryArea.trim() ? `Deliver to: ${state.deliveryArea.trim()}` : null,
      `Shop: ${shopUrl(shop.slug)}`,
    ]
      .filter(Boolean)
      .join('\n');
    const link = buildWhatsAppLink(shop.whatsappNumber, message);
    if (link) window.open(link, '_blank', 'noopener,noreferrer');
  }

  const canOrder = Boolean(shop.whatsappNumber) && orderable.length > 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Your bag"
      footer={
        lines.length > 0 ? (
          <div className="flex flex-col gap-3">
            {orderable.length > 0 && quote.progress != null ? (
              <div>
                <p className="text-sm">
                  {quote.remainingForFree != null ? (
                    <>
                      <span className="font-medium tabular-nums">{formatKes(quote.remainingForFree)}</span> away from free delivery
                    </>
                  ) : (
                    'You get free delivery'
                  )}
                </p>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-(--sf-shell)"
                  role="progressbar"
                  aria-label="Progress to free delivery"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(quote.progress * 100)}
                >
                  <div className="h-full rounded-full bg-(--sf-ink) transition-[width] duration-500" style={{ width: `${quote.progress * 100}%` }} />
                </div>
              </div>
            ) : null}
            {zones.length > 0 ? (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-(--sf-muted)">Deliver to</span>
                <select
                  value={zone?.name ?? ''}
                  onChange={(e) => shopActions.setCustomer(shop.slug, { deliveryZone: e.target.value })}
                  className="h-11 w-full min-w-0 rounded-full border border-(--sf-line) bg-(--sf-surface) px-4 text-sm text-(--sf-ink) outline-none focus:border-(--sf-ink)"
                >
                  {zones.length > 1 && !zone ? <option value="">Choose your area</option> : null}
                  {zones.map((z) => (
                    <option key={z.name} value={z.name}>
                      {z.name} · {z.fee === 0 ? 'Free' : formatKes(z.fee)}
                      {z.eta ? ` · ${z.eta}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
              <input
                aria-label="Your name"
                placeholder="Your name"
                value={state.customerName}
                onChange={(e) => shopActions.setCustomer(shop.slug, { customerName: e.target.value })}
                className="h-10 rounded-full border border-(--sf-line) px-4 text-sm outline-none focus:border-(--sf-ink)"
              />
              <input
                aria-label={zones.length > 0 ? 'Estate or landmark' : 'Delivery area'}
                placeholder={zones.length > 0 ? 'Estate / landmark' : 'Delivery area'}
                value={state.deliveryArea}
                onChange={(e) => shopActions.setCustomer(shop.slug, { deliveryArea: e.target.value })}
                className="h-10 rounded-full border border-(--sf-line) px-4 text-sm outline-none focus:border-(--sf-ink)"
              />
            </div>
            {offersPayOnDelivery ? (
              <div className="grid grid-cols-2 gap-1 rounded-full bg-(--sf-shell) p-1" role="radiogroup" aria-label="How you'll pay">
                {[
                  { value: false, label: 'M-Pesa' },
                  { value: true, label: 'Pay on delivery' },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    role="radio"
                    aria-checked={state.payOnDelivery === option.value}
                    onClick={() => shopActions.setCustomer(shop.slug, { payOnDelivery: option.value })}
                    className={cn(
                      'h-10 rounded-full text-sm transition-colors',
                      state.payOnDelivery === option.value ? 'bg-(--sf-ink) font-medium text-(--sf-on-ink)' : 'text-(--sf-muted) hover:text-(--sf-ink)',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            {zone ? (
              <dl className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-(--sf-muted)">Subtotal</dt>
                  <dd className="tabular-nums">{formatKes(total)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-(--sf-muted)">Delivery</dt>
                  <dd className="tabular-nums">{quote.fee === 0 ? 'Free' : formatKes(quote.fee)}</dd>
                </div>
              </dl>
            ) : null}
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-(--sf-muted)">{zone ? 'Total' : zones.length > 0 ? 'Total - choose your area' : 'Total before delivery'}</span>
              <span className="text-xl font-medium tabular-nums">{formatKes(zone ? grandTotal : total)}</span>
            </div>
            <button
              type="button"
              disabled={!canOrder}
              onClick={sendOrder}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-(--sf-wa) text-base font-medium text-white transition-colors hover:bg-(--sf-wa-hover) disabled:opacity-40"
            >
              <WhatsAppIcon />
              Send order on WhatsApp
            </button>
            <p className="text-center text-xs text-(--sf-muted)">
              {shop.whatsappNumber
                ? 'Opens WhatsApp with your order filled in. We confirm stock, delivery and payment there.'
                : 'This shop has not added a WhatsApp number yet.'}
            </p>
          </div>
        ) : null
      }
    >
      {lines.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-base">Your bag is empty</p>
          <p className="mt-1 text-sm text-(--sf-muted)">Tap “Add” on anything you like.</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-(--sf-line)">
          {lines.map((l) => {
            const soldOut = lineSoldOut(l.product, l.variantId);
            return (
              <li key={`${l.productId}:${l.variantId}`} className="flex gap-4 py-4">
                <LineThumb product={l.product} variantId={l.variantId} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link href={productPath(shop.slug, l.productId)} onClick={onClose} className="line-clamp-2 text-sm font-medium">
                    {l.product.name}
                  </Link>
                  {l.variantId ? <span className="text-xs text-(--sf-muted)">{findVariant(l.product, l.variantId)?.label}</span> : null}
                  {soldOut ? (
                    <span className="text-xs text-(--sf-petal)">Sold out - remove or save it for later</span>
                  ) : (
                    <span className="text-sm tabular-nums">{formatKes(linePrice(l.product, l.variantId) * l.quantity)}</span>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {!soldOut ? (
                      <QuantityStepper value={l.quantity} label={l.product.name} onChange={(n) => shopActions.setQuantity(shop.slug, l, n)} />
                    ) : null}
                    <button type="button" onClick={() => shopActions.saveForLater(shop.slug, l)} className="text-xs text-(--sf-muted) underline-offset-4 hover:underline">
                      Save for later
                    </button>
                    <button type="button" onClick={() => shopActions.removeFromBag(shop.slug, l)} className="text-xs text-(--sf-muted) underline-offset-4 hover:underline">
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {saved.length > 0 ? (
        <section className="mt-6 border-t border-(--sf-line) pt-5">
          <h3 className="text-sm font-medium">Saved for later</h3>
          <ul className="mt-3 flex flex-col gap-3">
            {saved.map((l) => (
              <li key={`saved:${l.productId}:${l.variantId}`} className="flex items-center gap-3">
                <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-(--sf-shell)">
                  {lineImage(l.product, l.variantId) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={lineImage(l.product, l.variantId)!} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{lineLabel(l.product, l.variantId)}</p>
                  <p className="text-xs text-(--sf-muted) tabular-nums">{formatKes(linePrice(l.product, l.variantId))}</p>
                </div>
                {!lineSoldOut(l.product, l.variantId) ? (
                  <button type="button" onClick={() => shopActions.moveSavedToBag(shop.slug, l)} className="shrink-0 rounded-full border border-(--sf-line) px-3 py-2 text-xs hover:border-(--sf-ink)">
                    Move to bag
                  </button>
                ) : (
                  <span className="text-xs text-(--sf-muted)">Sold out</span>
                )}
                <button type="button" onClick={() => shopActions.removeSaved(shop.slug, l)} aria-label={`Remove ${l.product.name}`} className="flex size-9 shrink-0 items-center justify-center rounded-full text-(--sf-muted) hover:bg-(--sf-shell)">
                  <CloseIcon className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Drawer>
  );
}

// ---------------------------------------------------------------- wishlist

function WishlistDrawer({ open, onClose, shop, products }: { open: boolean; onClose: () => void; shop: StorefrontShop; products: StorefrontProduct[] }) {
  const state = useShopState(shop.slug);
  const byId = useProductIndex(products);
  const items = state.wishlist.map((l) => ({ ...l, product: byId.get(l.productId) })).filter((l) => l.product) as Array<
    LineRef & { product: StorefrontProduct }
  >;

  return (
    <Drawer open={open} onClose={onClose} title="Wishlist">
      {items.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-base">Nothing saved yet</p>
          <p className="mt-1 text-sm text-(--sf-muted)">Tap the heart on any piece to keep it here.</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-(--sf-line)">
          {items.map((l) => {
            const soldOut = lineSoldOut(l.product, l.variantId);
            const needsOption = !l.variantId && l.product.variants.length > 0;
            return (
              <li key={`wish:${l.productId}:${l.variantId}`} className="flex gap-4 py-4">
                <LineThumb product={l.product} variantId={l.variantId} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link href={productPath(shop.slug, l.productId)} onClick={onClose} className="line-clamp-2 text-sm font-medium">
                    {lineLabel(l.product, l.variantId)}
                  </Link>
                  <span className="text-sm text-(--sf-muted) tabular-nums">{formatPriceSummary(l.product)}</span>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    {soldOut ? (
                      <span className="text-xs text-(--sf-muted)">Sold out</span>
                    ) : needsOption ? (
                      <Link href={productPath(shop.slug, l.productId)} onClick={onClose} className="rounded-full border border-(--sf-line) px-3 py-2 text-xs hover:border-(--sf-ink)">
                        Choose an option
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => shopActions.addToBag(shop.slug, l)}
                        className="rounded-full bg-(--sf-ink) px-3 py-2 text-xs text-(--sf-on-ink)"
                      >
                        Add to bag
                      </button>
                    )}
                    <button type="button" onClick={() => shopActions.toggleWishlist(shop.slug, l)} className="text-xs text-(--sf-muted) underline-offset-4 hover:underline">
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------- product card

function useAddedFlash(): [boolean, () => void] {
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return [
    added,
    () => {
      setAdded(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setAdded(false), 1600);
    },
  ];
}

// Grid: 2 cols on phones, 3 at md, 4 at lg, 5 at xl (max-w-6xl page).
const CARD_SIZES = '(min-width: 1280px) 220px, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw';

export function ProductCard({ shop, product }: { shop: StorefrontShop; product: StorefrontProduct }) {
  const state = useShopState(shop.slug);
  const [added, flash] = useAddedFlash();
  // Cover + (on hover-capable screens) the second photo crossfading in.
  const photos = galleryPhotos(product, null);
  const cover = photos[0] ?? null;
  const second = photos[1] ?? null;
  // The second photo is only requested once a mouse hovers the card, so
  // phones never download it.
  const [wantSecond, setWantSecond] = useState(false);
  const soldOut = product.availability === 'sold_out';
  const href = productPath(shop.slug, product.id);
  const ref: LineRef = { productId: product.id, variantId: null };
  const wished = state.wishlist.some((l) => l.productId === product.id);
  const needsOption = product.variants.length > 0;

  return (
    <article className="group flex min-w-0 flex-col">
      <div className="relative">
        <Link
          href={href}
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse' && second) setWantSecond(true);
          }}
          className="block aspect-[4/5] overflow-hidden rounded-2xl bg-(--sf-shell)"
        >
          {cover ? (
            <div className={cn('relative h-full w-full transition-transform duration-500 motion-safe:group-hover:scale-[1.03]', soldOut && 'opacity-60 grayscale')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover.card}
                srcSet={photoSrcSet(cover, ['thumb', 'card'])}
                sizes={CARD_SIZES}
                width={cover.width ?? undefined}
                height={cover.height ?? undefined}
                alt={cover.alt?.trim() || product.name}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
              {second && wantSecond ? (
                // Tailwind v4's hover: only applies on hover-capable devices.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={second.card}
                  srcSet={photoSrcSet(second, ['thumb', 'card'])}
                  sizes={CARD_SIZES}
                  alt=""
                  aria-hidden
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:transition-none"
                />
              ) : null}
            </div>
          ) : (
            <ImagePlaceholder name={product.name} />
          )}
        </Link>
        <AvailabilityBadge availability={product.availability} className="absolute top-2.5 left-2.5" />
        <button
          type="button"
          onClick={() => shopActions.toggleWishlist(shop.slug, ref)}
          aria-pressed={wished}
          aria-label={wished ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          className={cn(
            'absolute top-1.5 right-1.5 flex size-10 items-center justify-center rounded-full bg-(--sf-surface)/90 transition-colors',
            wished ? 'text-(--sf-petal)' : 'text-(--sf-ink) hover:text-(--sf-petal)',
          )}
        >
          <HeartIcon filled={wished} className="size-[18px]" />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1 pt-3">
        <Link href={href} className="line-clamp-2 text-sm leading-snug sm:text-[15px]">
          {product.name}
        </Link>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 pt-1">
          <span className={cn('text-sm font-medium whitespace-nowrap tabular-nums', soldOut && 'text-(--sf-muted)')}>{formatPriceSummary(product)}</span>
          {soldOut ? null : needsOption ? (
            <Link href={href} className="inline-flex h-9 shrink-0 items-center rounded-full border border-(--sf-line) px-3.5 text-xs hover:border-(--sf-ink)">
              Options
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                shopActions.addToBag(shop.slug, ref);
                flash();
              }}
              className={cn(
                'h-9 shrink-0 rounded-full px-3.5 text-xs transition-colors',
                added ? 'border border-(--sf-ink) bg-(--sf-ink) text-(--sf-on-ink)' : 'border border-(--sf-line) hover:border-(--sf-ink)',
              )}
              aria-live="polite"
            >
              {added ? 'Added' : 'Add'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function ProductGrid({ shop, products }: { shop: StorefrontShop; products: StorefrontProduct[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 md:grid-cols-3 md:gap-x-5 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((product) => (
        <ProductCard key={product.id} shop={shop} product={product} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- catalog

type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'name';

export function Catalog({ shop, products }: { shop: StorefrontShop; products: StorefrontProduct[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('featured');
  const [inStockOnly, setInStockOnly] = useState(false);

  // Product pages link here with ?q= (header search) - pick it up once.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q) setQuery(q);
  }, []);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) counts.set(p.category || 'Other', (counts.get(p.category || 'Other') ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)));
  }, [products]);

  const results = useMemo(() => {
    let list = products;
    if (category) list = list.filter((p) => (p.category || 'Other') === category);
    if (inStockOnly) list = list.filter((p) => p.availability !== 'sold_out');
    // Fuzzy, typo-tolerant ("romer", "blnket") across names, categories,
    // descriptions and sizes/colours; keeps relevance order while searching.
    if (query.trim()) {
      list = fuzzySearch(list, ['name', 'category', 'description', 'variants.label'], query);
    }
    if (sort === 'price-asc') list = [...list].sort((a, b) => priceSummary(a).amount - priceSummary(b).amount);
    if (sort === 'price-desc') list = [...list].sort((a, b) => priceSummary(b).amount - priceSummary(a).amount);
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [products, category, inStockOnly, query, sort]);

  const askLink = buildWhatsAppLink(shop.whatsappNumber, `Hi ${shop.name}! Do you have ${query.trim() || 'something I am looking for'}?`);

  return (
    <section id="search" className="scroll-mt-16">
      <div className="sticky top-14 z-30 -mx-4 border-b border-(--sf-line) bg-(--sf-bg)/95 px-4 pt-3 pb-3 backdrop-blur">
        <label className="flex h-12 items-center gap-3 rounded-full bg-(--sf-shell) px-4 focus-within:ring-2 focus-within:ring-(--sf-ink)/20">
          <SearchIcon className="shrink-0 text-(--sf-muted)" />
          <span className="sr-only">Search {shop.name}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${products.length} pieces`}
            className="min-w-0 flex-1 bg-transparent text-base text-(--sf-ink) outline-none placeholder:text-(--sf-muted)"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-(--sf-muted) hover:text-(--sf-ink)">
              <CloseIcon className="size-4" />
            </button>
          ) : null}
        </label>
        <div className="mt-3 flex items-center gap-2">
          {/* Fades at the right edge so it's clear the chips scroll sideways. */}
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pr-6 [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none] sm:[mask-image:none] [&::-webkit-scrollbar]:hidden">
            {categories.length > 1 ? (
              <>
                <Chip active={category === null} onClick={() => setCategory(null)}>
                  All
                </Chip>
                {categories.map(([name, count]) => (
                  <Chip key={name} active={category === name} onClick={() => setCategory(category === name ? null : name)}>
                    {name}
                    <span className="ml-1.5 text-(--sf-muted) tabular-nums">{count}</span>
                  </Chip>
                ))}
              </>
            ) : null}
            <Chip active={inStockOnly} onClick={() => setInStockOnly((v) => !v)}>
              In stock
            </Chip>
          </div>
          <label className="shrink-0">
            <span className="sr-only">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-9 w-[6.5rem] rounded-full border border-(--sf-line) bg-(--sf-surface) px-3 text-xs text-(--sf-ink) outline-none focus:border-(--sf-ink) sm:w-auto"
            >
              <option value="featured">Featured</option>
              <option value="price-asc">Price: low–high</option>
              <option value="price-desc">Price: high–low</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
      </div>

      <div className="pt-6">
        {results.length === 0 ? (
          <div className="mx-auto max-w-sm py-16 text-center">
            <p className="text-lg">{query ? `Nothing matches “${query}”` : 'No pieces here yet'}</p>
            <p className="mt-2 text-sm text-(--sf-muted)">
              {query ? 'Try a shorter word, or ask us - not everything in the shop is online.' : 'Try another category.'}
            </p>
            {query && askLink ? (
              <a href={askLink} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-(--sf-wa) px-5 text-sm font-medium text-white hover:bg-(--sf-wa-hover)">
                <WhatsAppIcon />
                Ask us on WhatsApp
              </a>
            ) : null}
          </div>
        ) : (
          <>
            {query || category || inStockOnly ? (
              <p className="mb-4 text-sm text-(--sf-muted)">
                {results.length} {results.length === 1 ? 'piece' : 'pieces'}
              </p>
            ) : null}
            <ProductGrid shop={shop} products={results} />
          </>
        )}
      </div>
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-9 shrink-0 rounded-full border px-3.5 text-xs transition-colors',
        active ? 'border-(--sf-ink) bg-(--sf-ink) text-(--sf-on-ink) [&>span]:text-(--sf-on-ink)/70' : 'border-(--sf-line) hover:border-(--sf-ink)',
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- delivery promise

// "Order by 4pm for same-day delivery in Nairobi · Pay on delivery or
// M-Pesa · Delivery from KES 200 · Free delivery over KES 5,000" - only the
// parts the owner actually set. The same-day line depends on the current
// Nairobi time, so it only renders after mount (no server/client mismatch)
// and refreshes every minute.
export function DeliveryPromise({ shop, className }: { shop: StorefrontShop; className?: string }) {
  const delivery = shop.delivery;
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  if (!delivery) return null;

  const items: string[] = [];
  const cutoff = formatCutoff(delivery.sameDayCutoff);
  const where = delivery.sameDayArea ? ` in ${delivery.sameDayArea}` : '';
  if (cutoff && now) {
    items.push(
      sameDayOpen(delivery.sameDayCutoff, now)
        ? `Order by ${cutoff} for same-day delivery${where}`
        : `Order now for delivery tomorrow${where}`,
    );
  }
  if (delivery.payOnDelivery) items.push('Pay on delivery or M-Pesa');
  if (delivery.zones.length > 0) {
    const cheapest = Math.min(...delivery.zones.map((z) => z.fee));
    items.push(cheapest === 0 ? 'Free delivery options' : `Delivery from ${formatKes(cheapest)}`);
  }
  if (delivery.freeThreshold) items.push(`Free delivery over ${formatKes(delivery.freeThreshold)}`);
  if (items.length === 0) return null;

  return (
    <ul className={cn('flex flex-wrap gap-x-5 gap-y-2 text-sm', className)}>
      {items.map((item) => (
        <li key={item} className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-(--sf-wa-text)" />
          {item}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- recently viewed

export function RecentlyViewed({ shop, products, excludeId }: { shop: StorefrontShop; products: StorefrontProduct[]; excludeId?: number }) {
  const state = useShopState(shop.slug);
  const byId = useProductIndex(products);
  const items = state.recent
    .filter((id) => id !== excludeId)
    .map((id) => byId.get(id))
    .filter(Boolean)
    .slice(0, 8) as StorefrontProduct[];
  if (items.length === 0) return null;
  return (
    <section className="mt-14">
      <h2 className="text-lg font-medium">Recently viewed</h2>
      <div className="mt-4 flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((product) => (
          <div key={product.id} className="w-36 shrink-0 sm:w-44">
            <ProductCard shop={shop} product={product} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function RelatedProducts({ shop, products }: { shop: StorefrontShop; products: StorefrontProduct[] }) {
  if (products.length === 0) return null;
  return (
    <section className="mt-14">
      <h2 className="text-lg font-medium">You may also like</h2>
      <div className="mt-4">
        <ProductGrid shop={shop} products={products} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- product detail

export function ProductDetail({ shop, product }: { shop: StorefrontShop; product: StorefrontProduct }) {
  const state = useShopState(shop.slug);
  const hasVariants = product.variants.length > 0;
  const firstAvailable = product.variants.find((v) => v.availability !== 'sold_out') ?? null;
  const [variantId, setVariantId] = useState<string | null>(firstAvailable?.id ?? null);
  const [quantity, setQuantity] = useState(1);
  const [added, flash] = useAddedFlash();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    shopActions.recordView(shop.slug, product.id);
  }, [shop.slug, product.id]);

  const variant = findVariant(product, variantId);
  // The chosen option's own photos first, then the shared product photos.
  const photos = galleryPhotos(product, variant);

  const soldOut = hasVariants ? !variant || variant.availability === 'sold_out' : product.availability === 'sold_out';
  const price = variant?.price ?? product.price;
  const ref: LineRef = { productId: product.id, variantId: hasVariants ? variantId : null };
  const wished = state.wishlist.some((l) => sameLine(l, ref) || (l.productId === product.id && !l.variantId));
  const label = variant ? `${product.name} (${variant.label})` : product.name;
  const buyNowLink = soldOut
    ? null
    : buildWhatsAppLink(
        shop.whatsappNumber,
        `Hi ${shop.name}! I'd like to order: ${label} × ${quantity} = ${formatKes(price * quantity)}. Link: ${productUrl(shop.slug, product.id)}`,
      );
  const askLink = buildWhatsAppLink(shop.whatsappNumber, `Hi ${shop.name}! I have a question about ${label}: ${productUrl(shop.slug, product.id)}`);

  async function share() {
    const url = productUrl(shop.slug, product.id);
    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, text: `${product.name} - ${formatKes(price)} at ${shop.name}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Share sheet dismissed.
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1.1fr_1fr] md:gap-10 lg:gap-12">
      <div className="min-w-0 md:sticky md:top-20 md:self-start">
        {/* Keyed by option: picking one starts its photos from the first. */}
        <ProductGallery
          key={variant?.id ?? 'product'}
          photos={photos}
          name={label}
          dimmed={soldOut}
          placeholder={<ImagePlaceholder name={product.name} className="text-7xl" />}
          badge={<AvailabilityBadge availability={variant?.availability ?? product.availability} className="absolute top-3 left-3" />}
        />
      </div>

      <div className="min-w-0">
        <Link href={`${shopPath(shop.slug)}?q=${encodeURIComponent(product.category)}#search`} className="text-sm text-(--sf-muted) hover:text-(--sf-ink)">
          {product.category}
        </Link>
        <h1 className="mt-1 text-3xl leading-tight font-light break-words hyphens-auto sm:text-4xl">{product.name}</h1>
        <p className="mt-3 text-2xl font-medium tabular-nums">{formatKes(price)}</p>

        {hasVariants ? (
          <fieldset className="mt-7">
            <legend className="text-sm font-medium">Choose {product.variants.length === 1 ? 'option' : 'an option'}</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {product.variants.map((v) => {
                const out = v.availability === 'sold_out';
                const active = v.id === variantId;
                const swatch = variantPhotos(v)[0]?.thumb;
                return (
                  <button
                    key={v.id || v.label}
                    type="button"
                    disabled={out}
                    onClick={() => setVariantId(v.id)}
                    aria-pressed={active}
                    className={cn(
                      'inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors',
                      swatch && 'pl-1.5',
                      active ? 'border-(--sf-ink) bg-(--sf-ink) text-(--sf-on-ink)' : 'border-(--sf-line) hover:border-(--sf-ink)',
                      out && 'cursor-not-allowed text-(--sf-muted) line-through opacity-60 hover:border-(--sf-line)',
                    )}
                  >
                    {swatch ? (
                      // Option photo as a swatch - a preview of what picking it shows.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={swatch} alt="" loading="lazy" decoding="async" className={cn('mr-2 size-8 shrink-0 rounded-full object-cover', out && 'grayscale')} />
                    ) : null}
                    {v.label}
                    {v.price !== product.price ? <span className="ml-1.5 text-xs opacity-80">{formatKes(v.price)}</span> : null}
                  </button>
                );
              })}
            </div>
            {variant?.availability === 'low' ? <p className="mt-2 text-sm text-(--sf-petal)">Only a few left in this option</p> : null}
          </fieldset>
        ) : null}

        <div className="mt-7 flex flex-col gap-3">
          {soldOut ? (
            <p className="text-sm text-(--sf-muted)">This piece is sold out right now.</p>
          ) : (
            // Phones: pinned to the bottom of the screen so "Add to bag" is
            // always a thumb away while browsing photos and options (the
            // product page leaves room for it under the footer). md+: inline.
            <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-(--sf-line) bg-(--sf-bg)/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
              <QuantityStepper size="lg" value={quantity} label={product.name} onChange={(n) => setQuantity(Math.max(1, n))} />
              <button
                type="button"
                onClick={() => {
                  shopActions.addToBag(shop.slug, ref, quantity);
                  flash();
                  window.dispatchEvent(new Event('shop:open-bag'));
                }}
                className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-(--sf-ink) px-4 text-base font-medium text-(--sf-on-ink) transition-opacity hover:opacity-90"
              >
                <BagIcon className="shrink-0" />
                <span className="truncate">{added ? 'Added to bag' : 'Add to bag'}</span>
              </button>
            </div>
          )}
          {buyNowLink ? (
            <a
              href={buyNowLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-(--sf-wa-text) text-base text-(--sf-wa-text) transition-colors hover:border-(--sf-wa) hover:bg-(--sf-wa) hover:text-white"
            >
              <WhatsAppIcon />
              Order this now on WhatsApp
            </a>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => shopActions.toggleWishlist(shop.slug, ref)}
              aria-pressed={wished}
              className={cn('inline-flex h-11 items-center gap-2 rounded-full border border-(--sf-line) px-4 text-sm hover:border-(--sf-ink)', wished && 'text-(--sf-petal)')}
            >
              <HeartIcon filled={wished} className="size-4" />
              {wished ? 'In your wishlist' : 'Save to wishlist'}
            </button>
            <button type="button" onClick={share} className="inline-flex h-11 items-center gap-2 rounded-full border border-(--sf-line) px-4 text-sm hover:border-(--sf-ink)">
              {copied ? 'Link copied' : 'Share'}
            </button>
            {askLink ? (
              <a href={askLink} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-(--sf-line) px-4 text-sm hover:border-(--sf-ink)">
                {soldOut ? 'Ask about restock' : 'Ask a question'}
              </a>
            ) : null}
          </div>
        </div>

        <DeliveryPromise shop={shop} className="mt-6 flex-col gap-y-1.5 text-(--sf-muted)" />

        {product.description ? (
          <div className="mt-8 border-t border-(--sf-line) pt-6">
            <h2 className="text-sm font-medium">Details</h2>
            <p className="mt-2 max-w-prose text-[15px] leading-relaxed whitespace-pre-line text-(--sf-muted)">{product.description}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
