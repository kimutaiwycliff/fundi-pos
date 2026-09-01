'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { computeOrderTotals, type LineInput } from '@hardware-pos/business-logic';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/empty-state';
import { useIsMobile } from '@/hooks/use-mobile';
import { getTerminalId, getTerminalName } from '@/lib/terminal';
import { findOpenShift, type Shift } from '@/lib/shifts-client';
import { deleteHeldSale, holdSale, listHeldSales, type HeldSale } from '@/lib/held-sales';
import { stockKey } from '@/lib/stock-key';
import type { CurrentUser } from '@/lib/current-user';
import { ProductSearch } from './product-search';
import { CartPanel } from './cart-panel';
import { TenderPicker } from './tender-picker';
import { ShiftWidget } from './shift-widget';
import { HeldSalesDrawer } from './held-sales-drawer';
import { CheckoutSuccessDialog } from './checkout-success-dialog';
import { VariantPickerDialog } from './variant-picker-dialog';
import { lineDisplayLabel, lineUnitPrice, type CartLine, type TenderType } from './types';
import type { CustomerRef, Product, StockLevel, StoreRef, TenantReceiptInfo } from './page';
import type { ReceiptData } from '@/components/receipt/types';
import { ShoppingCart, Store as StoreIcon } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const ACTIVE_STORE_KEY = 'hardware-pos-web-active-store';

function maxDiscountAmountForLine(quantity: number, product: Product): number {
  return quantity * product.maxDiscountAmount;
}

export function SellClient({
  me,
  products,
  stores,
  tenant,
  customers: initialCustomers,
  stockLevels,
}: {
  me: CurrentUser;
  products: Product[];
  stores: StoreRef[];
  tenant: TenantReceiptInfo;
  customers: CustomerRef[];
  stockLevels: StockLevel[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const fixedStoreId = me.store == null ? null : typeof me.store === 'object' ? me.store.id : me.store;
  const [pickedStoreId, setPickedStoreId] = useState<number | null>(null);
  const activeStoreId = fixedStoreId ?? pickedStoreId;

  const [cart, setCart] = useState<CartLine[]>([]);
  const [tenderType, setTenderType] = useState<TenderType>('cash');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRef | null>(null);
  const [customers, setCustomers] = useState(initialCustomers);
  const [completing, setCompleting] = useState(false);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  // "Frequently bought with" - recomputed from the last-added product's
  // relatedProducts every addToCart, not accumulated, so it always reflects
  // what was just added rather than growing stale across a whole sale.
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  // A variant-having product is never sold as its bare self - picking one
  // from search or from a suggestion opens this instead of adding directly.
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null);
  // Snapshot of the customer at the moment of sale - selectedCustomer is
  // cleared right after checkout (below), but the success dialog's "send
  // invoice" buttons still need this customer's contact details.
  const [receiptCustomer, setReceiptCustomer] = useState<CustomerRef | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  // Resolved after mount, not via a render-time useMemo: getTerminalId()
  // touches localStorage, which doesn't exist during server rendering and
  // previously crashed the server render entirely (Next.js silently fell
  // back to client-only rendering to recover - caught by fetching this page
  // directly and inspecting the RSC payload for the resulting
  // "ReferenceError: localStorage is not defined" error string).
  const [terminalId, setTerminalIdState] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTerminalIdState(getTerminalId());
  }, []);

  // Multi-store org-level users (me.store === null) pick and persist an
  // operating branch per browser - single-store users skip this entirely.
  // Runs client-only (after mount) so the server-rendered/hydration pass
  // never touches localStorage; localStorage is unavailable during SSR so
  // this can't be a lazy useState initializer without a hydration mismatch.
  useEffect(() => {
    if (fixedStoreId != null) return;
    const saved = localStorage.getItem(ACTIVE_STORE_KEY);
    if (saved && stores.some((s) => String(s.id) === saved)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPickedStoreId(Number(saved));
    } else if (stores.length === 1) {
      setPickedStoreId(stores[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Same SSR/localStorage hydration-mismatch reasoning as above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeldSales(listHeldSales());
  }, []);

  useEffect(() => {
    if (activeStoreId == null || terminalId == null) {
      // Clears any shift from a previously-active store before the lookup
      // below resolves for the new one.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveShift(null);
      return;
    }
    let cancelled = false;
    findOpenShift(terminalId, me.id).then((shift) => {
      if (!cancelled) setActiveShift(shift);
    });
    return () => {
      cancelled = true;
    };
  }, [activeStoreId, me.id, terminalId]);

  function handleStoreChange(id: number) {
    setPickedStoreId(id);
    localStorage.setItem(ACTIVE_STORE_KEY, String(id));
    setCart([]);
    setSelectedCustomer(null);
    setSuggestions([]);
  }

  const stockByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const level of stockLevels) {
      if (level.store === activeStoreId) map.set(stockKey(level.product, level.variant), level.quantity);
    }
    return map;
  }, [stockLevels, activeStoreId]);

  const lineInputs: LineInput[] = useMemo(
    () =>
      cart.map((line) => ({
        quantity: line.quantity,
        unitPrice: lineUnitPrice(line.product, line.variantId),
        discount: line.discountAmount,
        taxRate: line.product.taxRate,
      })),
    [cart],
  );
  const totals = useMemo(() => computeOrderTotals(lineInputs), [lineInputs]);

  function addToCart(product: Product, variantId: string | null) {
    const key = stockKey(product.id, variantId);
    const stock = stockByKey.get(key) ?? 0;
    const existing = cart.find((l) => l.product.id === product.id && l.variantId === variantId);
    const nextQuantity = (existing?.quantity ?? 0) + 1;
    const label = lineDisplayLabel(product, variantId);
    if (nextQuantity > stock) {
      toast.error(`Only ${stock} ${label} left in stock`);
      return;
    }
    setCart((prev) => {
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id && l.variantId === variantId ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { product, variantId, quantity: 1, discountAmount: 0 }];
    });
    setSuggestions(
      product.relatedProducts
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is Product => p != null && p.id !== product.id && !cart.some((l) => l.product.id === p.id)),
    );
  }

  // Entry point for both the search grid and the suggestion strip - a
  // product with variants always opens the picker first, never adds
  // straight to cart (there's no such thing as "the product itself" once
  // it has options, same as any real POS/e-commerce catalog).
  function requestAdd(product: Product) {
    if (product.variants.length > 0) {
      setVariantPickerProduct(product);
    } else {
      addToCart(product, null);
    }
  }

  function updateQuantity(productId: number, variantId: string | null, quantity: number) {
    const stock = stockByKey.get(stockKey(productId, variantId)) ?? 0;
    const line = cart.find((l) => l.product.id === productId && l.variantId === variantId);
    if (line && quantity > line.quantity && quantity > stock) {
      toast.error(`Only ${stock} ${lineDisplayLabel(line.product, variantId)} left in stock`);
      return;
    }
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((l) => !(l.product.id === productId && l.variantId === variantId))
        : prev.map((l) => {
            if (!(l.product.id === productId && l.variantId === variantId)) return l;
            const max = maxDiscountAmountForLine(quantity, l.product);
            return { ...l, quantity, discountAmount: Math.min(l.discountAmount, max) };
          }),
    );
  }

  function updateDiscountAmount(productId: number, variantId: string | null, rawValue: number) {
    const line = cart.find((l) => l.product.id === productId && l.variantId === variantId);
    if (!line) return;
    const max = maxDiscountAmountForLine(line.quantity, line.product);
    const clamped = Math.min(Math.max(rawValue, 0), max);
    if (rawValue > max) {
      toast.error(`Max discount for ${lineDisplayLabel(line.product, variantId)} is ${max.toFixed(2)}`);
    }
    setCart((prev) =>
      prev.map((l) => (l.product.id === productId && l.variantId === variantId ? { ...l, discountAmount: clamped } : l)),
    );
  }

  function handleHoldSale() {
    if (cart.length === 0) return;
    holdSale(cart);
    setCart([]);
    setSelectedCustomer(null);
    setSuggestions([]);
    setHeldSales(listHeldSales());
    setMobileCartOpen(false);
    toast.success('Sale held');
  }

  function handleResumeSale(held: HeldSale) {
    setCart(held.cart);
    deleteHeldSale(held.id);
    setHeldSales(listHeldSales());
    toast.success('Sale resumed');
  }

  async function completeSale() {
    if (cart.length === 0 || activeStoreId == null || terminalId == null) return;
    if (activeShift == null) {
      toast.error('Open a shift before completing a sale');
      return;
    }
    if (tenderType === 'credit' && !selectedCustomer) {
      toast.error('Select a customer for a credit sale');
      return;
    }
    const oversold = cart.find((line) => line.quantity > (stockByKey.get(stockKey(line.product.id, line.variantId)) ?? 0));
    if (oversold) {
      const stock = stockByKey.get(stockKey(oversold.product.id, oversold.variantId)) ?? 0;
      toast.error(`Only ${stock} ${lineDisplayLabel(oversold.product, oversold.variantId)} left in stock`);
      return;
    }

    setCompleting(true);
    const orderId = crypto.randomUUID();
    const paymentStatus = tenderType === 'credit' ? 'pending' : 'paid';

    const response = await fetch('/api/payload/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: orderId,
        store: activeStoreId,
        terminal: terminalId,
        terminalName: getTerminalName(),
        cashier: me.id,
        customer: selectedCustomer?.id ?? null,
        lineItems: cart.map((l) => ({
          product: l.product.id,
          variant: l.variantId,
          quantity: l.quantity,
          unitPrice: lineUnitPrice(l.product, l.variantId),
          discount: l.discountAmount,
        })),
        taxTotal: totals.taxTotal,
        discountTotal: totals.discountTotal,
        total: totals.total,
        tenderType,
        paymentStatus,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      toast.error(body?.errors?.[0]?.message ?? 'Failed to complete sale');
      setCompleting(false);
      return;
    }

    const cartAtSale = cart;
    toast.success(`Sale completed — ${totals.total.toFixed(2)}`);
    setReceiptCustomer(selectedCustomer);
    setReceipt({
      orderId,
      createdAt: new Date().toISOString(),
      cashierLabel: me.name || me.email,
      customerLabel: selectedCustomer?.name ?? null,
      lines: cartAtSale.map((l) => ({
        label: lineDisplayLabel(l.product, l.variantId),
        quantity: l.quantity,
        lineTotal: l.quantity * lineUnitPrice(l.product, l.variantId) - l.discountAmount,
      })),
      taxTotal: totals.taxTotal,
      discountTotal: totals.discountTotal,
      total: totals.total,
      tenderType,
      isUnpaidCredit: tenderType === 'credit',
      isSettledCredit: false,
      settledAtLabel: null,
    });
    setCart([]);
    setSelectedCustomer(null);
    setSuggestions([]);
    setMobileCartOpen(false);
    setCompleting(false);
    router.refresh();
  }

  const checkoutDisabled =
    cart.length === 0 || completing || activeShift == null || (tenderType === 'credit' && !selectedCustomer);
  const checkoutLabel = completing
    ? 'Completing...'
    : activeShift == null
      ? 'Open a shift to sell'
      : tenderType === 'credit' && !selectedCustomer
        ? 'Select a customer'
        : 'Complete sale';

  const cartFooter = (
    <div className="flex flex-col gap-3">
      <CartPanel cart={cart} totals={totals} onUpdateQuantity={updateQuantity} onUpdateDiscount={updateDiscountAmount} />
      <TenderPicker
        value={tenderType}
        onChange={setTenderType}
        customers={customers}
        selectedCustomer={selectedCustomer}
        onSelectCustomer={setSelectedCustomer}
        onCustomerCreated={(customer) => setCustomers((prev) => [...prev, customer])}
      />
      <div className="flex flex-col gap-2">
        <Button type="button" size="lg" disabled={checkoutDisabled} onClick={completeSale}>
          {checkoutLabel}
        </Button>
        <Button type="button" variant="secondary" size="lg" disabled={cart.length === 0} onClick={handleHoldSale}>
          Hold sale
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Sell</h1>
        <div className="flex flex-wrap items-center gap-2">
          {activeStoreId != null && terminalId != null ? (
            <ShiftWidget
              storeId={activeStoreId}
              terminal={terminalId}
              cashierId={me.id}
              shift={activeShift}
              onShiftChange={setActiveShift}
            />
          ) : null}
          {fixedStoreId == null && stores.length > 1 ? (
            <Select value={activeStoreId != null ? String(activeStoreId) : undefined} onValueChange={(v) => handleStoreChange(Number(v))}>
              <SelectTrigger className="w-44">
                <StoreIcon data-icon="inline-start" />
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={String(store.id)}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <HeldSalesDrawer heldSales={heldSales} onResume={handleResumeSale} />
        </div>
      </div>

      {activeStoreId != null && suggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2.5">
          <span className="text-xs font-medium text-muted-foreground">Frequently bought with:</span>
          {suggestions.map((product) => (
            <Button key={product.id} type="button" variant="outline" size="sm" onClick={() => requestAdd(product)}>
              + {product.name}
            </Button>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setSuggestions([])}>
            Dismiss
          </Button>
        </div>
      ) : null}

      {activeStoreId == null ? (
        <EmptyState
          icon={StoreIcon}
          title="Select a branch to start selling"
          description="Use the branch selector above to pick a store."
        />
      ) : (
        <div className={isMobile ? 'flex flex-col gap-4 pb-20' : 'flex flex-col gap-6 lg:flex-row'}>
          <div className={isMobile ? '' : 'min-w-0 flex-1'}>
            <ProductSearch products={products} stockByKey={stockByKey} onSelect={requestAdd} />
          </div>
          {isMobile ? null : (
            <aside className="w-full shrink-0 rounded-lg border p-4 lg:w-96">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">Current sale</h2>
                <span className="text-xs text-muted-foreground">
                  {cart.length} item{cart.length === 1 ? '' : 's'}
                </span>
              </div>
              {cartFooter}
            </aside>
          )}
        </div>
      )}

      {isMobile && activeStoreId != null ? (
        <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
          <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background p-3">
            <SheetTrigger asChild>
              <Button type="button" size="lg" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <ShoppingCart data-icon="inline-start" />
                  {cart.length} item{cart.length === 1 ? '' : 's'}
                </span>
                <span>{totals.total.toFixed(2)}</span>
              </Button>
            </SheetTrigger>
          </div>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Current sale</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-4">{cartFooter}</div>
          </SheetContent>
        </Sheet>
      ) : null}

      <VariantPickerDialog
        product={variantPickerProduct}
        stockByKey={stockByKey}
        onSelect={(variantId) => {
          if (variantPickerProduct) addToCart(variantPickerProduct, variantId);
          setVariantPickerProduct(null);
        }}
        onOpenChange={(open) => {
          if (!open) setVariantPickerProduct(null);
        }}
      />

      <CheckoutSuccessDialog receipt={receipt} customer={receiptCustomer} tenant={tenant} onClose={() => setReceipt(null)} />
    </div>
  );
}
