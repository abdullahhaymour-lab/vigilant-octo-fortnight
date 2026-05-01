import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api, COLORS, formatJD, type Product } from "../src/api";

type CartItem = { product: Product; qty: number };

export default function Cafeteria() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await api.listProducts();
      setProducts(p);
    } catch (e: any) {
      console.log(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const addToCart = (p: Product) => {
    setCart((prev) => {
      const existing = prev[p.id];
      const nextQty = (existing?.qty || 0) + 1;
      if (nextQty > p.stock) {
        Alert.alert("تنبيه", "الكمية المطلوبة تتجاوز المخزون");
        return prev;
      }
      return { ...prev, [p.id]: { product: p, qty: nextQty } };
    });
  };

  const decFromCart = (id: string) => {
    setCart((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      if (existing.qty <= 1) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: { ...existing, qty: existing.qty - 1 } };
    });
  };

  const total = Object.values(cart).reduce(
    (s, c) => s + c.product.price * c.qty,
    0
  );

  const itemCount = Object.values(cart).reduce((s, c) => s + c.qty, 0);

  const checkout = async () => {
    if (itemCount === 0) return;
    setSubmitting(true);
    try {
      await api.cafeteriaSale(
        Object.values(cart).map((c) => ({
          product_id: c.product.id,
          quantity: c.qty,
        }))
      );
      setCart({});
      await load();
      Alert.alert("تم", `تم تسجيل البيع بنجاح\nالإجمالي: ${formatJD(total)}`);
    } catch (e: any) {
      Alert.alert("خطأ", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const categories = Array.from(new Set(products.map((p) => p.category)));

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={COLORS.primary} size="large" style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>الكافتيريا</Text>
        <Text style={styles.sub}>نقطة بيع مستقلة</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {categories.map((cat) => (
          <View key={cat} style={{ marginBottom: 18 }}>
            <Text style={styles.catTitle}>{cat}</Text>
            <View style={styles.grid}>
              {products
                .filter((p) => p.category === cat)
                .map((p) => {
                  const inCart = cart[p.id]?.qty || 0;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.card,
                        p.stock <= 0 && { opacity: 0.4 },
                        inCart > 0 && styles.cardInCart,
                      ]}
                      disabled={p.stock <= 0}
                      onPress={() => addToCart(p)}
                      testID={`cafe-product-${p.id}`}
                    >
                      <Text style={styles.emoji}>{p.emoji}</Text>
                      <Text style={styles.name} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.price}>{formatJD(p.price)}</Text>
                      <Text style={styles.stock}>متوفر: {p.stock}</Text>
                      {inCart > 0 && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{inCart}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
            </View>
          </View>
        ))}
        <View style={{ height: 200 }} />
      </ScrollView>

      {/* Cart footer */}
      {itemCount > 0 && (
        <View style={styles.cartFooter}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 10 }}
          >
            {Object.values(cart).map((c) => (
              <TouchableOpacity
                key={c.product.id}
                style={styles.cartChip}
                onPress={() => decFromCart(c.product.id)}
              >
                <Text style={styles.chipText}>
                  {c.product.name} × {c.qty}
                </Text>
                <Ionicons name="close" size={14} color={COLORS.textMuted} />
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.cartRow}>
            <View>
              <Text style={styles.totalLabel}>الإجمالي</Text>
              <Text style={styles.totalValue}>{formatJD(total)}</Text>
            </View>
            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={checkout}
              disabled={submitting}
              testID="checkout-btn"
            >
              {submitting ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#000" />
                  <Text style={styles.checkoutText}>تأكيد البيع</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: 16 },
  title: { color: COLORS.text, fontSize: 24, fontWeight: "900" },
  sub: { color: COLORS.textMuted, fontSize: 13, marginTop: 2 },
  scroll: { paddingHorizontal: 16, paddingBottom: 20 },
  catTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800", marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: {
    width: "31%",
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    position: "relative",
  },
  cardInCart: { borderColor: COLORS.primary },
  emoji: { fontSize: 34 },
  name: { color: COLORS.text, fontSize: 12, fontWeight: "700", marginTop: 6 },
  price: { color: COLORS.primary, fontSize: 13, fontWeight: "900", marginTop: 2 },
  stock: { color: COLORS.textDim, fontSize: 10, marginTop: 2 },
  badge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: COLORS.primary,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#000", fontSize: 11, fontWeight: "900" },
  cartFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    padding: 14,
  },
  cartChip: {
    flexDirection: "row",
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginEnd: 6,
    alignItems: "center",
    gap: 6,
  },
  chipText: { color: COLORS.text, fontSize: 11, fontWeight: "700" },
  cartRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: "700" },
  totalValue: { color: COLORS.text, fontSize: 22, fontWeight: "900" },
  checkoutBtn: {
    flexDirection: "row",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    gap: 8,
  },
  checkoutText: { color: "#000", fontSize: 15, fontWeight: "900" },
});
