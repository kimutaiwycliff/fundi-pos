import { useEffect, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Modal, View, Text, Pressable, FlatList } from 'react-native';
import { getDb } from '../db/database';
import type { LocalProduct, LocalVariant } from './types';

// Opens whenever a variant-having product is picked (see SellScreen's
// requestAdd) - a product with variants is never sold as its bare self,
// same rule as apps/web/.../sell/variant-picker-dialog.tsx. Queries
// products_variants on demand rather than joining it into every search
// result row, since most searches never open this.
export function VariantPickerModal({
  product,
  storeId,
  onSelect,
  onClose,
}: {
  product: LocalProduct | null;
  storeId: number;
  onSelect: (variant: LocalVariant) => void;
  onClose: () => void;
}) {
  const [variants, setVariants] = useState<LocalVariant[]>([]);

  useEffect(() => {
    if (!product) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVariants([]);
      return;
    }
    let active = true;
    getDb()
      .getAll<LocalVariant>(
        `SELECT pv.id, pv.label, pv.sku, pv.barcode, pv.sell_price,
                COALESCE((SELECT SUM(sm.quantity_delta) FROM stock_movements sm
                          WHERE sm.variant = pv.id AND sm.store_id = ?), 0) AS stock_on_hand
         FROM products_variants pv
         WHERE pv._parent_id = ?
         ORDER BY pv._order`,
        [storeId, product.id],
      )
      .then((rows) => {
        if (active) setVariants(rows);
      });
    return () => {
      active = false;
    };
  }, [product, storeId]);

  return (
    <Modal visible={product != null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable android_ripple={{}} className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable android_ripple={{}} className="max-h-[70%] rounded-t-2xl bg-background p-4" onPress={(e) => e.stopPropagation()}>
          <Text className="mb-3 text-lg font-semibold text-foreground">{product?.name} — choose an option</Text>
          <FlatList
            data={variants}
            keyExtractor={(v) => v.id}
            renderItem={({ item }) => {
              const outOfStock = item.stock_on_hand <= 0;
              const price = item.sell_price ?? product?.sell_price ?? 0;
              return (
                <Animated.View entering={FadeInDown.duration(200)}>
                <Pressable android_ripple={{}}
                  className={`mb-2 flex-row items-center justify-between rounded-lg border border-border p-3 ${outOfStock ? 'opacity-50' : 'active:bg-muted'}`}
                  disabled={outOfStock}
                  onPress={() => onSelect(item)}
                >
                  <View className="shrink">
                    <Text className="text-sm font-medium text-foreground">{item.label}</Text>
                    <Text className="text-xs text-muted-foreground">{item.sku}</Text>
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
    </Modal>
  );
}
