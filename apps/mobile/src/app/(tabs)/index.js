import { useMemo } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../../lib/session.js";
import { useRequest } from "../../lib/useRequest.js";
import { fetchReport } from "../../lib/api.js";
import { METRICS, METRIC_ORDER } from "../../lib/metrics.js";
import { formatNumber, formatPercent, formatRelative, periodRange } from "../../lib/format.js";
import { useOpenWeb } from "../../lib/web.js";
import { colors } from "../../lib/theme.js";
import { t } from "../../lib/i18n.js";
import { Card, Message, Screen, SourceLine, styles } from "../../components/ui.js";
import { SkeletonCard, SkeletonKpis } from "../../components/Skeleton.js";
import KpiTile, { KpiGrid, delta } from "../../components/KpiTile.js";
import InteractiveChart from "../../components/InteractiveChart.js";
import BarList from "../../components/BarList.js";
import ScopeBar from "../../components/ScopeBar.js";
import DomainGate from "../../components/DomainGate.js";

// Same names as the web's Acquisition page.
const CHANNEL_LABELS = { organic: "Organic Search", paid: "Paid", paid_social: "Paid Social", referral: "Referral", direct: "Direct" };

function metricChange(metric, cur, prev) {
    if (!cur || !prev) return null;
    return metric.rate
        ? delta({ kind: "rate", current: metric.total(cur), previous: metric.total(prev), base: metric.base(cur), previousBase: metric.base(prev) })
        : delta({ current: metric.total(cur), previous: metric.total(prev) });
}

export default function Home() {
    const openWeb = useOpenWeb();
    const { session, organisationId, domain, days } = useSession();
    const range = useMemo(() => periodRange(days), [days]);
    const report = useRequest(async ({ fresh }) => {
        const [current, previous] = await Promise.all([
            fetchReport(session, domain, range.from, range.to, { fresh }),
            fetchReport(session, domain, range.prevFrom, range.prevTo, { fresh }).catch(() => null),
        ]);
        return { current, previous };
    }, `${organisationId}|${domain}|${range.from}`, { enabled: !!domain });

    const cur = report.data?.current;
    const prev = report.data?.previous;
    const tot = cur?.totals;
    const events = METRICS.events;
    const points = useMemo(() => (cur?.daily || []).map((d) => ({ date: d.date, value: events.daily(d) })), [cur, events]);
    const previous = useMemo(() => (prev?.daily || []).map((d) => ({ value: events.daily(d) })), [prev, events]);

    const sources = useMemo(() => (cur?.channels || [])
        .filter((c) => c.sessions > 0)
        .sort((a, b) => b.sessions - a.sessions)
        .map((c) => ({ key: c.channel, label: t(CHANNEL_LABELS[c.channel] || c.channel), value: c.sessions, display: formatNumber(c.sessions) })), [cur]);
    const pages = useMemo(() => (cur?.topPages || []).slice(0, 6)
        .map((p) => ({ key: p.pathname, label: p.pathname || "/", value: p.views, display: formatNumber(p.views) })), [cur]);
    // Real conversions only (tier "lead"/"sale"), as on the web's Conversions
    // page and in the conversion rate — not auto-collected events.
    const conversions = useMemo(() => (cur?.conversions || [])
        .filter((c) => (c.tier === "lead" || c.tier === "sale") && c.count > 0)
        .sort((a, b) => b.count - a.count), [cur]);
    const conversionTotal = conversions.reduce((s, c) => s + c.count, 0);

    return (
        <Screen title={t("Home")} header={<ScopeBar />} refreshing={report.refreshing} onRefresh={domain ? report.refresh : undefined}>
            <DomainGate>
                {report.loading && !report.data ? (
                    <><SkeletonKpis /><SkeletonCard chart lines={1} /><SkeletonCard lines={4} /></>
                ) : report.error ? (
                    <Message tone="error" title={t("This section failed to load")} action={t("Try again")} onAction={report.retry} />
                ) : cur?.noSiteKey ? (
                    <Message title={t("Analytics isn't turned on for {domain} yet", { domain })}
                        body={t("Turn it on and add the tracker to your site — this page fills with data from the first visit.")}
                        action={t("Set up Analytics")} onAction={() => openWeb("/analytics/getting-started")} />
                ) : tot && cur.noData ? (
                    <Message title={t("No data yet for {domain}", { domain })} body={t("Data will appear here within a few minutes of the first visitor.")} />
                ) : tot ? (
                    <>
                        <KpiGrid>
                            {METRIC_ORDER.map((id) => {
                                const m = METRICS[id];
                                return (
                                    <KpiTile key={id} label={t(m.label)} value={m.format(m.total(tot))}
                                        change={metricChange(m, tot, prev?.totals)} onPress={() => router.push(`/metric/${id}`)} />
                                );
                            })}
                        </KpiGrid>

                        <Card title={t("Total events")}>
                            {points.length ? (
                                <InteractiveChart points={points} previous={previous} format={events.format}
                                    labels={{ current: t("This period"), previous: t("Previous period") }} />
                            ) : <Text style={styles.muted}>{t("No data for this period")}</Text>}
                        </Card>

                        {sources.length > 0 && (
                            <Card title={t("Traffic sources")}>
                                <BarList rows={sources} color={colors.data2} />
                            </Card>
                        )}

                        {pages.length > 0 && (
                            <Card title={t("Top pages")}>
                                <BarList rows={pages} mono />
                            </Card>
                        )}

                        <Card title={t("Conversions")}>
                            <View style={{ flexDirection: "row", gap: 24 }}>
                                <View>
                                    <Text style={styles.muted}>{t("Conversions")}</Text>
                                    <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: "700" }}>{formatNumber(conversionTotal)}</Text>
                                </View>
                                <View>
                                    <Text style={styles.muted}>{t("Conversion rate")}</Text>
                                    <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: "700" }}>{formatPercent(tot.conversionRate ?? 0)}</Text>
                                </View>
                            </View>
                            {conversions.length ? (
                                <BarList color={colors.data3} rows={conversions.slice(0, 5).map((c) => ({ key: c.name, label: c.label || c.name, value: c.count, display: formatNumber(c.count) }))} />
                            ) : (
                                <Text style={styles.muted}>{t("No conversions in this period.")}</Text>
                            )}
                        </Card>

                        <SourceLine parts={[
                            t("Analytics events from your site"),
                            t("Suspected bots excluded"),
                            report.fetchedAt ? t("Updated {time}", { time: formatRelative(report.fetchedAt) }) : null,
                        ]} />
                    </>
                ) : null}
            </DomainGate>
        </Screen>
    );
}
