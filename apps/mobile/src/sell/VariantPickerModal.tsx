import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Modal, View, Text, TextInput, Pressable, FlatList, Image, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useMutedPlaceholderColor } from '../lib/theme';
import type { LocalProduct, LocalVariant } from './types';

// Opens whenever a variant-having product is picked (see SellScreen's
// requestAdd) - a product with variants is never sold as its bare self,
// same rule as apps/web/.../sell/variant-picker-dialog.tsx. `variants` is
// pre-fetched by the caller (SellScreen's own catalog fetch, mapped via
// toLocalVariants) rather than queried here - there's no local database
// to query anymore now that catalog data comes from the REST API.
export function VariantPickerModal({
  product,
  variants,
  onSelect,
  onClose,
}: {
  product: LocalProduct | null;
  variants: LocalVariant[];
  onSelect: (variant: LocalVariant) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const placeholderColor = useMutedPlaceholderColor();

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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
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
            // Concrete pixel cap, not unconstrained: this list sits inside a
            // max-height-capped, content-sized Pressable (not a flex:1
            // screen), the same layout shape that left SalesScreen's
            // receipt line items measuring to zero height and rendering
            // nothing - see that fix's own note for the full explanation.
            // Bumped from 420 to 460 to keep a similar visible row count
            // now that the search bar above eats into the sheet's header.
            style={{ maxHeight: 460 }}
            data={results}
            keyExtractor={(v) => v.id}
            ListEmptyComponent={
              query.trim() ? (
                <Text className="mt-4 text-center text-sm text-muted-foreground">No options match &quot;{query.trim()}&quot;.</Text>
              ) : null
            }
            renderItem={({ item }) => {
              const outOfStock = item.stock_on_hand <= 0;
              const price = item.sell_price ?? product?.sell_price ?? 0;
              const imageUrl = item.image_url ?? product?.image_url ?? null;
              return (
                <Animated.View entering={FadeInDown.duration(200)}>
                <Pressable android_ripple={{}}
                  className={`mb-2 flex-row items-center justify-between rounded-lg border border-border p-3 ${outOfStock ? 'opacity-50' : 'active:bg-muted'}`}
                  disabled={outOfStock}
                  onPress={() => onSelect(item)}
                >
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
                  <View className="items-end">
                    <Text className="text-sm font-semibold text-foreground">{price.toFixed(2)}</Text>
                    <Text className={outOfStock ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                      {outOfStock ? 'Out of stock' : `${item.stock_on_hand} in stock`}
                    </Text>
                  </View>
                </Pressable>
                </Animated.View>
              );
            }}
          />
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
