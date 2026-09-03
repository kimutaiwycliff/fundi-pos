import { useCallback, useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import * as Print from 'expo-print';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useMutedPlaceholderColor } from '../lib/theme';
import { View, Text, TextInput, Pressable, FlatList, Modal, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDb } from '../db/database';
import type { PayloadUser } from '../lib/auth';
import { showAlert } from '../components/AppNotice';
import { PaymentModal, type LocalOrder } from '../customers/PaymentModal';
import { VoidRefundModal, type VoidableOrder } from './VoidRefundModal';
import { buildReceiptHtml, type ReceiptTenantInfo } from './receiptHtml';

interface OrderRow {
  id: string;
  total: number;
  tax_total: number;
  discount_total: number;
  tender_type: string;
  payment_status: string;
  status: string;
  created_at: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  cashier_name: string | null;
  cashier_email: string | null;
  terminal_name: string | null;
}

interface OrderLine {
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
}

type StatusFilter = 'all' | 'unpaid' | 'paid' | 'voided' | 'refunded';
type DatePreset = 'today' | 'week' | 'month' | 'all';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'voided', label: 'Voided' },
  { value: 'refunded', label: 'Refunded' },
];

const DATE_OPTIONS: Array<{ value: DatePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
];

function datePresetCutoff(preset: DatePreset): string | null {
  if (preset === 'all') return null;
  const now = new Date();
  if (preset === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  if (preset === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString();
}

function matchesStatus(order: OrderRow, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'unpaid') return order.tender_type === 'credit' && order.payment_status === 'pending' && order.status === 'completed';
  if (filter === 'paid') return order.status === 'completed' && !(order.tender_type === 'credit' && order.payment_status === 'pending');
  return order.status === filter;
}

// Phase 4 - sales history, reprint (on-screen only - ESC/POS printing is
// still deferred, same as Phase 1) and void/refund. Reuses PaymentModal
// from Customers (Phase 2) for settling an unpaid credit sale found here,
// rather than duplicating that flow. Reads local orders only (this store's
// own synced history, offline, same as apps/desktop/src/FindSalePanel.tsx);
// void/refund and settling both still require connectivity, per the plan's
// Option-A decision. Status/date filters and the widened search (phone,
// cashier, terminal) mirror apps/web's dashboard/sales page's own filters.
export function SalesScreen({ user, payloadToken, storeId }: { user: PayloadUser; payloadToken: string; storeId: number | null }) {
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;
  const placeholderColor = useMutedPlaceholderColor();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [candidates, setCandidates] = useState<OrderRow[]>([]);
  const [receiptOrder, setReceiptOrder] = useState<OrderRow | null>(null);
  const [receiptLines, setReceiptLines] = useState<OrderLine[]>([]);
  const [paymentOrder, setPaymentOrder] = useState<LocalOrder | null>(null);
  const [voidOrder, setVoidOrder] = useState<VoidableOrder | null>(null);
  const [tenantInfo, setTenantInfo] = useState<ReceiptTenantInfo | null>(null);
  const [printing, setPrinting] = useState(false);

  // Fetched once, not per-receipt - the letterhead a receipt prints doesn't
  // change sale to sale. Same tenants row the Overview screen and desktop's
  // own receipt view read (name/receipt_header/receipt_footer), already
  // synced tenant-wide regardless of which store this till is on (see
  // sync-config.yaml's `tenants` stream).
  useEffect(() => {
    getDb()
      .get<{ name: string; receipt_header: string | null; receipt_footer: string | null }>('SELECT name, receipt_header, receipt_footer FROM tenants WHERE id = ?', [tenantId])
      .then((row) => setTenantInfo({ name: row.name, receiptHeader: row.receipt_header, receiptFooter: row.receipt_footer }))
      .catch(() => setTenantInfo(null));
  }, [tenantId]);

  // Recent order history for this store loaded once, not per keystroke, so
  // search can fuzzy-match client-side - same pattern as SellScreen's
  // product search. Order id is a real id (not free text a person typed),
  // so it keeps exact-prefix matching below rather than being fuzzed - a
  // typo-tolerant match on a 36-char id string would just be noise; the
  // free-text fields (customer/cashier name, phone, terminal) are what
  // typos actually happen in.
  const refresh = useCallback(() => {
    if (storeId == null) {
      setCandidates([]);
      return;
    }
    getDb()
      .getAll<OrderRow>(
        `SELECT o.id, o.total, o.tax_total, o.discount_total, o.tender_type, o.payment_status, o.status,
                COALESCE(o.created_at, o.synced_at) AS created_at, o.terminal_name,
                c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
                u.name AS cashier_name, u.email AS cashier_email
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN users u ON u.id = o.cashier_id
         WHERE o.store_id = ?
         ORDER BY COALESCE(o.created_at, o.synced_at) DESC LIMIT 1000`,
        [storeId],
      )
      .then(setCandidates);
  }, [storeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const scoped = useMemo(() => {
    const cutoff = datePresetCutoff(datePreset);
    return candidates.filter((o) => matchesStatus(o, statusFilter) && (!cutoff || (o.created_at ?? '') >= cutoff));
  }, [candidates, statusFilter, datePreset]);

  const unpaidCount = useMemo(
    () => candidates.filter((o) => o.tender_type === 'credit' && o.payment_status === 'pending' && o.status === 'completed').length,
    [candidates],
  );

  const orders = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return scoped.slice(0, 30);
    const lower = trimmed.toLowerCase();
    const idMatches = scoped.filter((o) => o.id.toLowerCase().startsWith(lower));
    const fuse = new Fuse(scoped, {
      threshold: 0.4,
      ignoreLocation: true,
      keys: ['customer_name', 'customer_phone', 'cashier_name', 'cashier_email', 'terminal_name'],
    });
    const otherMatches = fuse.search(trimmed).map((r) => r.item);
    const idMatchIds = new Set(idMatches.map((o) => o.id));
    return [...idMatches, ...otherMatches.filter((o) => !idMatchIds.has(o.id))].slice(0, 30);
  }, [query, scoped]);

  function openReceipt(order: OrderRow) {
    setReceiptOrder(order);
    getDb()
      .getAll<OrderLine>(
        `SELECT p.name AS product_name, oli.quantity, oli.unit_price, oli.discount
         FROM orders_line_items oli
         JOIN products p ON p.id = oli.product_id
         WHERE oli._parent_id = ?
         ORDER BY oli._order`,
        [order.id],
      )
      .then(setReceiptLines);
  }

  // WhatsApp/email are more natural on a phone than desktop for chasing an
  // unpaid tab - mirrors apps/web's dashboard/sales page's invoice-message
  // send action, without needing that same shared message-builder module.
  function invoiceMessage(order: OrderRow): string {
    const name = order.customer_name ?? 'there';
    return `Hi ${name}, this is a reminder that your order #${order.id.slice(0, 8)} for ${order.total.toFixed(2)} is still unpaid. Please settle at your earliest convenience. Thank you!`;
  }

  function sendInvoiceWhatsApp(order: OrderRow) {
    if (!order.customer_phone) return;
    const digits = order.customer_phone.replace(/[^\d]/g, '');
    const withCountryCode = digits.startsWith('0') ? `254${digits.slice(1)}` : digits;
    Linking.openURL(`https://wa.me/${withCountryCode}?text=${encodeURIComponent(invoiceMessage(order))}`).catch(() => undefined);
  }

  function sendInvoiceEmail(order: OrderRow) {
    if (!order.customer_email) return;
    Linking.openURL(`mailto:${order.customer_email}?subject=${encodeURIComponent(`Unpaid order #${order.id.slice(0, 8)}`)}&body=${encodeURIComponent(invoiceMessage(order))}`).catch(
      () => undefined,
    );
  }

  // Print.printAsync opens Android's native print dialog (any registered
  // printer, or "Save as PDF") against the same receipt HTML the sheet
  // itself is built from - see receiptHtml.ts's own note on why this (not
  // raw ESC/POS) is the mobile equivalent of the web POS's browser-print.
  async function handlePrintReceipt() {
    if (!receiptOrder || !tenantInfo) return;
    setPrinting(true);
    try {
      const html = buildReceiptHtml(
        {
          orderId: receiptOrder.id,
          createdAtLabel: receiptOrder.created_at ? new Date(receiptOrder.created_at).toLocaleString() : '',
          cashierLabel: receiptOrder.cashier_name ?? receiptOrder.cashier_email ?? 'Unknown',
          customerLabel: receiptOrder.customer_name ?? receiptOrder.customer_phone ?? null,
          terminalLabel: receiptOrder.terminal_name,
          lines: receiptLines.map((l) => ({ label: l.product_name, quantity: l.quantity, lineTotal: l.quantity * l.unit_price - l.discount })),
          taxTotal: receiptOrder.tax_total,
          discountTotal: receiptOrder.discount_total,
          total: receiptOrder.total,
          tenderType: receiptOrder.tender_type,
          isUnpaidCredit: receiptOrder.tender_type === 'credit' && receiptOrder.payment_status === 'pending',
        },
        tenantInfo,
      );
      await Print.printAsync({ html });
    } catch (err) {
      showAlert('Could not print receipt', err instanceof Error ? err.message : String(err));
    } finally {
      setPrinting(false);
    }
  }

  if (storeId == null) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-lg font-semibold text-foreground">Select a branch first</Text>
        <Text className="mt-1 text-center text-muted-foreground">Use the branch switcher in More to pick a store.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="gap-2 border-b border-border p-3">
        <TextInput
          className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
          placeholder="Search by order id, customer, cashier, phone..."
          placeholderTextColor={placeholderColor}
          value={query}
          onChangeText={setQuery}
        />
        <View className="flex-row flex-wrap gap-1.5">
          {DATE_OPTIONS.map((opt) => (
            <Pressable
              android_ripple={{ color: '#ffffff40' }}
              key={opt.value}
              className={`rounded-md border px-2.5 py-1 ${datePreset === opt.value ? 'border-primary bg-primary' : 'border-border'}`}
              onPress={() => setDatePreset(opt.value)}
            >
              <Text className={`text-xs ${datePreset === opt.value ? 'font-medium text-primary-foreground' : 'text-foreground'}`}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
        <View className="flex-row flex-wrap items-center gap-1.5">
          {STATUS_OPTIONS.map((opt) => (
            <Pressable
              android_ripple={{ color: '#ffffff40' }}
              key={opt.value}
              className={`rounded-md border px-2.5 py-1 ${statusFilter === opt.value ? 'border-primary bg-primary' : 'border-border'}`}
              onPress={() => setStatusFilter(opt.value)}
            >
              <Text className={`text-xs ${statusFilter === opt.value ? 'font-medium text-primary-foreground' : 'text-foreground'}`}>{opt.label}</Text>
            </Pressable>
          ))}
          {unpaidCount > 0 ? (
            <View className="rounded-md bg-destructive/15 px-2.5 py-1">
              <Text className="text-xs font-medium text-destructive">{unpaidCount} unpaid</Text>
            </View>
          ) : null}
        </View>
        <Text className="text-xs text-muted-foreground">
          {orders.length} of {scoped.length} sale{scoped.length === 1 ? '' : 's'}
        </Text>
      </View>

      <FlatList
        className="flex-1"
        contentContainerClassName="gap-2 p-3"
        data={orders}
        keyExtractor={(o) => o.id}
        ListEmptyComponent={<Text className="mt-8 text-center text-muted-foreground">No matching sales found.</Text>}
        renderItem={({ item }) => {
          const isUnpaidCredit = item.tender_type === 'credit' && item.payment_status === 'pending';
          return (
            <Animated.View entering={FadeInDown.duration(220)} className="rounded-lg border border-border bg-card p-3">
              <View className="flex-row items-center justify-between">
                <Text className="font-medium text-foreground">
                  #{item.id.slice(0, 8)} · {item.total.toFixed(2)}
                </Text>
                {item.status !== 'completed' ? <Text className="text-xs font-medium text-destructive">{item.status}</Text> : null}
              </View>
              <Text className="text-xs text-muted-foreground">
                {item.created_at ? new Date(item.created_at).toLocaleString() : ''} · {item.tender_type}
                {item.customer_name ? ` · ${item.customer_name}` : ''}
                {item.cashier_name ? ` · ${item.cashier_name}` : ''}
                {isUnpaidCredit ? ' · unpaid' : ''}
              </Text>
              <View className="mt-2 flex-row flex-wrap gap-1.5">
                <Pressable android_ripple={{}} className="rounded-md border border-border px-3 py-1.5 active:opacity-70" onPress={() => openReceipt(item)}>
                  <Text className="text-sm text-foreground">Receipt</Text>
                </Pressable>
                {isUnpaidCredit ? (
                  <Pressable android_ripple={{ color: '#ffffff40' }}
                    className="rounded-md bg-primary px-3 py-1.5 active:opacity-80"
                    onPress={() => setPaymentOrder({ id: item.id, total: item.total, created_at: item.created_at, synced_at: null })}
                  >
                    <Text className="text-sm font-medium text-primary-foreground">Pay</Text>
                  </Pressable>
                ) : null}
                {isUnpaidCredit && item.customer_phone ? (
                  <Pressable android_ripple={{}} className="rounded-md border border-border px-3 py-1.5 active:opacity-70" onPress={() => sendInvoiceWhatsApp(item)}>
                    <Text className="text-sm text-foreground">WhatsApp</Text>
                  </Pressable>
                ) : null}
                {isUnpaidCredit && item.customer_email ? (
                  <Pressable android_ripple={{}} className="rounded-md border border-border px-3 py-1.5 active:opacity-70" onPress={() => sendInvoiceEmail(item)}>
                    <Text className="text-sm text-foreground">Email</Text>
                  </Pressable>
                ) : null}
                {item.status === 'completed' ? (
                  <Pressable android_ripple={{}} className="rounded-md border border-destructive px-3 py-1.5 active:opacity-70" onPress={() => setVoidOrder({ id: item.id, total: item.total })}>
                    <Text className="text-sm text-destructive">Void/Refund</Text>
                  </Pressable>
                ) : null}
              </View>
            </Animated.View>
          );
        }}
      />

      <Modal visible={receiptOrder != null} animationType="slide" transparent onRequestClose={() => setReceiptOrder(null)}>
        <Pressable android_ripple={{}} className="flex-1 justify-end bg-black/40" onPress={() => setReceiptOrder(null)}>
          <Pressable android_ripple={{}} className="max-h-[85%] rounded-t-2xl bg-background p-4" onPress={(e) => e.stopPropagation()}>
            {/* Same letterhead/detail shape as the web dashboard's reprint
                dialog (apps/web/src/components/receipt/receipt-view.tsx) -
                tenant name/header up top, footer at the bottom, everything
                in between identical field-for-field. */}
            <Text className="text-center text-base font-bold text-foreground">{tenantInfo?.name ?? ''}</Text>
            {tenantInfo?.receiptHeader ? <Text className="text-center text-xs text-muted-foreground">{tenantInfo.receiptHeader}</Text> : null}
            <View className="my-2 border-t border-dashed border-border" />

            <Text className="text-sm text-foreground">Order #{receiptOrder?.id.slice(0, 8)}</Text>
            <Text className="text-xs text-muted-foreground">{receiptOrder?.created_at ? new Date(receiptOrder.created_at).toLocaleString() : ''}</Text>
            <Text className="mt-1 text-xs text-muted-foreground">Cashier: {receiptOrder?.cashier_name ?? receiptOrder?.cashier_email ?? 'Unknown'}</Text>
            {receiptOrder?.customer_name || receiptOrder?.customer_phone ? (
              <Text className="text-xs text-muted-foreground">Customer: {receiptOrder?.customer_name ?? receiptOrder?.customer_phone}</Text>
            ) : null}
            {receiptOrder?.terminal_name ? <Text className="text-xs text-muted-foreground">Terminal: {receiptOrder.terminal_name}</Text> : null}
            <View className="my-2 border-t border-dashed border-border" />

            <FlatList
              // A concrete pixel cap, not flex-1: the outer Pressable is only
              // max-height-bound (its own height is otherwise derived from
              // its children's natural sizes), and a flex-grow child inside a
              // container whose height is ITSELF derived from children is an
              // ambiguous/circular case Yoga doesn't resolve the way you'd
              // expect - in practice the FlatList can measure to near-zero
              // height and render nothing even with non-empty data, which is
              // exactly what happened once the tenant/order/cashier detail
              // block above grew tall enough to matter. A fixed numeric
              // maxHeight sidesteps the ambiguity entirely.
              style={{ maxHeight: 260 }}
              data={receiptLines}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item }) => (
                <Animated.View entering={FadeInDown.duration(180)} className="flex-row items-center justify-between border-b border-border py-1.5 last:border-b-0">
                  <View className="shrink">
                    <Text className="text-sm text-foreground">
                      {item.quantity} × {item.product_name}
                    </Text>
                  </View>
                  <Text className="text-sm text-foreground">{(item.quantity * item.unit_price - item.discount).toFixed(2)}</Text>
                </Animated.View>
              )}
            />
            {receiptOrder?.tender_type === 'credit' && receiptOrder.payment_status === 'pending' ? (
              <Text className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 py-1.5 text-center font-bold text-destructive">UNPAID — pay on settlement</Text>
            ) : null}
            <View className="mt-3 gap-1 border-t border-border pt-3">
              <View className="flex-row justify-between">
                <Text className="text-muted-foreground">Tax</Text>
                <Text className="text-foreground">{receiptOrder?.tax_total.toFixed(2)}</Text>
              </View>
              {receiptOrder && receiptOrder.discount_total > 0 ? (
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground">Discount</Text>
                  <Text className="text-foreground">-{receiptOrder.discount_total.toFixed(2)}</Text>
                </View>
              ) : null}
              <View className="flex-row justify-between">
                <Text className="font-semibold text-foreground">Total</Text>
                <Text className="font-semibold text-foreground">{receiptOrder?.total.toFixed(2)}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-muted-foreground">Tender</Text>
                <Text className="text-foreground capitalize">{receiptOrder?.tender_type}</Text>
              </View>
            </View>
            {tenantInfo?.receiptFooter ? <Text className="mt-3 border-t border-dashed border-border pt-2 text-center text-xs text-muted-foreground">{tenantInfo.receiptFooter}</Text> : null}

            <View className="mt-4 flex-row gap-2">
              <Pressable
                android_ripple={{ color: '#ffffff40' }}
                className={`flex-1 items-center rounded-lg bg-primary py-2.5 ${printing || !tenantInfo ? 'opacity-50' : 'active:opacity-80'}`}
                disabled={printing || !tenantInfo}
                onPress={handlePrintReceipt}
              >
                <Text className="font-medium text-primary-foreground">{printing ? 'Preparing...' : 'Print'}</Text>
              </Pressable>
              <Pressable android_ripple={{}} className="flex-1 items-center rounded-lg border border-border py-2.5 active:opacity-70" onPress={() => setReceiptOrder(null)}>
                <Text className="text-foreground">Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <PaymentModal order={paymentOrder} user={user} payloadToken={payloadToken} onClose={() => setPaymentOrder(null)} onRecorded={refresh} />
      <VoidRefundModal order={voidOrder} payloadToken={payloadToken} onClose={() => setVoidOrder(null)} onDone={refresh} />
    </SafeAreaView>
  );
}
