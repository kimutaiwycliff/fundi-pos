import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import Fuse from 'fuse.js';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Modal, View, Text, TextInput, Pressable, FlatList, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutedPlaceholderColor } from '../lib/theme';
import type { QuoteProduct, QuoteVariant } from './types';

// Sibling of sell/VariantPickerModal.tsx, deliberately NOT reusing it -
// that modal disables out-of-stock variants (stock-gating baked into
// `disabled={outOfStock}`), which doesn't apply to a quotation ("no
// stock-quantity gating of any kind" per the builder's own requirements).
// Same reactive query pattern (products_variants on demand, once the modal
// actually opens), just without the per-store stock_on_hand subquery/join,
// so every variant of a picked product is always selectable here - and this
// modal doesn't even need a storeId, since nothing it queries is store-
// scoped.
export function QuoteVariantPickerModal({
  product,
  onSelect,
  onClose,
}: {
  product: QuoteProduct | null;
  onSelect: (variant: QuoteVariant) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const placeholderColor = useMutedPlaceholderColor();

  // product?.id ?? '' keeps the hook call unconditional (PowerSync's
  // useQuery can't be called conditionally) while still matching zero rows
  // whenever the modal is closed (product == null).
  const { data: variants } = useQuery<QuoteVariant>(
    `SELECT pv.id, pv.label, pv.sku, pv.barcode, pv.sell_price, m.url AS image_url
     FROM products_variants pv
     LEFT JOIN media m ON m.id = pv.image_id
     WHERE pv._parent_id = ?
     ORDER BY pv._order`,
    [product?.id ?? ''],
  );

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return variants;
    const fuse = new Fuse(variants, { threshold: 0.4, ignoreLocation: true, keys: ['label', 'sku', 'barcode'] });
    return fuse.search(trimmed).map((r) => r.item);
  }, [query, variants]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery('');
  }, [product]);

  return (
    <Modal visible={product != null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable android_ripple={{}} className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable android_ripple={{}} className="max-h-[70%] rounded-t-2xl bg-background p-4" onPress={(e) => e.stopPropagation()}>
          <Text className="mb-3 text-lg font-semibold text-foreground">{product?.name} — choose an option</Text>
          {variants.length > 6 ? (
            <TextInput
              className="mb-2 rounded-lg border border-border bg-card px-3 py-2 text-foreground"
              placeholder="Search by name, SKU, or barcode..."
              placeholderTextColor={placeholderColor}
              value={query}
              onChangeText={setQuery}
            />
          ) : null}
          <FlatList
            style={{ maxHeight: 460 }}
            data={results}
            keyExtractor={(v) => v.id}
            ListEmptyComponent={
              query.trim() ? (
                <Text className="mt-4 text-center text-sm text-muted-foreground">No options match &quot;{query.trim()}&quot;.</Text>
              ) : null
            }
            renderItem={({ item }) => {
              const price = item.sell_price ?? product?.sell_price ?? 0;
              const imageUrl = item.image_url ?? product?.image_url ?? null;
              return (
                <Animated.View entering={FadeInDown.duration(200)}>
                  <Pressable android_ripple={{}} className="mb-2 flex-row items-center justify-between rounded-lg border border-border p-3 active:bg-muted" onPress={() => onSelect(item)}>
                    <View className="flex-1 flex-row items-center gap-3">
                      {imageUrl ? (
                        <Image source={{ uri: imageUrl }} className="h-12 w-12 rounded-md bg-muted" resizeMode="cover" />
                      ) : (
                        <View className="h-12 w-12 items-center justify-center rounded-md bg-muted">
                          <Ionicons name="image-outline" size={18} color="#71717a" />
                        </View>
                      )}
                      <View className="shrink">
                        <Text className="text-sm font-medium text-foreground">{item.label}</Text>
                        <Text className="text-xs text-muted-foreground">{item.sku}</Text>
                      </View>
                    </View>
                    <Text className="text-sm font-semibold text-foreground">{price.toFixed(2)}</Text>
                  </Pressable>
                </Animated.View>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
