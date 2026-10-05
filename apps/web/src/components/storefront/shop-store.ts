'use client';

import { useSyncExternalStore } from 'react';

// Customer-side state for the public storefront: shopping bag, saved-for-
// later, wishlist and recently viewed. Shoppers have no account, so this
// lives in the visitor's own browser (localStorage), namespaced per shop so
// two shops' bags never mix. Every read/write is guarded - private mode or
// blocked storage just means an in-memory bag for this visit.

export interface LineRef {
  productId: number;
  variantId: string | null;
}

export interface BagLine extends LineRef {
  quantity: number;
}

export interface ShopState {
  bag: BagLine[];
  saved: LineRef[];
  wishlist: LineRef[];
  recent: number[];
  customerName: string;
  deliveryArea: string;
  // Chosen delivery zone name (Settings -> Delivery zones) and whether the
  // shopper wants to pay on delivery - remembered for their next order.
  deliveryZone: string;
  payOnDelivery: boolean;
}

const EMPTY: ShopState = {
  bag: [],
  saved: [],
  wishlist: [],
  recent: [],
  customerName: '',
  deliveryArea: '',
  deliveryZone: '',
  payOnDelivery: false,
};
const MAX_RECENT = 12;

const states = new Map<string, ShopState>();
const listeners = new Map<string, Set<() => void>>();

function storageKey(slug: string) {
  return `fundi-shop:${slug}`;
}

function load(slug: string): ShopState {
  const cached = states.get(slug);
  if (cached) return cached;
  let state = EMPTY;
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (raw) state = { ...EMPTY, ...(JSON.parse(raw) as Partial<ShopState>) };
  } catch {
    state = EMPTY;
  }
  states.set(slug, state);
  return state;
}

function save(slug: string, next: ShopState) {
  states.set(slug, next);
  try {
    window.localStorage.setItem(storageKey(slug), JSON.stringify(next));
  } catch {
    // Storage full/blocked - keep the in-memory copy for this visit.
  }
  listeners.get(slug)?.forEach((listener) => listener());
}

export function sameLine(a: LineRef, b: LineRef): boolean {
  return a.productId === b.productId && (a.variantId ?? null) === (b.variantId ?? null);
}

function update(slug: string, fn: (state: ShopState) => ShopState) {
  save(slug, fn(load(slug)));
}

function subscribe(slug: string, listener: () => void) {
  let set = listeners.get(slug);
  if (!set) {
    set = new Set();
    listeners.set(slug, set);
  }
  set.add(listener);
  // Another tab changed the same shop's bag/wishlist.
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey(slug)) {
      states.delete(slug);
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    set.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useShopState(slug: string): ShopState {
  return useSyncExternalStore(
    (listener) => subscribe(slug, listener),
    () => load(slug),
    () => EMPTY,
  );
}

export const shopActions = {
  addToBag(slug: string, line: LineRef, quantity = 1) {
    update(slug, (s) => {
      const existing = s.bag.find((l) => sameLine(l, line));
      const bag = existing
        ? s.bag.map((l) => (sameLine(l, line) ? { ...l, quantity: l.quantity + quantity } : l))
        : [...s.bag, { ...line, quantity }];
      return { ...s, bag, saved: s.saved.filter((l) => !sameLine(l, line)) };
    });
  },
  setQuantity(slug: string, line: LineRef, quantity: number) {
    update(slug, (s) => ({
      ...s,
      bag: quantity <= 0 ? s.bag.filter((l) => !sameLine(l, line)) : s.bag.map((l) => (sameLine(l, line) ? { ...l, quantity } : l)),
    }));
  },
  removeFromBag(slug: string, line: LineRef) {
    update(slug, (s) => ({ ...s, bag: s.bag.filter((l) => !sameLine(l, line)) }));
  },
  saveForLater(slug: string, line: LineRef) {
    update(slug, (s) => ({
      ...s,
      bag: s.bag.filter((l) => !sameLine(l, line)),
      saved: s.saved.some((l) => sameLine(l, line)) ? s.saved : [{ productId: line.productId, variantId: line.variantId }, ...s.saved],
    }));
  },
  moveSavedToBag(slug: string, line: LineRef) {
    shopActions.addToBag(slug, line, 1);
  },
  removeSaved(slug: string, line: LineRef) {
    update(slug, (s) => ({ ...s, saved: s.saved.filter((l) => !sameLine(l, line)) }));
  },
  toggleWishlist(slug: string, line: LineRef) {
    update(slug, (s) => ({
      ...s,
      wishlist: s.wishlist.some((l) => sameLine(l, line))
        ? s.wishlist.filter((l) => !sameLine(l, line))
        : [{ productId: line.productId, variantId: line.variantId }, ...s.wishlist],
    }));
  },
  recordView(slug: string, productId: number) {
    update(slug, (s) => ({ ...s, recent: [productId, ...s.recent.filter((id) => id !== productId)].slice(0, MAX_RECENT) }));
  },
  setCustomer(slug: string, fields: Partial<Pick<ShopState, 'customerName' | 'deliveryArea' | 'deliveryZone' | 'payOnDelivery'>>) {
    update(slug, (s) => ({ ...s, ...fields }));
  },
  clearBag(slug: string) {
    update(slug, (s) => ({ ...s, bag: [] }));
  },
};
