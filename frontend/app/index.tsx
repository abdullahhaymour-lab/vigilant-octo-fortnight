import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  FlatList,
  Alert,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import {
  api,
  COLORS,
  formatJD,
  formatTimer,
  computeLiveCost,
  type Room,
  type Session,
  type Product,
} from "../src/api";

export default function Dashboard() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [active, setActive] = useState<Session[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [todayReport, setTodayReport] = useState<{ play: number; cafe: number }>({ play: 0, cafe: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [r, s, p, rep] = await Promise.all([
        api.listRooms(),
        api.activeSessions(),
        api.listProducts(),
        api.report("today"),
      ]);
      setRooms(r);
      setActive(s);
      setProducts(p);
      setTodayReport({ play: rep.play_revenue, cafe: rep.cafeteria_revenue });
    } catch (e: any) {
      console.log("load error", e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const sessionByRoom = useMemo(() => {
    const map: Record<string, Session> = {};
    active.forEach((s) => (map[s.room_id] = s));
    return map;
  }, [active]);

  const activeCount = active.length;

  const handleRoomPress = async (room: Room) => {
    const sess = sessionByRoom[room.id];
    if (!sess) {
      // Start new session
      Alert.alert(
        "بدء جلسة جديدة",
        `غرفة: ${room.name}\nالسعر: ${formatJD(room.price_per_hour)}/ساعة`,
        [
          { text: "إلغاء", style: "cancel" },
          {
            text: "ابدأ",
            onPress: async () => {
              try {
                await api.startSession(room.id);
                await loadAll();
              } catch (e: any) {
                Alert.alert("خطأ", e.message);
              }
            },
          },
        ]
      );
    } else {
      // Open session details modal
      setSelectedRoom(room);
      setSelectedSession(sess);
    }
  };

  const handleStop = async () => {
    if (!selectedSession) return;
    Alert.alert(
      "إنهاء الجلسة",
      `الإجمالي: ${formatJD(
        computeLiveCost(selectedSession.started_at, selectedSession.price_per_hour) +
          selectedSession.cafeteria_cost
      )}\nهل أنت متأكد من إنهاء الجلسة؟`,
      [
        { text: "تراجع", style: "cancel" },
        {
          text: "إنهاء",
          style: "destructive",
          onPress: async () => {
            try {
              await api.stopSession(selectedSession.id);
              setSelectedRoom(null);
              setSelectedSession(null);
              await loadAll();
            } catch (e: any) {
              Alert.alert("خطأ", e.message);
            }
          },
        },
      ]
    );
  };

  const handleAddItem = async (product: Product) => {
    if (!selectedSession) return;
    try {
      const updated = await api.addItem(selectedSession.id, product.id, 1);
      setSelectedSession(updated);
      await loadAll();
    } catch (e: any) {
      Alert.alert("خطأ", e.message);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!selectedSession) return;
    try {
      const updated = await api.removeItem(selectedSession.id, itemId);
      setSelectedSession(updated);
      await loadAll();
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
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle} testID="app-title">صالة البلايستيشن</Text>
            <Text style={styles.headerSub}>لوحة التحكم المباشرة</Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>مباشر</Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatCard
            icon="flash"
            label="جلسات نشطة"
            value={`${activeCount}`}
            accent={COLORS.primary}
            testID="stat-active"
          />
          <StatCard
            icon="game-controller"
            label="إيراد اليوم - بلايستيشن"
            value={formatJD(todayReport.play)}
            accent={COLORS.success}
            testID="stat-play"
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard
            icon="fast-food"
            label="إيراد اليوم - كافتيريا"
            value={formatJD(todayReport.cafe)}
            accent={COLORS.warning}
            testID="stat-cafe"
          />
          <StatCard
            icon="cash"
            label="إجمالي اليوم"
            value={formatJD(todayReport.play + todayReport.cafe)}
            accent="#A855F7"
            testID="stat-total"
          />
        </View>

        {/* Rooms grid */}
        <Text style={styles.sectionTitle}>الغرف ({rooms.length})</Text>
        <View style={styles.grid}>
          {rooms.map((room) => {
            const sess = sessionByRoom[room.id];
            const active = !!sess;
            const liveCost = sess
              ? computeLiveCost(sess.started_at, sess.price_per_hour) + sess.cafeteria_cost
              : 0;
            return (
              <TouchableOpacity
                key={room.id}
                style={[styles.roomCard, active && styles.roomCardActive]}
                activeOpacity={0.8}
                onPress={() => handleRoomPress(room)}
                testID={`room-card-${room.order}`}
              >
                <View style={styles.roomTop}>
                  <Text style={styles.roomName}>{room.name}</Text>
                  {active ? (
                    <View style={styles.statusActive}>
                      <View style={styles.statusDot} />
                      <Text style={styles.statusActiveText}>نشطة</Text>
                    </View>
                  ) : (
                    <View style={styles.statusIdle}>
                      <Text style={styles.statusIdleText}>متاحة</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.roomPrice}>{formatJD(room.price_per_hour)}/س</Text>
                {active ? (
                  <>
                    <Text style={styles.timer} key={tick}>
                      {formatTimer(sess.started_at)}
                    </Text>
                    <Text style={styles.roomCost}>{formatJD(liveCost)}</Text>
                  </>
                ) : (
                  <View style={styles.idlePlaceholder}>
                    <Ionicons name="play-circle-outline" size={32} color={COLORS.textDim} />
                    <Text style={styles.idleHint}>اضغط للبدء</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Session detail modal */}
      <Modal
        visible={!!selectedSession}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setSelectedRoom(null);
          setSelectedSession(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{selectedRoom?.name}</Text>
                <Text style={styles.modalSub}>
                  {formatJD(selectedRoom?.price_per_hour || 0)}/ساعة
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setSelectedRoom(null);
                  setSelectedSession(null);
                }}
                testID="close-modal"
              >
                <Ionicons name="close-circle" size={32} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {selectedSession && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.timerBox}>
                  <Text style={styles.timerLabel}>مدة الجلسة</Text>
                  <Text style={styles.timerBig} key={tick}>
                    {formatTimer(selectedSession.started_at)}
                  </Text>
                  <View style={styles.costRow}>
                    <View style={styles.costItem}>
                      <Text style={styles.costLabel}>بلايستيشن</Text>
                      <Text style={styles.costValue}>
                        {formatJD(
                          computeLiveCost(
                            selectedSession.started_at,
                            selectedSession.price_per_hour
                          )
                        )}
                      </Text>
                    </View>
                    <View style={styles.costItem}>
                      <Text style={styles.costLabel}>كافتيريا</Text>
                      <Text style={styles.costValue}>
                        {formatJD(selectedSession.cafeteria_cost)}
                      </Text>
                    </View>
                    <View style={[styles.costItem, styles.costTotal]}>
                      <Text style={styles.costLabel}>الإجمالي</Text>
                      <Text style={styles.costValueTotal}>
                        {formatJD(
                          computeLiveCost(
                            selectedSession.started_at,
                            selectedSession.price_per_hour
                          ) + selectedSession.cafeteria_cost
                        )}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.sectionTitle}>طلبات الكافتيريا</Text>
                {selectedSession.items.length === 0 ? (
                  <Text style={styles.emptyText}>لا توجد طلبات</Text>
                ) : (
                  selectedSession.items.map((it) => (
                    <View key={it.id} style={styles.itemRow}>
                      <TouchableOpacity
                        onPress={() => handleRemoveItem(it.id)}
                        testID={`remove-item-${it.id}`}
                      >
                        <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
                      </TouchableOpacity>
                      <View style={{ flex: 1, marginHorizontal: 12 }}>
                        <Text style={styles.itemName}>{it.product_name}</Text>
                        <Text style={styles.itemMeta}>
                          {it.quantity} × {formatJD(it.price)}
                        </Text>
                      </View>
                      <Text style={styles.itemSubtotal}>{formatJD(it.subtotal)}</Text>
                    </View>
                  ))
                )}

                <Text style={styles.sectionTitle}>إضافة منتج للفاتورة</Text>
                <View style={styles.productGrid}>
                  {products.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.productMini,
                        p.stock <= 0 && { opacity: 0.4 },
                      ]}
                      disabled={p.stock <= 0}
                      onPress={() => handleAddItem(p)}
                      testID={`add-product-${p.id}`}
                    >
                      <Text style={styles.productEmoji}>{p.emoji}</Text>
                      <Text style={styles.productName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.productPrice}>{formatJD(p.price)}</Text>
                      <Text style={styles.productStock}>المخزون: {p.stock}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.stopButton}
                  onPress={handleStop}
                  testID="stop-session-btn"
                >
                  <Ionicons name="stop-circle" size={22} color="#FFF" />
                  <Text style={styles.stopText}>إنهاء الجلسة والدفع</Text>
                </TouchableOpacity>
                <View style={{ height: 40 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
  testID,
}: {
  icon: any;
  label: string;
  value: string;
  accent: string;
  testID?: string;
}) {
  return (
    <View style={styles.statCard} testID={testID}>
      <View style={[styles.statIcon, { backgroundColor: `${accent}22` }]}>
        <Ionicons name={icon} size={20} color={accent} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16, paddingBottom: 40 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerTitle: { color: COLORS.text, fontSize: 24, fontWeight: "900" },
  headerSub: { color: COLORS.textMuted, fontSize: 13, marginTop: 2 },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16,185,129,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  liveText: { color: COLORS.success, fontWeight: "700", fontSize: 12 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statValue: { color: COLORS.text, fontSize: 18, fontWeight: "900" },
  statLabel: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 20,
    marginBottom: 12,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  roomCard: {
    width: "48%",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 150,
  },
  roomCardActive: {
    borderColor: COLORS.borderActive,
    backgroundColor: "#0A1418",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  roomTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roomName: { color: COLORS.text, fontSize: 16, fontWeight: "800" },
  roomPrice: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  statusActive: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,240,255,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  statusActiveText: { color: COLORS.primary, fontSize: 10, fontWeight: "700" },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  statusIdle: {
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusIdleText: { color: COLORS.textDim, fontSize: 10, fontWeight: "700" },
  timer: {
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 12,
    fontVariant: ["tabular-nums"],
    writingDirection: "ltr",
    textAlign: "left",
  },
  roomCost: { color: COLORS.text, fontSize: 15, fontWeight: "700", marginTop: 4 },
  idlePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingVertical: 8,
  },
  idleHint: { color: COLORS.textDim, fontSize: 11, marginTop: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: "90%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { color: COLORS.text, fontSize: 22, fontWeight: "900" },
  modalSub: { color: COLORS.textMuted, fontSize: 13, marginTop: 2 },
  timerBox: {
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.borderActive,
    alignItems: "center",
  },
  timerLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: "700" },
  timerBig: {
    color: COLORS.primary,
    fontSize: 42,
    fontWeight: "900",
    marginTop: 8,
    fontVariant: ["tabular-nums"],
    writingDirection: "ltr",
  },
  costRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 16,
    gap: 8,
  },
  costItem: {
    flex: 1,
    backgroundColor: COLORS.surface2,
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  costTotal: { backgroundColor: "rgba(0,240,255,0.12)" },
  costLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: "700" },
  costValue: { color: COLORS.text, fontSize: 13, fontWeight: "800", marginTop: 4 },
  costValueTotal: { color: COLORS.primary, fontSize: 14, fontWeight: "900", marginTop: 4 },
  emptyText: { color: COLORS.textDim, textAlign: "center", padding: 16 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  itemName: { color: COLORS.text, fontSize: 14, fontWeight: "700" },
  itemMeta: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  itemSubtotal: { color: COLORS.primary, fontSize: 14, fontWeight: "800" },
  productGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  productMini: {
    width: "31%",
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  productEmoji: { fontSize: 28 },
  productName: { color: COLORS.text, fontSize: 12, fontWeight: "700", marginTop: 4 },
  productPrice: { color: COLORS.primary, fontSize: 12, fontWeight: "800", marginTop: 2 },
  productStock: { color: COLORS.textDim, fontSize: 9, marginTop: 2 },
  stopButton: {
    flexDirection: "row",
    backgroundColor: COLORS.danger,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    gap: 8,
  },
  stopText: { color: "#FFF", fontSize: 16, fontWeight: "900" },
});
