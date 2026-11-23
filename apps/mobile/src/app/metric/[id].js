// One KPI in detail: the number, its change, and a chart you can scrub,
// with the previous period dashed for comparison.
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useSession } from "../../lib/session.js";
import { useRequest } from "../../lib/useRequest.js";
import { fetchReport } from "../../lib/api.js";
import { METRICS } from "../../lib/metrics.js";
import { formatRelative, periodRange } from "../../lib/format.js";
import { colors, space, text } from "../../lib/theme.js";
import { t } from "../../lib/i18n.js";
import { Card, Message, Screen, SourceLine } from "../../components/ui.js";
import { SkeletonCard } from "../../components/Skeleton.js";
import { delta } from "../../components/KpiTile.js";
import InteractiveChart from "../../components/InteractiveChart.js";
import ScopeBar from "../../components/ScopeBar.js";

function Change({ change }) {
    if (change?.lowData) return <Text style={styles.muted}>{t("Too little data")}</Text>;
    if (!change || !Number.isFinite(change.value)) return null;
    const up = change.value > 0, flat = change.value === 0;
    const good = flat ? null : (change.goodWhen === "down" ? !up : up);
    const color = flat ? colors.textMuted : good ? colors.success : colors.dangerText;
    return <Text style={[styles.change, { color }]}>{flat ? "" : up ? "▲ " : "▼ "}{change.label} <Text style={styles.muted}>{t("vs previous period")}</Text></Text>;
}

export default function MetricDetail() {
    const { id } = useLocalSearchParams();
    const metric = METRICS[id];
    const { session, organisationId, domain, days } = useSession();
    const range = useMemo(() => periodRange(days), [days]);
    const report = useRequest(async ({ fresh }) => {
        const [current, previous] = await Promise.all([
            fetchReport(session, domain, range.from, range.to, { fresh }),
            fetchReport(session, domain, range.prevFrom, range.prevTo, { fresh }).catch(() => null),
        ]);
        return { current, previous };
    }, `${organisationId}|${domain}|${range.from}|${id}`, { enabled: !!domain && !!metric });

    const cur = report.data?.current;
    const prev = report.data?.previous;
    const points = useMemo(() => (cur?.daily || []).map((d) => ({ date: d.date, value: metric.daily(d) })), [cur, metric]);
    const previous = useMemo(() => (prev?.daily || []).map((d) => ({ value: metric.daily(d) })), [prev, metric]);
    if (!metric) return null;

    const total = cur?.totals ? metric.total(cur.totals) : null;
    const prevTotal = prev?.totals ? metric.total(prev.totals) : null;
    const change = cur?.totals && prev?.totals
        ? delta(metric.rate
            ? { kind: "rate", current: total, previous: prevTotal, base: metric.base(cur.totals), previousBase: metric.base(prev.totals) }
            : { current: total, previous: prevTotal })
        : null;

    return (
        <Screen
            title={t(metric.label)}
            header={(
                <View>
                    <Pressable accessibilityRole="button" accessibilityLabel={t("Back")} hitSlop={12} onPress={() => router.back()} style={styles.back}>
                        <Feather name="chevron-left" size={20} color={colors.accentStrong} />
                        <Text style={styles.backText}>{t("Home")}</Text>
                    </Pressable>
                    <ScopeBar />
                </View>
            )}
            refreshing={report.refreshing}
            onRefresh={report.refresh}
        >
            {report.loading && !report.data ? <SkeletonCard chart lines={2} /> : report.error ? (
                <Message tone="error" title={t("This section failed to load")} action={t("Try again")} onAction={report.retry} />
            ) : cur?.totals ? (
                <>
                    <Card>
                        <Text style={styles.value}>{metric.format(total)}</Text>
                        <Change change={change} />
                        <InteractiveChart
                            points={points}
                            previous={previous}
                            format={metric.format}
                            maxValue={metric.max}
                            labels={{ current: t("This period"), previous: t("Previous period") }}
                        />
                    </Card>
                    <Card title={t("What this counts")}>
                        <Text style={styles.about}>{t(metric.about)}</Text>
                    </Card>
                    <SourceLine parts={[t("Analytics events from your site"), t("Suspected bots excluded"), report.fetchedAt ? t("Updated {time}", { time: formatRelative(report.fetchedAt) }) : null]} />
                </>
            ) : null}
        </Screen>
    );
}

const styles = StyleSheet.create({
    back: { flexDirection: "row", alignItems: "center", gap: 2, paddingTop: space[1] },
    backText: { color: colors.accentStrong, fontSize: text.base },
    value: { color: colors.textPrimary, fontSize: 40, fontWeight: "700", fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
    change: { fontSize: text.sm, fontVariant: ["tabular-nums"], marginBottom: space[2] },
    muted: { color: colors.textMuted, fontSize: text.sm },
    about: { color: colors.textSecondary, fontSize: text.sm, lineHeight: 20 },
});
