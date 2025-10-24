// components/RestaurantPickerModal.js
import React, { useEffect, useState } from "react";
import { Modal, View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { fetchRestaurants, initDB } from "../db/restaurants";

export default function RestaurantPickerModal({ visible, onClose, onPick, palette }) {
  const PALETTE = palette;
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      await initDB();
      const list = await fetchRestaurants();
      setItems(list);
    })();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { borderColor: "rgba(255,255,255,0.12)" }]}>
          <Text style={[styles.title, { color: PALETTE?.text ?? "#fff" }]}>Pick a Restaurant</Text>

          <FlatList
            data={items}
            keyExtractor={(it) => String(it.id)}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onPick?.(item)}
                style={({ pressed }) => [
                  styles.item,
                  {
                    backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                    borderColor: "rgba(255,255,255,0.12)",
                  },
                ]}
              >
                <Text style={{ color: PALETTE?.text ?? "#fff", fontWeight: "800" }}>{item.name}</Text>
              </Pressable>
            )}
          />

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12, justifyContent: "flex-end" }}>
            <Pressable onPress={onClose} style={styles.ghostBtn}>
              <Text style={[styles.ghostText, { color: PALETTE?.text ?? "#fff" }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center", padding: 20,
  },
  sheet: {
    width: "100%", maxWidth: 420, maxHeight: "70%",
    backgroundColor: "rgba(20,24,22,0.96)",
    borderRadius: 16, padding: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontWeight: "900", marginBottom: 8 },
  item: {
    paddingVertical: 14, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  ghostBtn: {
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "transparent",
  },
  ghostText: { fontSize: 16, fontWeight: "700" },
});
