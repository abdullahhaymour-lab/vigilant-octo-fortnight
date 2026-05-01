import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api, COLORS, formatJD, type Product } from "../src/api";

const EMOJIS = ["🥤", "⚡", "💧", "☕", "🍵", "🍟", "🍫", "🍪", "🥪", "🍔", "🍕", "🌭", "🍿", "🍩", "🍰"];
const CATEGORIES = ["مشروبات", "مشروبات الطاقة", "مشروبات ساخنة", "سناكس", "طعام", "حلويات", "عام"];

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [emoji, setEmoji] = useState(EMOJIS[0]);

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

  const openCreate = () => {
    setEditing(null);
    setName("");
    setPrice("");
    setStock("");
    setCategory(CATEGORIES[0]);
    setEmoji(EMOJIS[0]);
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setName(p.name);
    setPrice(String(p.price));
    setStock(String(p.stock));
    setCategory(p.category);
    setEmoji(p.emoji);
    setModalOpen(true);
  };

  const save = async () => {
    if (!name.trim() || !price.trim()) {
      Alert.alert("خطأ", "الاسم والسعر مطلوبان");
      return;
    }
    const payload = {
      name: name.trim(),
      price: parseFloat(price),
      stock: parseInt(stock) || 0,
      category,
      emoji,
    };
    try {
      if (editing) {
        await api.updateProduct(editing.id, payload);
      } else {
        await api.createProduct(payload);
      }
      setModalOpen(false);
      await load();
    } catch (e: any) {
      Alert.alert("خطأ", e.message);
    }
  };

  const remove = (p: Product) => {
    Alert.alert("حذف المنتج", `هل تريد حذف ${p.name}؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteProduct(p.id);
            await load();
          } catch (e: any) {
            Alert.alert("خطأ", e.message);
          }
        },
      },
    ]);
  };

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
        <View>
          <Text style={styles.title}>المنتجات</Text>
          <Text style={styles.sub}>إدارة قائمة الكافتيريا ({products.length})</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate} testID="add-product-btn">
          <Ionicons name="add" size={22} color="#000" />
          <Text style={styles.addText}>إضافة</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {products.map((p) => (
          <View key={p.id} style={styles.row} testID={`product-row-${p.id}`}>
            <Text style={styles.rowEmoji}>{p.emoji}</Text>
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <Text style={styles.rowName}>{p.name}</Text>
              <Text style={styles.rowMeta}>
                {p.category} • {formatJD(p.price)} • مخزون: {p.stock}
              </Text>
            </View>
            <TouchableOpacity onPress={() => openEdit(p)} style={styles.iconBtn}>
              <Ionicons name="pencil" size={18} color={COLORS.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => remove(p)}
              style={styles.iconBtn}
              testID={`delete-product-${p.id}`}
            >
              <Ionicons name="trash" size={18} color={COLORS.danger} />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      <Modal visible={modalOpen} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editing ? "تعديل منتج" : "منتج جديد"}
              </Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Ionicons name="close-circle" size={28} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={styles.label}>الأيقونة</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {EMOJIS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    onPress={() => setEmoji(e)}
                    style={[styles.emojiOpt, emoji === e && styles.emojiOptActive]}
                  >
                    <Text style={{ fontSize: 22 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>الاسم</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="مثال: بيبسي"
                placeholderTextColor={COLORS.textDim}
                testID="product-name-input"
              />

              <Text style={styles.label}>السعر (د.أ)</Text>
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                placeholder="0.50"
                placeholderTextColor={COLORS.textDim}
                testID="product-price-input"
              />

              <Text style={styles.label}>المخزون</Text>
              <TextInput
                style={styles.input}
                value={stock}
                onChangeText={setStock}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={COLORS.textDim}
                testID="product-stock-input"
              />

              <Text style={styles.label}>الفئة</Text>
              <View style={styles.catsRow}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[styles.catChip, category === c && styles.catChipActive]}
                  >
                    <Text
                      style={[
                        styles.catChipText,
                        category === c && { color: "#000" },
                      ]}
                    >
                      {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={save} testID="save-product-btn">
                <Text style={styles.saveText}>حفظ</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  title: { color: COLORS.text, fontSize: 22, fontWeight: "900" },
  sub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  addBtn: {
    flexDirection: "row",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    gap: 4,
  },
  addText: { color: "#000", fontWeight: "900", fontSize: 13 },
  scroll: { padding: 16, paddingTop: 0, paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  rowEmoji: { fontSize: 30 },
  rowName: { color: COLORS.text, fontSize: 15, fontWeight: "800" },
  rowMeta: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  iconBtn: { padding: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: "900" },
  label: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    textAlign: "right",
  },
  emojiOpt: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginEnd: 8,
  },
  emojiOptActive: { borderColor: COLORS.primary, backgroundColor: "rgba(0,240,255,0.1)" },
  catsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  catChip: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  catChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catChipText: { color: COLORS.text, fontSize: 12, fontWeight: "700" },
  saveBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  saveText: { color: "#000", fontSize: 16, fontWeight: "900" },
});
