import { useEffect, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useMutedPlaceholderColor } from '../lib/theme';
import { Modal, View, Text, TextInput, Pressable, FlatList } from 'react-native';
import { getDb } from '../db/database';
import { uuid } from '../lib/uuid';

interface PickableProduct {
  id: string;
  name: string;
  sku: string;
}

interface PickableVariant {
  id: string;
  label: string;
}

const TYPES = [
  { value: 'restock', label: 'Restock (received new stock)' },
  { value: 'adjustment', label: 'Correction (recount - can be + or -)' },
  { value: 'write_off', label: 'Write-off (damaged / lost / expired)' },
] as const;

// Every manual stock change is a new stock_movements row, never a direct
// edit to a count (there is no stored count) - mirrors apps/web/.../
// inventory/stock-adjustment-dialog.tsx's write shape exactly (same
// implied-sign convention per type), but as a LOCAL PowerSync insert rather
// than a REST call: unlike a sale (whose stock_movements rows only ever
// come from the server's Orders.ts hook, never written by the client - see
// SellScreen's own note), a manual adjustment's row IS the authoritative
// write itself on every surface, including web's - so writing it locally
// here and letting it sync up is a strict offline-capability upgrade over
// web's online-only REST POST, not a behavior change.
export function StockAdjustmentModal({
  visible,
  tenantId,
  storeId,
  terminalId,
  onClose,
  onRecorded,
}: {
  visible: boolean;
  tenantId: number;
  storeId: number;
  terminalId: string;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const placeholderColor = useMutedPlaceholderColor();
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<PickableProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<PickableProduct | null>(null);
  const [variants, setVariants] = useState<PickableVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<PickableVariant | null>(null);
  const [type, setType] = useState<(typeof TYPES)[number]['value']>('restock');
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProductQuery('');
    setProductResults([]);
    setSelectedProduct(null);
    setVariants([]);
    setSelectedVariant(null);
    setType('restock');
    setQuantity('');
    setError(null);
  }, [visible]);

  useEffect(() => {
    const trimmed = productQuery.trim();
    if (!trimmed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProductResults([]);
      return;
    }
    let active = true;
    getDb()
      .getAll<PickableProduct>(`SELECT id, name, sku FROM products WHERE tenant_id = ? AND is_active = 1 AND (name LIKE ? OR sku LIKE ?) ORDER BY name LIMIT 10`, [
        tenantId,
        `%${trimmed}%`,
        `%${trimmed}%`,
      ])
      .then((rows) => {
        if (active) setProductResults(rows);
      });
    return () => {
      active = false;
    };
  }, [productQuery, tenantId]);

  useEffect(() => {
    if (!selectedProduct) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVariants([]);
      return;
    }
    let active = true;
    getDb()
      .getAll<PickableVariant>(`SELECT id, label FROM products_variants WHERE _parent_id = ? ORDER BY _order`, [selectedProduct.id])
      .then((rows) => {
        if (active) setVariants(rows);
      });
    return () => {
      active = false;
    };
  }, [selectedProduct]);

  async function handleSubmit() {
    if (!selectedProduct) {
      setError('Pick a product');
      return;
    }
    if (variants.length > 0 && !selectedVariant) {
      setError('Pick a variant');
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty === 0) {
      setError('Enter a non-zero quantity');
      return;
    }
    // Restock/write-off have an implied sign - typing "10" for a write-off
    // means "10 units gone", not "add 10". Adjustment takes the sign
    // literally, since a recount can go either way.
    const quantityDelta = type === 'write_off' ? -Math.abs(qty) : type === 'restock' ? Math.abs(qty) : qty;

    setBusy(true);
    setError(null);
    try {
      await getDb().execute(
        `INSERT INTO stock_movements (id, tenant_id, store_id, product_id, variant, quantity_delta, reason, client_timestamp, source_terminal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid(), tenantId, storeId, Number(selectedProduct.id), selectedVariant?.id ?? null, quantityDelta, type, new Date().toISOString(), terminalId],
      );
      onRecorded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable android_ripple={{}} className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable android_ripple={{}} className="max-h-[85%] rounded-t-2xl bg-background p-4" onPress={(e) => e.stopPropagation()}>
          <Text className="mb-3 text-lg font-semibold text-foreground">Adjust stock</Text>

          {selectedProduct ? (
            <Pressable android_ripple={{}}
              className="rounded-lg border border-border bg-card p-3"
              onPress={() => {
                setSelectedProduct(null);
                setSelectedVariant(null);
              }}
            >
              <Text className="font-medium text-foreground">{selectedProduct.name}</Text>
              <Text className="text-xs text-muted-foreground">{selectedProduct.sku} · tap to change</Text>
            </Pressable>
          ) : (
            <>
              <TextInput
                className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
                placeholder="Search product by name or SKU..."
                placeholderTextColor={placeholderColor}
                value={productQuery}
                onChangeText={setProductQuery}
              />
              {productResults.length > 0 ? (
                <View className="mt-2 rounded-lg border border-border">
                  <FlatList
                    data={productResults}
                    keyExtractor={(p) => p.id}
                    renderItem={({ item }) => (
                      <Animated.View entering={FadeInDown.duration(180)}>
                      <Pressable android_ripple={{}} className="border-b border-border px-3 py-2 last:border-b-0 active:bg-muted" onPress={() => setSelectedProduct(item)}>
                        <Text className="text-sm text-foreground">{item.name}</Text>
                        <Text className="text-xs text-muted-foreground">{item.sku}</Text>
                      </Pressable>
                      </Animated.View>
                    )}
                  />
                </View>
              ) : null}
            </>
          )}

          {variants.length > 0 ? (
            <>
              <Text className="mb-1 mt-3 text-sm text-muted-foreground">Variant</Text>
              <View className="flex-row flex-wrap gap-1.5">
                {variants.map((v) => (
                  <Pressable android_ripple={{ color: '#ffffff40' }}
                    key={v.id}
                    className={`rounded-md border px-3 py-1.5 ${selectedVariant?.id === v.id ? 'border-primary bg-primary' : 'border-border'}`}
                    onPress={() => setSelectedVariant(v)}
                  >
                    <Text className={selectedVariant?.id === v.id ? 'text-sm font-medium text-primary-foreground' : 'text-sm text-foreground'}>{v.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Text className="mb-1 mt-3 text-sm text-muted-foreground">Type</Text>
          <View className="gap-1.5">
            {TYPES.map((t) => (
              <Pressable android_ripple={{ color: '#ffffff40' }}
                key={t.value}
                className={`rounded-md border px-3 py-2 ${type === t.value ? 'border-primary bg-primary' : 'border-border'}`}
                onPress={() => setType(t.value)}
              >
                <Text className={type === t.value ? 'font-medium text-primary-foreground' : 'text-foreground'}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text className="mb-1 mt-3 text-sm text-muted-foreground">{type === 'adjustment' ? 'Quantity (use a minus sign to remove stock)' : 'Quantity'}</Text>
          <TextInput
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
            keyboardType="numbers-and-punctuation"
            value={quantity}
            onChangeText={setQuantity}
          />

          {error ? <Text className="mt-3 text-destructive">{error}</Text> : null}

          <Pressable android_ripple={{ color: '#ffffff40' }} className={`mt-4 items-center rounded-lg bg-primary py-3 ${busy ? 'opacity-50' : 'active:opacity-80'}`} disabled={busy} onPress={handleSubmit}>
            <Text className="font-medium text-primary-foreground">{busy ? 'Saving...' : 'Record movement'}</Text>
          </Pressable>
          <Pressable android_ripple={{}} className="mt-2 items-center py-2" onPress={onClose}>
            <Text className="text-muted-foreground">Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
