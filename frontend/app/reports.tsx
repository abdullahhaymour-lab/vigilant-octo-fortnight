import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import {
  api,
  COLORS,
  formatJD,
  type Report,
  type Session,
  type RoomReportItem,
} from "../src/api";

type Period = "today" | "week" | "month" | "year" | "all";
const LABELS: Record<Period, string> = {
  today: "اليوم",
  week: "الأسبوع",
  month: "الشهر",
  year: "السنة",
  all: "الكل",
};

type Tab = "summary" | "rooms" | "history";

function fmtForInput(iso: string): string {
  // ISO -> "YYYY-MM-DD HH:MM" in local time
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function inputToIso(s: string): string | null {
  // "YYYY-MM-DD HH:MM" -> ISO with local tz
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const dt = new Date(
    parseInt(y),
    parseInt(mo) - 1,
    parseInt(d),
    parseInt(h),
    parseInt(mi),
    0
  );
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

export default function Reports() {
  const [period, setPeriod] = useState<Period>("today");
  const [tab, setTab] = useState<Tab>("summary");
  const [report, setReport] = useState<Report | null>(null);
  const [roomsRep, setRoomsRep] = useState<RoomReportItem[]>([]);
  const [history, setHistory] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Session | null>(null);
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, rr, h] = await Promise.all([
        api.report(period),
        api.roomsReport(period),
        api.history(),
      ]);
      setReport(r);
      setRoomsRep(rr);
      setHistory(h);
    } catch (e: any) {
      console.log(e.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const playPct = report && report.total_revenue > 0 ? (report.play_revenue / report.total_revenue) * 100 : 0;
  const cafePct = report && report.total_revenue > 0 ? (report.cafeteria_revenue / report.total_revenue) * 100 : 0;

  const openEdit = (s: Session) => {
    setEditing(s);
    setStartInput(fmtForInput(s.started_at));
    setEndInput(s.ended_at ? fmtForInput(s.ended_at) : "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    const startIso = inputToIso(startInput);
    if (!startIso) {
      Alert.alert("خطأ", "صيغة وقت البداية غير صحيحة\nاستخدم: YYYY-MM-DD HH:MM");
      return;
    }
    const endIso = endInput ? inputToIso(endInput) : null;
    if (endInput && !endIso) {
      Alert.alert("خطأ", "صيغة وقت النهاية غير صحيحة");
      return;
    }
    try {
      await api.updateSessionTimes(editing.id, {
        started_at: startIso,
        ended_at: endIso || undefined,
      });
      setEditing(null);
      await load();
      Alert.alert("تم", "تم تحديث الأوقات وإعادة احتساب التكلفة");
    } catch (e: any) {
      Alert.alert("خطأ", e.message);
    }
  };

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m} د`;
    return `${h} س ${m} د`;
  };

  const sortedRooms = [...roomsRep].sort((a, b) => b.total_revenue - a.total_revenue);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>التقارير</Text>
        <Text style={styles.sub}>إيرادات وتفاصيل النشاط</Text>
      </View>

      {/* Period selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.periodRow}
      >
        {(["today", "week", "month", "year", "all"] as Period[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodBtn, period === p && styles.periodBtnActive]}
            onPress={() => setPeriod(p)}
            testID={`period-${p}`}
          >
            <Text
              style={[styles.periodText, period === p && { color: "#000" }]}
            >
              {LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Sub-tabs */}
      <View style={styles.tabRow}>
        {(["summary", "rooms", "history"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
            testID={`tab-${t}`}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "summary" ? "ملخص" : t === "rooms" ? "حسب الغرفة" : "السجل"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading || !report ? (
          <ActivityIndicator color={COLORS.primary} size="large" style={{ marginTop: 60 }} />
        ) : tab === "summary" ? (
          <>
            <View style={styles.bigCard}>
              <Text style={styles.bigLabel}>إجمالي الإيرادات - {LABELS[period]}</Text>
              <Text style={styles.bigValue} testID="total-revenue">{formatJD(report.total_revenue)}</Text>
              <View style={styles.bar}>
                <View style={[styles.barPlay, { flex: playPct || 0.01 }]} />
                <View style={[styles.barCafe, { flex: cafePct || 0.01 }]} />
              </View>
              <View style={styles.legendRow}>
                <View style={styles.legend}>
                  <View style={[styles.legendDot, { backgroundColor: COLORS.primary }]} />
                  <Text style={styles.legendText}>بلايستيشن {playPct.toFixed(0)}%</Text>
                </View>
                <View style={styles.legend}>
                  <View style={[styles.legendDot, { backgroundColor: COLORS.warning }]} />
                  <Text style={styles.legendText}>كافتيريا {cafePct.toFixed(0)}%</Text>
                </View>
              </View>
            </View>

            <View style={styles.dualRow}>
              <View style={[styles.dualCard, { borderColor: COLORS.primary + "55" }]}>
                <Ionicons name="game-controller" size={22} color={COLORS.primary} />
                <Text style={styles.dualLabel}>بلايستيشن</Text>
                <Text style={styles.dualValue}>{formatJD(report.play_revenue)}</Text>
                <Text style={styles.dualMeta}>{report.sessions_count} جلسة منتهية</Text>
              </View>
              <View style={[styles.dualCard, { borderColor: COLORS.warning + "55" }]}>
                <Ionicons name="fast-food" size={22} color={COLORS.warning} />
                <Text style={styles.dualLabel}>كافتيريا</Text>
                <Text style={styles.dualValue}>{formatJD(report.cafeteria_revenue)}</Text>
                <Text style={styles.dualMeta}>{report.cafeteria_sales_count} عملية بيع</Text>
              </View>
            </View>
          </>
        ) : tab === "rooms" ? (
          <>
            <Text style={styles.sectionTitle}>إيراد كل غرفة - {LABELS[period]}</Text>
            {sortedRooms.map((r, idx) => (
              <View key={r.room_id} style={styles.roomRow} testID={`room-report-${r.room_name}`}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <Text style={styles.roomRowName}>{r.room_name}</Text>
                  <Text style={styles.roomRowMeta}>
                    {r.sessions_count} جلسة • {formatDuration(r.total_minutes)}
                  </Text>
                  <Text style={styles.roomRowMeta}>
                    🎮 {formatJD(r.play_revenue)}  •  🍔 {formatJD(r.cafeteria_revenue)}
                  </Text>
                </View>
                <Text style={styles.roomRowTotal}>{formatJD(r.total_revenue)}</Text>
              </View>
            ))}
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>سجل الجلسات (اضغط للتعديل)</Text>
            {history.length === 0 ? (
              <Text style={styles.empty}>لا توجد جلسات منتهية بعد</Text>
            ) : (
              history.slice(0, 50).map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.histRow}
                  onPress={() => openEdit(s)}
                  testID={`history-row-${s.id}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.histRoom}>{s.room_name}</Text>
                    <Text style={styles.histMeta}>
                      {formatDuration(s.elapsed_minutes)} • {formatJD(s.play_cost)} لعب + {formatJD(s.cafeteria_cost)} كافتيريا
                    </Text>
                    <Text style={styles.histDate}>
                      {s.ended_at ? new Date(s.ended_at).toLocaleString("ar") : ""}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.histTotal}>{formatJD(s.total_cost)}</Text>
                    <Ionicons name="pencil" size={16} color={COLORS.textDim} style={{ marginTop: 4 }} />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Edit times modal */}
      <Modal visible={!!editing} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>تعديل أوقات الجلسة</Text>
                <Text style={styles.modalSub}>{editing?.room_name}</Text>
              </View>
              <TouchableOpacity onPress={() => setEditing(null)}>
                <Ionicons name="close-circle" size={28} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>وقت البداية</Text>
            <TextInput
              style={styles.input}
              value={startInput}
              onChangeText={setStartInput}
              placeholder="2026-02-15 14:30"
              placeholderTextColor={COLORS.textDim}
              testID="edit-start-input"
            />

            <Text style={styles.label}>وقت النهاية (اتركه فارغاً للجلسات النشطة)</Text>
            <TextInput
              style={styles.input}
              value={endInput}
              onChangeText={setEndInput}
              placeholder="2026-02-15 16:00"
              placeholderTextColor={COLORS.textDim}
              testID="edit-end-input"
            />

            <Text style={styles.hint}>
              💡 الصيغة: YYYY-MM-DD HH:MM{"\n"}سيتم إعادة حساب التكلفة تلقائياً
            </Text>

            <TouchableOpacity style={styles.saveBtn} onPress={saveEdit} testID="save-times-btn">
              <Text style={styles.saveText}>حفظ التعديلات</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: 16, paddingBottom: 8 },
  title: { color: COLORS.text, fontSize: 22, fontWeight: "900" },
  sub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  periodRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  periodBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginEnd: 8,
  },
  periodBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  periodText: { color: COLORS.text, fontSize: 13, fontWeight: "700" },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: { backgroundColor: "rgba(0,240,255,0.15)", borderColor: COLORS.primary },
  tabText: { color: COLORS.textMuted, fontSize: 12, fontWeight: "700" },
  tabTextActive: { color: COLORS.primary },
  scroll: { padding: 16, paddingTop: 8, paddingBottom: 40 },
  bigCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bigLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: "700" },
  bigValue: { color: COLORS.text, fontSize: 32, fontWeight: "900", marginTop: 6 },
  bar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    marginTop: 16,
    backgroundColor: COLORS.surface2,
  },
  barPlay: { backgroundColor: COLORS.primary },
  barCafe: { backgroundColor: COLORS.warning },
  legendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  legend: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: COLORS.textMuted, fontSize: 12, fontWeight: "700" },
  dualRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  dualCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  dualLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: "700", marginTop: 8 },
  dualValue: { color: COLORS.text, fontSize: 18, fontWeight: "900", marginTop: 4 },
  dualMeta: { color: COLORS.textDim, fontSize: 10, marginTop: 4 },
  sectionTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800", marginBottom: 10 },
  empty: { color: COLORS.textDim, textAlign: "center", padding: 20 },
  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(0,240,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { color: COLORS.primary, fontSize: 14, fontWeight: "900" },
  roomRowName: { color: COLORS.text, fontSize: 14, fontWeight: "800" },
  roomRowMeta: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  roomRowTotal: { color: COLORS.primary, fontSize: 15, fontWeight: "900" },
  histRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  histRoom: { color: COLORS.text, fontSize: 14, fontWeight: "800" },
  histMeta: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  histDate: { color: COLORS.textDim, fontSize: 10, marginTop: 2 },
  histTotal: { color: COLORS.primary, fontSize: 14, fontWeight: "900" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
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
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: "900" },
  modalSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
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
    fontSize: 14,
    textAlign: "left",
    writingDirection: "ltr",
    fontVariant: ["tabular-nums"],
  },
  hint: {
    color: COLORS.textDim,
    fontSize: 11,
    marginTop: 12,
    lineHeight: 18,
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
