import { Modal, View, Text, Pressable, FlatList } from 'react-native';
import type { HeldSale } from '../db/heldSales';

export function HeldSalesModal({
  visible,
  heldSales,
  onResume,
  onClose,
}: {
  visible: boolean;
  heldSales: HeldSale[];
  onResume: (held: HeldSale) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable className="max-h-[70%] rounded-t-2xl bg-background p-4" onPress={(e) => e.stopPropagation()}>
          <Text className="mb-3 text-lg font-semibold text-foreground">Held sales</Text>
          {heldSales.length === 0 ? (
            <Text className="text-muted-foreground">No held sales right now.</Text>
          ) : (
            <FlatList
              data={heldSales}
              keyExtractor={(h) => h.id}
              renderItem={({ item }) => (
                <View className="mb-2 flex-row items-center justify-between rounded-lg border border-border p-3">
                  <Text className="text-sm text-foreground">{new Date(item.createdAt).toLocaleTimeString()}</Text>
                  <Pressable
                    className="rounded-md bg-primary px-3 py-1.5 active:opacity-80"
                    onPress={() => {
                      onResume(item);
                      onClose();
                    }}
                  >
                    <Text className="text-sm font-medium text-primary-foreground">Resume</Text>
                  </Pressable>
                </View>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
