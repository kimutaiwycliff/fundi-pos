import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import Fuse from 'fuse.js';
import { View, Text, TextInput, Pressable, FlatList, Modal, Image, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutedPlaceholderColor } from '../lib/theme';
import { showAlert } from '../components/AppNotice';
import type { PayloadUser } from '../lib/auth';
import { createQuotation, type QuotationLineItem } from './quotations';
import { QuoteVariantPickerModal } from './QuoteVariantPickerModal';
import { quoteLineLabel, quoteLineUnitPrice, type QuoteProduct, type QuoteVariant } from './types';

function lineKey(l: Pick<QuotationLineItem, 'product' | 'variant'>): string {
  return `${l.product}::${l.variant ?? ''}`;
}

// Builder screen for a quotation - modeled on SellScreen.tsx's search/add
// flow (same catalog useQuery + Fuse fuzzy search + requestAdd-style variant
// gate) but deliberately NOT SellScreen's CartLine/checkout: no discount
// cap, no stock check of any kind, and unit price is a plain free-text
// number seeded from sell_price rather than something computed/clamped.
// Line items live in local state only until "Create quotation" posts them
// to the server in one shot - there's no local draft persistence (matches
// this collection's own REST-only, non-PowerSync-synced nature).
export function NewQuotationScreen({
  user,
  payloadToken,
  storeId,
  onCreated,
  onCancel,
}: {
  user: PayloadUser;
  payloadToken: string;
  storeId: number | null;
  onCreated: (id: number) => void;
  onCancel: () => void;
}) {
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;
  const placeholderColor = useMutedPlaceholderColor();

  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<QuotationLineItem[]>([]);
  const [variantPickerProduct, setVariantPickerProduct] = useState<QuoteProduct | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  // Same reactive catalog query as SellScreen.tsx (tenant-wide, active
  // products only), minus the per-store stock_on_hand subquery - a
  // quotation isn't gated by what's currently on the shelf, so storeId
  // never needs to reach this query at all.
  const { data: catalog } = useQuery<QuoteProduct>(
    `SELECT p.id, p.name, p.sku, p.barcode, p.sell_price, m.url AS image_url,
            (SELECT COUNT(*) FROM products_variants pv WHERE pv._parent_id = p.id) AS variant_count
     FROM products p
     LEFT JOIN media m ON m.id = p.image_id
     WHERE p.tenant_id = ? AND p.is_active = 1
     ORDER BY p.name LIMIT 5000`,
    [tenantId],
  );

  // Exact barcode match short-circuits the fuzzy pass, same reasoning as
  // SellScreen's own search (a scanned barcode is exact digits with no room
  // for a fuzzy near-miss).
  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const lower = trimmed.toLowerCase();
    const exactBarcodeMatch = catalog.find((p) => p.barcode && p.barcode.toLowerCase() === lower);
    if (exactBarcodeMatch) return [exactBarcodeMatch];
    const fuse = new Fuse(catalog, { threshold: 0.4, ignoreLocation: true, keys: ['name', 'sku'] });
    return fuse.search(trimmed).slice(0, 20).map((r) => r.item);
  }, [query, catalog]);

  function requestAdd(product: QuoteProduct) {
    if (product.variant_count > 0) {
      setVariantPickerProduct(product);
    } else {
      addLine(product, null);
    }
  }

  function addLine(product: QuoteProduct, variant: QuoteVariant | null) {
    const productId = Number(product.id);
    const variantId = variant?.id ?? null;
    const key = lineKey({ product: productId, variant: variantId });
    setLines((prev) => {
      const existing = prev.find((l) => lineKey(l) === key);
      if (existing) {
        return prev.map((l) => (lineKey(l) === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { product: productId, variant: variantId, label: quoteLineLabel(product, variant), quantity: 1, unitPrice: quoteLineUnitPrice(product, variant) }];
    });
    setQuery('');
    setVariantPickerProduct(null);
  }

  function updateQuantity(index: number, quantity: number) {
    setLines((prev) => (quantity <= 0 ? prev.filter((_, i) => i !== index) : prev.map((l, i) => (i === index ? { ...l, quantity } : l))));
  }

  // Completely free-text, per the spec - no clamping against sell_price, no
  // discount-cap concept at all. Number(text) || 0 mirrors SellScreen's own
  // discount-amount input handling (a blank/invalid field just reads as 0
  // rather than throwing).
  function updateUnitPrice(index: number, text: string) {
    const value = Number(text) || 0;
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, unitPrice: value } : l)));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  const total = useMemo(() => lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0), [lines]);

  async function handleSubmit() {
    if (lines.length === 0) {
      showAlert('Add at least one item to the quotation');
      return;
    }
    if (!customerName.trim()) {
      showAlert('Enter a customer name');
      return;
    }
    setBusy(true);
    const result = await createQuotation(payloadToken, {
      store: storeId ?? undefined,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined,
      notes: notes.trim() || undefined,
      lineItems: lines,
    });
    setBusy(false);
    if ('error' in result) {
      showAlert('Could not create quotation', result.error);
      return;
    }
    setReviewOpen(false);
    onCreated(result.doc.id);
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="gap-2 border-b border-border p-3">
        <View className="flex-row items-center justify-between">
          <Pressable onPress={onCancel}>
            <Text className="text-sm text-muted-foreground">← Back</Text>
          </Pressable>
          <Text className="text-base font-semibold text-foreground">New quotation</Text>
          <View style={{ width: 44 }} />
        </View>
        <TextInput
          className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
          placeholder="Scan barcode or search by name/SKU..."
          placeholderTextColor={placeholderColor}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <FlatList
        className="flex-1"
        contentContainerClassName="gap-2 p-3 pb-24"
        data={results}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={
          <Text className="mt-8 text-center text-muted-foreground">
            {query.trim() ? `No products match "${query.trim()}"` : 'Search for a product to add it to this quotation.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable android_ripple={{}} className="flex-row items-center gap-3 rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => requestAdd(item)}>
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} className="h-12 w-12 rounded-md bg-muted" resizeMode="cover" />
            ) : (
              <View className="h-12 w-12 rounded-md bg-muted" />
            )}
            <View className="shrink flex-1">
              <Text className="font-medium text-foreground" numberOfLines={1}>
                {item.name}
              </Text>
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {item.sku}
              </Text>
            </View>
            <Text className="font-semibold text-foreground">{item.variant_count > 0 ? `${item.variant_count} options` : item.sell_price.toFixed(2)}</Text>
          </Pressable>
        )}
      />

      <Pressable android_ripple={{}} className="border-t border-border bg-card px-4 py-3 active:opacity-80" onPress={() => setReviewOpen(true)}>
        <View className="flex-row items-center justify-between">
          <Text className="font-medium text-foreground">
            {lines.length} item{lines.length === 1 ? '' : 's'}
          </Text>
          <Text className="font-semibold text-foreground">{total.toFixed(2)} · Review & create</Text>
        </View>
      </Pressable>

      <QuoteVariantPickerModal product={variantPickerProduct} onSelect={(variant) => variantPickerProduct && addLine(variantPickerProduct, variant)} onClose={() => setVariantPickerProduct(null)} />

      <Modal visible={reviewOpen} animationType="slide" onRequestClose={() => setReviewOpen(false)}>
        <SafeAreaView edges={['top']} className="flex-1 bg-background">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
            <Text className="text-lg font-semibold text-foreground">Review quotation</Text>
            <Pressable onPress={() => setReviewOpen(false)}>
              <Text className="text-muted-foreground">Close</Text>
            </Pressable>
          </View>

          <FlatList
            style={{ maxHeight: 260 }}
            contentContainerClassName="gap-2 p-4"
            data={lines}
            keyExtractor={(l) => lineKey(l)}
            ListEmptyComponent={<Text className="text-center text-muted-foreground">No items added yet.</Text>}
            renderItem={({ item, index }) => (
              <View className="rounded-lg border border-border p-3">
                <View className="flex-row items-center justify-between">
                  <Text className="shrink flex-1 font-medium text-foreground">{item.label}</Text>
                  <Pressable onPress={() => removeLine(index)}>
                    <Text className="text-destructive">Remove</Text>
                  </Pressable>
                </View>
                <View className="mt-2 flex-row items-center gap-3">
                  <Pressable android_ripple={{}} className="h-8 w-8 items-center justify-center rounded-md border border-border" onPress={() => updateQuantity(index, item.quantity - 1)}>
                    <Text className="text-foreground">−</Text>
                  </Pressable>
                  <TextInput
                    className="w-12 text-center text-foreground"
                    keyboardType="number-pad"
                    value={String(item.quantity)}
                    onChangeText={(text) => updateQuantity(index, Number(text) || 0)}
                  />
                  <Pressable android_ripple={{}} className="h-8 w-8 items-center justify-center rounded-md border border-border" onPress={() => updateQuantity(index, item.quantity + 1)}>
                    <Text className="text-foreground">+</Text>
                  </Pressable>
                  <View className="ml-auto flex-row items-center gap-1.5">
                    <Text className="text-xs text-muted-foreground">Unit price</Text>
                    <TextInput
                      className="h-8 w-24 rounded-md border border-border bg-card px-2 text-sm text-foreground"
                      keyboardType="decimal-pad"
                      value={String(item.unitPrice)}
                      onChangeText={(text) => updateUnitPrice(index, text)}
                    />
                  </View>
                </View>
                <Text className="mt-2 text-right font-semibold text-foreground">{(item.quantity * item.unitPrice).toFixed(2)}</Text>
              </View>
            )}
          />

          <View className="gap-2 border-t border-border p-4">
            <Text className="text-right text-lg font-semibold text-foreground">Total: {total.toFixed(2)}</Text>
            <TextInput
              className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
              placeholder="Customer name"
              placeholderTextColor={placeholderColor}
              value={customerName}
              onChangeText={setCustomerName}
            />
            <TextInput
              className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
              placeholder="Customer phone (optional)"
              placeholderTextColor={placeholderColor}
              keyboardType="phone-pad"
              value={customerPhone}
              onChangeText={setCustomerPhone}
            />
            <TextInput
              className="min-h-16 rounded-lg border border-border bg-card px-3 py-2 text-foreground"
              placeholder="Notes (optional)"
              placeholderTextColor={placeholderColor}
              multiline
              textAlignVertical="top"
              value={notes}
              onChangeText={setNotes}
            />
            <Pressable
              android_ripple={{ color: '#ffffff40' }}
              className={`items-center rounded-lg bg-primary py-3 ${busy ? 'opacity-50' : 'active:opacity-80'}`}
              disabled={busy}
              onPress={handleSubmit}
            >
              <Text className="font-medium text-primary-foreground">{busy ? 'Creating...' : 'Create quotation'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
