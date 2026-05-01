import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api, COLORS, formatJD, type Report, type Session } from "../src/api";

type Period = "today" | "week" | "month" | "all";
const LABELS: Record<Period, string> = {
  today: "اليوم",
  week: "الأسبوع",
  month: "الشهر",
  all: "الكل",
};

export default function Reports() {
  const [period, setPeriod] = useState<Period>("today");
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, h] = await Promise.all([api.report(period), api.history()]);
      setReport(r);
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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>التقارير</Text>
        <Text style={styles.sub}>إيرادات ونشاط المحل</Text>
      </View>

      <View style={styles.periodRow}>
        {(["today", "week", "month", "all"] as Period[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodBtn, period === p && styles.periodBtnActive]}
            onPress={() => setPeriod(p)}
            testID={`period-${p}`}
          >
            <Text
              style={[
                styles.periodText,
                period === p && { color: "#000" },
              ]}
            >
              {LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading || !report ? (
          <ActivityIndicator color={COLORS.primary} size="large" style={{ marginTop: 60 }} />
        ) : (
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

            <Text style={styles.sectionTitle}>آخر الجلسات المنتهية</Text>
            {history.length === 0 ? (
              <Text style={styles.empty}>لا توجد جلسات منتهية بعد</Text>
            ) : (
              history.slice(0, 30).map((s) => (
                <View key={s.id} style={styles.histRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.histRoom}>{s.room_name}</Text>
                    <Text style={styles.histMeta}>
                      {s.elapsed_minutes} دقيقة • {formatJD(s.play_cost)} لعب + {formatJD(s.cafeteria_cost)} كافتيريا
                    </Text>
                    <Text style={styles.histDate}>
                      {s.ended_at ? new Date(s.ended_at).toLocaleString("ar") : ""}
                    </Text>
                  </View>
                  <Text style={styles.histTotal}>{formatJD(s.total_cost)}</Text>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: 16, paddingBottom: 8 },
  title: { color: COLORS.text, fontSize: 22, fontWeight: "900" },
  sub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  periodRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  periodBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  periodBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  periodText: { color: COLORS.text, fontSize: 13, fontWeight: "700" },
  scroll: { padding: 16, paddingTop: 0, paddingBottom: 40 },
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
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: "800", marginTop: 22, marginBottom: 10 },
  empty: { color: COLORS.textDim, textAlign: "center", padding: 20 },
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
});
