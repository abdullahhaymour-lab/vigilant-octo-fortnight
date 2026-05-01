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
  const [receipt, setReceipt] = useState<Session | null>(null);

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
    loadAll();
  }, [loadAll]);

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
      // Start session immediately
      try {
        await api.startSession(room.id);
        await loadAll();
      } catch (e: any) {
        Alert.alert("خطأ", e.message);
      }
    } else {
      // Open session details modal
      setSelectedRoom(room);
      setSelectedSession(sess);
    }
  };

  const handleStop = async () => {
    if (!selectedSession) return;
    try {
      const closed = await api.stopSession(selectedSession.id);
      setSelectedRoom(null);
      setSelectedSession(null);
      setReceipt(closed);
      await loadAll();
    } catch (e: any) {
      Alert.alert("خطأ", e.message);
    }
  };

  const printReceipt = () => {
    if (typeof window !== "undefined" && (window as any).print) {
      (window as any).print();
    } else {
      Alert.alert("الطباعة", "ميزة الطباعة متاحة على المتصفح فقط");
    }
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

  const adjustStartTime = async (minutesBack: number) => {
    if (!selectedSession) return;
    const newStart = new Date(
      new Date(selectedSession.started_at).getTime() - minutesBack * 60000
    ).toISOString();
    try {
      const updated = await api.updateSessionTimes(selectedSession.id, {
        started_at: newStart,
      });
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

                <Text style={styles.sectionTitle}>تعديل وقت البداية</Text>
                <Text style={styles.adjustHint}>ابدأت متأخراً؟ اضغط لإرجاع وقت البداية</Text>
                <View style={styles.adjustRow}>
                  {[5, 15, 30, 60].map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={styles.adjustBtn}
                      onPress={() => adjustStartTime(m)}
                      testID={`adjust-back-${m}`}
                    >
                      <Text style={styles.adjustText}>
                        - {m >= 60 ? "1 ساعة" : `${m} دقيقة`}
                      </Text>
                    </TouchableOpacity>
                  ))}
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

      {/* Receipt Modal */}
      <Modal
        visible={!!receipt}
        animationType="fade"
        transparent
        onRequestClose={() => setReceipt(null)}
      >
        <View style={styles.receiptOverlay}>
          <View style={styles.receiptCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.receiptHeader}>
                <Ionicons name="checkmark-circle" size={48} color={COLORS.success} />
                <Text style={styles.receiptTitle}>تم الدفع بنجاح</Text>
                <Text style={styles.receiptSub}>صالة البلايستيشن</Text>
              </View>

              <View style={styles.receiptDivider} />

              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>الغرفة</Text>
                <Text style={styles.receiptValue}>{receipt?.room_name}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>سعر الساعة</Text>
                <Text style={styles.receiptValue}>
                  {receipt ? formatJD(receipt.price_per_hour) : ""}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>وقت البداية</Text>
                <Text style={styles.receiptValueSmall}>
                  {receipt
                    ? new Date(receipt.started_at).toLocaleString("ar")
                    : ""}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>وقت النهاية</Text>
                <Text style={styles.receiptValueSmall}>
                  {receipt?.ended_at
                    ? new Date(receipt.ended_at).toLocaleString("ar")
                    : ""}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>المدة</Text>
                <Text style={styles.receiptValue}>
                  {receipt
                    ? `${Math.floor(receipt.elapsed_minutes / 60)} س ${receipt.elapsed_minutes % 60} د`
                    : ""}
                </Text>
              </View>

              <View style={styles.receiptDivider} />

              {receipt && receipt.items.length > 0 && (
                <>
                  <Text style={styles.receiptSection}>طلبات الكافتيريا</Text>
                  {receipt.items.map((it) => (
                    <View key={it.id} style={styles.receiptItemRow}>
                      <Text style={styles.receiptItemName}>
                        {it.product_name} × {it.quantity}
                      </Text>
                      <Text style={styles.receiptItemPrice}>
                        {formatJD(it.subtotal)}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.receiptDivider} />
                </>
              )}

              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>تكلفة اللعب</Text>
                <Text style={styles.receiptValue}>
                  {receipt ? formatJD(receipt.play_cost) : ""}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>تكلفة الكافتيريا</Text>
                <Text style={styles.receiptValue}>
                  {receipt ? formatJD(receipt.cafeteria_cost) : ""}
                </Text>
              </View>

              <View style={styles.receiptTotalBox}>
                <Text style={styles.receiptTotalLabel}>الإجمالي المستحق</Text>
                <Text style={styles.receiptTotalValue}>
                  {receipt ? formatJD(receipt.total_cost) : ""}
                </Text>
              </View>

              <Text style={styles.receiptThanks}>شكراً لزيارتكم 🎮</Text>
              <Text style={styles.receiptDate}>
                {new Date().toLocaleString("ar")}
              </Text>

              <View style={styles.receiptActions}>
                <TouchableOpacity
                  style={styles.receiptBtn}
                  onPress={printReceipt}
                  testID="print-receipt-btn"
                >
                  <Ionicons name="print" size={18} color={COLORS.text} />
                  <Text style={styles.receiptBtnText}>طباعة</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.receiptBtn, styles.receiptBtnPrimary]}
                  onPress={() => setReceipt(null)}
                  testID="close-receipt-btn"
                >
                  <Ionicons name="checkmark" size={18} color="#000" />
                  <Text style={[styles.receiptBtnText, { color: "#000" }]}>تم</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
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
  adjustHint: { color: COLORS.textDim, fontSize: 11, marginTop: -8, marginBottom: 10 },
  adjustRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  adjustBtn: {
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  adjustText: { color: COLORS.primary, fontSize: 12, fontWeight: "800" },
  receiptOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  receiptCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    maxHeight: "92%",
  },
  receiptHeader: { alignItems: "center", marginBottom: 16 },
  receiptTitle: { color: "#10B981", fontSize: 20, fontWeight: "900", marginTop: 8 },
  receiptSub: { color: "#71717A", fontSize: 13, marginTop: 4 },
  receiptDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 12,
    borderStyle: "dashed",
    borderWidth: 0.5,
    borderColor: "#E5E7EB",
  },
  receiptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  receiptLabel: { color: "#6B7280", fontSize: 13, fontWeight: "600" },
  receiptValue: { color: "#111827", fontSize: 14, fontWeight: "800" },
  receiptValueSmall: { color: "#111827", fontSize: 11, fontWeight: "600" },
  receiptSection: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 8,
    marginTop: 4,
  },
  receiptItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  receiptItemName: { color: "#374151", fontSize: 12 },
  receiptItemPrice: { color: "#111827", fontSize: 12, fontWeight: "700" },
  receiptTotalBox: {
    backgroundColor: "#F0F9FF",
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    borderWidth: 2,
    borderColor: "#10B981",
  },
  receiptTotalLabel: { color: "#065F46", fontSize: 13, fontWeight: "900" },
  receiptTotalValue: { color: "#065F46", fontSize: 22, fontWeight: "900" },
  receiptThanks: {
    color: "#374151",
    fontSize: 13,
    textAlign: "center",
    marginTop: 16,
    fontWeight: "700",
  },
  receiptDate: {
    color: "#9CA3AF",
    fontSize: 10,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  receiptActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  receiptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
    backgroundColor: "#F3F4F6",
  },
  receiptBtnPrimary: { backgroundColor: COLORS.primary },
  receiptBtnText: { color: "#374151", fontSize: 13, fontWeight: "900" },
});
