'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { buildWhatsAppLink } from '@hardware-pos/business-logic';
import { cn } from '@/lib/utils';
import { fuzzySearch } from '@/lib/fuzzy-search';
import {
  absoluteImage,
  formatKes,
  formatPriceSummary,
  priceSummary,
  productImage,
  productPath,
  productUrl,
  shopPath,
  shopUrl,
  type StorefrontProduct,
  type StorefrontShop,
  type StorefrontVariant,
} from './storefront-data';
import { AvailabilityBadge, ImagePlaceholder, WhatsAppIcon } from './storefront-ui';
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

function lineImage(product: StorefrontProduct, variantId: string | null): string | null {
  return absoluteImage(findVariant(product, variantId)?.image) ?? productImage(product);
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
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[#1C2541]/40 motion-safe:animate-in motion-safe:fade-in" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl outline-none motion-safe:animate-in motion-safe:slide-in-from-right"
      >
        <div className="flex items-center justify-between border-b border-[var(--sf-line)] px-5 py-4">
          <h2 className="text-lg font-medium">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 rounded-full p-2 text-[var(--sf-muted)] hover:bg-[var(--sf-shell)]">
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-[var(--sf-line)] px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- header

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
      <header className="sticky top-0 z-40 border-b border-[var(--sf-line)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          {back ? (
            <Link href={shopPath(shop.slug)} className="flex min-w-0 items-center gap-2 text-[var(--sf-muted)] hover:text-[var(--sf-ink)]">
              <svg viewBox="0 0 24 24" aria-hidden className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6}>
                <path d="M15 5 8 12l7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="truncate text-base font-medium tracking-wide text-[var(--sf-ink)]">{shop.name}</span>
            </Link>
          ) : (
            <span className="truncate text-base font-medium tracking-wide">{shop.name}</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {back ? (
              <Link href={`${shopPath(shop.slug)}#search`} aria-label="Search the shop" className="rounded-full p-2.5 hover:bg-[var(--sf-shell)]">
                <SearchIcon />
              </Link>
            ) : null}
            <button type="button" onClick={() => setWishOpen(true)} aria-label={`Wishlist, ${state.wishlist.length} items`} className="relative rounded-full p-2.5 hover:bg-[var(--sf-shell)]">
              <HeartIcon />
              {state.wishlist.length > 0 ? <CountDot value={state.wishlist.length} tone="petal" /> : null}
            </button>
            <button type="button" onClick={() => setBagOpen(true)} aria-label={`Bag, ${bagCount} items`} className="relative rounded-full p-2.5 hover:bg-[var(--sf-shell)]">
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
        'absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-medium text-white tabular-nums',
        tone === 'ink' ? 'bg-[var(--sf-ink)]' : 'bg-[var(--sf-petal)]',
      )}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}

// ---------------------------------------------------------------- bag

function QuantityStepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="inline-flex items-center rounded-full border border-[var(--sf-line)]" role="group" aria-label={`Quantity for ${label}`}>
      <button type="button" onClick={() => onChange(value - 1)} className="size-9 rounded-full text-lg leading-none hover:bg-[var(--sf-shell)]" aria-label="Decrease quantity">
        −
      </button>
      <span className="w-7 text-center text-sm tabular-nums">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} className="size-9 rounded-full text-lg leading-none hover:bg-[var(--sf-shell)]" aria-label="Increase quantity">
        +
      </button>
    </div>
  );
}

function LineThumb({ product, variantId }: { product: StorefrontProduct; variantId: string | null }) {
  const image = lineImage(product, variantId);
  return (
    <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-[var(--sf-shell)]">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" />
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

  function sendOrder() {
    const ref = orderReference();
    const rows = orderable.map(
      (l, i) => `${i + 1}. ${lineLabel(l.product, l.variantId)} × ${l.quantity} = ${formatKes(linePrice(l.product, l.variantId) * l.quantity)}`,
    );
    const message = [
      `Hi ${shop.name}! I'd like to order (ref ${ref}):`,
      ...rows,
      `Total: ${formatKes(total)} (before delivery)`,
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
            <div className="grid grid-cols-2 gap-2">
              <input
                aria-label="Your name"
                placeholder="Your name"
                value={state.customerName}
                onChange={(e) => shopActions.setCustomer(shop.slug, { customerName: e.target.value })}
                className="h-10 rounded-full border border-[var(--sf-line)] px-4 text-sm outline-none focus:border-[var(--sf-ink)]"
              />
              <input
                aria-label="Delivery area"
                placeholder="Delivery area"
                value={state.deliveryArea}
                onChange={(e) => shopActions.setCustomer(shop.slug, { deliveryArea: e.target.value })}
                className="h-10 rounded-full border border-[var(--sf-line)] px-4 text-sm outline-none focus:border-[var(--sf-ink)]"
              />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-[var(--sf-muted)]">Total before delivery</span>
              <span className="text-xl font-medium tabular-nums">{formatKes(total)}</span>
            </div>
            <button
              type="button"
              disabled={!canOrder}
              onClick={sendOrder}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--sf-wa)] text-base font-medium text-white transition-colors hover:bg-[#0f7742] disabled:opacity-40"
            >
              <WhatsAppIcon />
              Send order on WhatsApp
            </button>
            <p className="text-center text-xs text-[var(--sf-muted)]">
              {shop.whatsappNumber
                ? 'Opens WhatsApp with your order filled in. We confirm stock, delivery and M-Pesa payment there.'
                : 'This shop has not added a WhatsApp number yet.'}
            </p>
          </div>
        ) : null
      }
    >
      {lines.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-base">Your bag is empty</p>
          <p className="mt-1 text-sm text-[var(--sf-muted)]">Tap “Add” on anything you like.</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--sf-line)]">
          {lines.map((l) => {
            const soldOut = lineSoldOut(l.product, l.variantId);
            return (
              <li key={`${l.productId}:${l.variantId}`} className="flex gap-4 py-4">
                <LineThumb product={l.product} variantId={l.variantId} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link href={productPath(shop.slug, l.productId)} onClick={onClose} className="line-clamp-2 text-sm font-medium">
                    {l.product.name}
                  </Link>
                  {l.variantId ? <span className="text-xs text-[var(--sf-muted)]">{findVariant(l.product, l.variantId)?.label}</span> : null}
                  {soldOut ? (
                    <span className="text-xs text-[var(--sf-petal)]">Sold out - remove or save it for later</span>
                  ) : (
                    <span className="text-sm tabular-nums">{formatKes(linePrice(l.product, l.variantId) * l.quantity)}</span>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {!soldOut ? (
                      <QuantityStepper value={l.quantity} label={l.product.name} onChange={(n) => shopActions.setQuantity(shop.slug, l, n)} />
                    ) : null}
                    <button type="button" onClick={() => shopActions.saveForLater(shop.slug, l)} className="text-xs text-[var(--sf-muted)] underline-offset-4 hover:underline">
                      Save for later
                    </button>
                    <button type="button" onClick={() => shopActions.removeFromBag(shop.slug, l)} className="text-xs text-[var(--sf-muted)] underline-offset-4 hover:underline">
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
        <section className="mt-6 border-t border-[var(--sf-line)] pt-5">
          <h3 className="text-sm font-medium">Saved for later</h3>
          <ul className="mt-3 flex flex-col gap-3">
            {saved.map((l) => (
              <li key={`saved:${l.productId}:${l.variantId}`} className="flex items-center gap-3">
                <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-[var(--sf-shell)]">
                  {lineImage(l.product, l.variantId) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={lineImage(l.product, l.variantId)!} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{lineLabel(l.product, l.variantId)}</p>
                  <p className="text-xs text-[var(--sf-muted)] tabular-nums">{formatKes(linePrice(l.product, l.variantId))}</p>
                </div>
                {!lineSoldOut(l.product, l.variantId) ? (
                  <button type="button" onClick={() => shopActions.moveSavedToBag(shop.slug, l)} className="rounded-full border border-[var(--sf-line)] px-3 py-1.5 text-xs hover:border-[var(--sf-ink)]">
                    Move to bag
                  </button>
                ) : (
                  <span className="text-xs text-[var(--sf-muted)]">Sold out</span>
                )}
                <button type="button" onClick={() => shopActions.removeSaved(shop.slug, l)} aria-label={`Remove ${l.product.name}`} className="rounded-full p-1.5 text-[var(--sf-muted)] hover:bg-[var(--sf-shell)]">
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
          <p className="mt-1 text-sm text-[var(--sf-muted)]">Tap the heart on any piece to keep it here.</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--sf-line)]">
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
                  <span className="text-sm text-[var(--sf-muted)] tabular-nums">{formatPriceSummary(l.product)}</span>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    {soldOut ? (
                      <span className="text-xs text-[var(--sf-muted)]">Sold out</span>
                    ) : needsOption ? (
                      <Link href={productPath(shop.slug, l.productId)} onClick={onClose} className="rounded-full border border-[var(--sf-line)] px-3 py-1.5 text-xs hover:border-[var(--sf-ink)]">
                        Choose an option
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => shopActions.addToBag(shop.slug, l)}
                        className="rounded-full bg-[var(--sf-ink)] px-3 py-1.5 text-xs text-white"
                      >
                        Add to bag
                      </button>
                    )}
                    <button type="button" onClick={() => shopActions.toggleWishlist(shop.slug, l)} className="text-xs text-[var(--sf-muted)] underline-offset-4 hover:underline">
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

export function ProductCard({ shop, product }: { shop: StorefrontShop; product: StorefrontProduct }) {
  const state = useShopState(shop.slug);
  const [added, flash] = useAddedFlash();
  const image = productImage(product);
  const soldOut = product.availability === 'sold_out';
  const href = productPath(shop.slug, product.id);
  const ref: LineRef = { productId: product.id, variantId: null };
  const wished = state.wishlist.some((l) => l.productId === product.id);
  const needsOption = product.variants.length > 0;

  return (
    <article className="group flex min-w-0 flex-col">
      <div className="relative">
        <Link href={href} className="block aspect-[4/5] overflow-hidden rounded-2xl bg-[var(--sf-shell)]">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={product.name}
              loading="lazy"
              className={cn('h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]', soldOut && 'opacity-60 grayscale')}
            />
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
            'absolute top-2 right-2 rounded-full bg-white/90 p-2 transition-colors',
            wished ? 'text-[var(--sf-petal)]' : 'text-[var(--sf-ink)] hover:text-[var(--sf-petal)]',
          )}
        >
          <HeartIcon filled={wished} className="size-[18px]" />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1 pt-3">
        <Link href={href} className="line-clamp-2 text-sm leading-snug sm:text-[15px]">
          {product.name}
        </Link>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className={cn('text-sm font-medium tabular-nums', soldOut && 'text-[var(--sf-muted)]')}>{formatPriceSummary(product)}</span>
          {soldOut ? null : needsOption ? (
            <Link href={href} className="rounded-full border border-[var(--sf-line)] px-3 py-1 text-xs hover:border-[var(--sf-ink)]">
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
                'rounded-full px-3 py-1 text-xs transition-colors',
                added ? 'bg-[var(--sf-ink)] text-white' : 'border border-[var(--sf-line)] hover:border-[var(--sf-ink)]',
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
    <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">
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
      <div className="sticky top-14 z-30 -mx-4 border-b border-[var(--sf-line)] bg-white/95 px-4 pt-3 pb-3 backdrop-blur">
        <label className="flex h-12 items-center gap-3 rounded-full bg-[var(--sf-shell)] px-4 focus-within:ring-2 focus-within:ring-[var(--sf-ink)]/20">
          <SearchIcon className="shrink-0 text-[var(--sf-muted)]" />
          <span className="sr-only">Search {shop.name}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${products.length} pieces`}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--sf-muted)]"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="rounded-full p-1 text-[var(--sf-muted)] hover:text-[var(--sf-ink)]">
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
                    <span className="ml-1.5 text-[var(--sf-muted)] tabular-nums">{count}</span>
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
              className="h-9 w-[6.5rem] rounded-full border border-[var(--sf-line)] bg-white px-3 text-xs outline-none focus:border-[var(--sf-ink)] sm:w-auto"
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
            <p className="mt-2 text-sm text-[var(--sf-muted)]">
              {query ? 'Try a shorter word, or ask us - not everything in the shop is online.' : 'Try another category.'}
            </p>
            {query && askLink ? (
              <a href={askLink} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--sf-wa)] px-5 text-sm font-medium text-white">
                <WhatsAppIcon />
                Ask us on WhatsApp
              </a>
            ) : null}
          </div>
        ) : (
          <>
            {query || category || inStockOnly ? (
              <p className="mb-4 text-sm text-[var(--sf-muted)]">
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
        active ? 'border-[var(--sf-ink)] bg-[var(--sf-ink)] text-white' : 'border-[var(--sf-line)] hover:border-[var(--sf-ink)]',
      )}
    >
      {children}
    </button>
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

  // Gallery: the product photo plus any distinct variant photos.
  const images = useMemo(() => {
    const list = [productImage(product), ...product.variants.map((v) => absoluteImage(v.image))].filter(Boolean) as string[];
    return [...new Set(list)];
  }, [product]);
  const variant = findVariant(product, variantId);
  const [activeImage, setActiveImage] = useState(0);
  const shownImage = absoluteImage(variant?.image) ?? images[activeImage] ?? null;

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
    <div className="grid gap-8 md:grid-cols-[1.1fr_1fr] md:gap-12">
      <div className="flex flex-col gap-3">
        <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-[var(--sf-shell)]">
          {shownImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shownImage} alt={label} className={cn('h-full w-full object-cover', soldOut && 'opacity-70')} />
          ) : (
            <ImagePlaceholder name={product.name} className="text-7xl" />
          )}
          <AvailabilityBadge availability={variant?.availability ?? product.availability} className="absolute top-3 left-3" />
        </div>
        {images.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => {
                  setActiveImage(i);
                  const match = product.variants.find((v) => absoluteImage(v.image) === src);
                  if (match && match.availability !== 'sold_out') setVariantId(match.id);
                }}
                aria-label={`Show photo ${i + 1}`}
                className={cn('size-16 shrink-0 overflow-hidden rounded-xl border-2', shownImage === src ? 'border-[var(--sf-ink)]' : 'border-transparent')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-w-0">
        <Link href={`${shopPath(shop.slug)}?q=${encodeURIComponent(product.category)}#search`} className="text-sm text-[var(--sf-muted)] hover:text-[var(--sf-ink)]">
          {product.category}
        </Link>
        <h1 className="mt-1 text-3xl leading-tight font-light break-words sm:text-4xl">{product.name}</h1>
        <p className="mt-3 text-2xl font-medium tabular-nums">{formatKes(price)}</p>

        {hasVariants ? (
          <fieldset className="mt-7">
            <legend className="text-sm font-medium">Choose {product.variants.length === 1 ? 'option' : 'an option'}</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {product.variants.map((v) => {
                const out = v.availability === 'sold_out';
                const active = v.id === variantId;
                return (
                  <button
                    key={v.id || v.label}
                    type="button"
                    disabled={out}
                    onClick={() => setVariantId(v.id)}
                    aria-pressed={active}
                    className={cn(
                      'min-h-10 rounded-full border px-4 text-sm transition-colors',
                      active ? 'border-[var(--sf-ink)] bg-[var(--sf-ink)] text-white' : 'border-[var(--sf-line)] hover:border-[var(--sf-ink)]',
                      out && 'cursor-not-allowed text-[var(--sf-muted)] line-through opacity-60 hover:border-[var(--sf-line)]',
                    )}
                  >
                    {v.label}
                    {v.price !== product.price ? <span className="ml-1.5 text-xs opacity-80">{formatKes(v.price)}</span> : null}
                  </button>
                );
              })}
            </div>
            {variant?.availability === 'low' ? <p className="mt-2 text-sm text-[var(--sf-petal)]">Only a few left in this option</p> : null}
          </fieldset>
        ) : null}

        <div className="mt-7 flex flex-col gap-3">
          {soldOut ? (
            <p className="text-sm text-[var(--sf-muted)]">This piece is sold out right now.</p>
          ) : (
            <div className="flex items-center gap-3">
              <QuantityStepper value={quantity} label={product.name} onChange={(n) => setQuantity(Math.max(1, n))} />
              <button
                type="button"
                onClick={() => {
                  shopActions.addToBag(shop.slug, ref, quantity);
                  flash();
                  window.dispatchEvent(new Event('shop:open-bag'));
                }}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--sf-ink)] text-base text-white transition-opacity hover:opacity-90"
              >
                <BagIcon />
                {added ? 'Added to bag' : 'Add to bag'}
              </button>
            </div>
          )}
          {buyNowLink ? (
            <a
              href={buyNowLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[var(--sf-wa)] text-base text-[var(--sf-wa)] transition-colors hover:bg-[var(--sf-wa)] hover:text-white"
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
              className={cn('inline-flex h-10 items-center gap-2 rounded-full border border-[var(--sf-line)] px-4 text-sm', wished && 'text-[var(--sf-petal)]')}
            >
              <HeartIcon filled={wished} className="size-4" />
              {wished ? 'In your wishlist' : 'Save to wishlist'}
            </button>
            <button type="button" onClick={share} className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--sf-line)] px-4 text-sm">
              {copied ? 'Link copied' : 'Share'}
            </button>
            {askLink ? (
              <a href={askLink} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--sf-line)] px-4 text-sm">
                {soldOut ? 'Ask about restock' : 'Ask a question'}
              </a>
            ) : null}
          </div>
        </div>

        {product.description ? (
          <div className="mt-8 border-t border-[var(--sf-line)] pt-6">
            <h2 className="text-sm font-medium">Details</h2>
            <p className="mt-2 max-w-prose text-[15px] leading-relaxed whitespace-pre-line text-[var(--sf-muted)]">{product.description}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
