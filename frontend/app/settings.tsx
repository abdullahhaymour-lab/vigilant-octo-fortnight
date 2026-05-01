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
import { api, COLORS, formatJD, type Room } from "../src/api";

export default function Settings() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Room | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.listRooms();
      setRooms(r);
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

  const openEdit = (r: Room) => {
    setEditing(r);
    setName(r.name);
    setPrice(String(r.price_per_hour));
  };

  const save = async () => {
    if (!editing) return;
    if (!name.trim() || !price.trim()) {
      Alert.alert("خطأ", "جميع الحقول مطلوبة");
      return;
    }
    try {
      await api.updateRoom(editing.id, {
        name: name.trim(),
        price_per_hour: parseFloat(price),
      });
      setEditing(null);
      await load();
    } catch (e: any) {
      Alert.alert("خطأ", e.message);
    }
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
        <Text style={styles.title}>الإعدادات</Text>
        <Text style={styles.sub}>تعديل أسماء وأسعار الغرف</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionTitle}>الغرف</Text>
        {rooms.map((r) => (
          <TouchableOpacity
            key={r.id}
            style={styles.row}
            onPress={() => openEdit(r)}
            testID={`room-setting-${r.order}`}
          >
            <View style={styles.iconBox}>
              <Ionicons name="game-controller" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <Text style={styles.rowName}>{r.name}</Text>
              <Text style={styles.rowMeta}>{formatJD(r.price_per_hour)} / ساعة</Text>
            </View>
            <Ionicons name="chevron-back" size={20} color={COLORS.textDim} />
          </TouchableOpacity>
        ))}

        <View style={{ marginTop: 24 }}>
          <Text style={styles.sectionTitle}>حول التطبيق</Text>
          <View style={styles.aboutBox}>
            <Text style={styles.aboutText}>
              تطبيق إدارة محل البلايستيشن{"\n"}
              العملة: د.أ (دينار أردني){"\n"}
              جميع الأسعار قابلة للتعديل
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal visible={!!editing} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>تعديل غرفة</Text>
              <TouchableOpacity onPress={() => setEditing(null)}>
                <Ionicons name="close-circle" size={28} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>اسم الغرفة</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholderTextColor={COLORS.textDim}
              testID="room-name-input"
            />

            <Text style={styles.label}>سعر الساعة (د.أ)</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholderTextColor={COLORS.textDim}
              testID="room-price-input"
            />

            <TouchableOpacity style={styles.saveBtn} onPress={save} testID="save-room-btn">
              <Text style={styles.saveText}>حفظ</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: 16 },
  title: { color: COLORS.text, fontSize: 22, fontWeight: "900" },
  sub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  scroll: { padding: 16, paddingTop: 0, paddingBottom: 40 },
  sectionTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800", marginBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(0,240,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowName: { color: COLORS.text, fontSize: 15, fontWeight: "800" },
  rowMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  aboutBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  aboutText: { color: COLORS.textMuted, fontSize: 13, lineHeight: 22 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
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
    marginTop: 10,
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
