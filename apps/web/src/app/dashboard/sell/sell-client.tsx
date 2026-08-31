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
import type { CurrentUser } from '@/lib/current-user';
import { ProductSearch } from './product-search';
import { CartPanel } from './cart-panel';
import { TenderPicker } from './tender-picker';
import { ShiftWidget } from './shift-widget';
import { HeldSalesDrawer } from './held-sales-drawer';
import { CheckoutSuccessDialog } from './checkout-success-dialog';
import type { CartLine, TenderType } from './types';
import type { CustomerRef, Product, StoreRef, TenantReceiptInfo } from './page';
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
  return (quantity * product.sellPrice * product.maxDiscountPercent) / 100;
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
  stockLevels: { store: number; product: number; quantity: number }[];
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
  }

  const stockByProduct = useMemo(() => {
    const map = new Map<number, number>();
    for (const level of stockLevels) {
      if (level.store === activeStoreId) map.set(level.product, level.quantity);
    }
    return map;
  }, [stockLevels, activeStoreId]);

  const lineInputs: LineInput[] = useMemo(
    () =>
      cart.map((line) => ({
        quantity: line.quantity,
        unitPrice: line.product.sellPrice,
        discount: line.discountAmount,
        taxRate: line.product.taxRate,
      })),
    [cart],
  );
  const totals = useMemo(() => computeOrderTotals(lineInputs), [lineInputs]);

  function addToCart(product: Product) {
    const stock = stockByProduct.get(product.id) ?? 0;
    const existing = cart.find((l) => l.product.id === product.id);
    const nextQuantity = (existing?.quantity ?? 0) + 1;
    if (nextQuantity > stock) {
      toast.error(`Only ${stock} ${product.name} left in stock`);
      return;
    }
    setCart((prev) => {
      if (existing) {
        return prev.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { product, quantity: 1, discountAmount: 0 }];
    });
  }

  function updateQuantity(productId: number, quantity: number) {
    const stock = stockByProduct.get(productId) ?? 0;
    const line = cart.find((l) => l.product.id === productId);
    if (line && quantity > line.quantity && quantity > stock) {
      toast.error(`Only ${stock} ${line.product.name} left in stock`);
      return;
    }
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.product.id !== productId)
        : prev.map((l) => {
            if (l.product.id !== productId) return l;
            const max = maxDiscountAmountForLine(quantity, l.product);
            return { ...l, quantity, discountAmount: Math.min(l.discountAmount, max) };
          }),
    );
  }

  function updateDiscountAmount(productId: number, rawValue: number) {
    const line = cart.find((l) => l.product.id === productId);
    if (!line) return;
    const max = maxDiscountAmountForLine(line.quantity, line.product);
    const clamped = Math.min(Math.max(rawValue, 0), max);
    if (rawValue > max) {
      toast.error(`Max discount for ${line.product.name} is ${max.toFixed(2)}`);
    }
    setCart((prev) => prev.map((l) => (l.product.id === productId ? { ...l, discountAmount: clamped } : l)));
  }

  function handleHoldSale() {
    if (cart.length === 0) return;
    holdSale(cart);
    setCart([]);
    setSelectedCustomer(null);
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
    const oversold = cart.find((line) => line.quantity > (stockByProduct.get(line.product.id) ?? 0));
    if (oversold) {
      toast.error(`Only ${stockByProduct.get(oversold.product.id) ?? 0} ${oversold.product.name} left in stock`);
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
          variant: null,
          quantity: l.quantity,
          unitPrice: l.product.sellPrice,
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
    setReceipt({
      orderId,
      createdAt: new Date().toISOString(),
      cashierLabel: me.name || me.email,
      customerLabel: selectedCustomer?.name ?? null,
      lines: cartAtSale.map((l) => ({
        label: l.product.name,
        quantity: l.quantity,
        lineTotal: l.quantity * l.product.sellPrice - l.discountAmount,
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

      {activeStoreId == null ? (
        <EmptyState
          icon={StoreIcon}
          title="Select a branch to start selling"
          description="Use the branch selector above to pick a store."
        />
      ) : (
        <div className={isMobile ? 'flex flex-col gap-4 pb-20' : 'flex gap-6'}>
          <div className={isMobile ? '' : 'flex-1'}>
            <ProductSearch products={products} stockByProduct={stockByProduct} onSelect={addToCart} />
          </div>
          {isMobile ? null : (
            <aside className="w-96 shrink-0 rounded-lg border p-4">
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

      <CheckoutSuccessDialog receipt={receipt} tenant={tenant} onClose={() => setReceipt(null)} />
    </div>
  );
}
