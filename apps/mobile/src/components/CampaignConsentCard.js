// Campaign consent summary for one domain: how visitors from each channel
// answered the banner — accepted all (measurable) vs. not. Channels are
// grouped with the same code as the web page (campaignChannels.js).
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { extractRows, mapRow, buildChannelOverview } from "../../../../src/Pages/Reports/MarketingReport/campaignChannels.js";
import { useSession } from "../lib/session.js";
import { useRequest } from "../lib/useRequest.js";
import { fetchCampaignConsent } from "../lib/api.js";
import { formatNumber, formatPercent, periodRange } from "../lib/format.js";
import { useOpenWeb } from "../lib/web.js";
import { colors, radius, space, text } from "../lib/theme.js";
import { t } from "../lib/i18n.js";
import { Card, Message } from "./ui.js";
import { SkeletonCard } from "./Skeleton.js";

function ChoiceBar({ row }) {
    const parts = [
        { key: "all", n: row.acceptAll, color: colors.data },
        { key: "some", n: row.granular, color: colors.data2 },
        { key: "essential", n: row.essentialOnly, color: "rgba(173,173,173,0.45)" },
    ];
    const sum = parts.reduce((s, p) => s + p.n, 0);
    if (!sum) return null;
    return (
        <View style={styles.bar}>
            {parts.filter((p) => p.n > 0).map((p) => <View key={p.key} style={{ flex: p.n, backgroundColor: p.color }} />)}
        </View>
    );
}

export default function CampaignConsentCard() {
    const openWeb = useOpenWeb();
    const { session, organisationId, domain, days } = useSession();
    const range = useMemo(() => periodRange(days), [days]);
    const req = useRequest(
        async () => buildChannelOverview(extractRows(await fetchCampaignConsent(session, domain, range.from, range.to)).map(mapRow)),
        `${organisationId}|${domain}|${range.from}`,
        { enabled: !!domain },
    );

    if (req.loading && !req.data) return <SkeletonCard lines={4} />;
    if (req.error) return <Message tone="error" title={t("Campaign consent couldn't be loaded")} action={t("Try again")} onAction={req.retry} />;
    const channels = req.data || [];
    const decisions = channels.reduce((s, c) => s + c.consents, 0);
    const acceptAll = channels.reduce((s, c) => s + c.acceptAll, 0);

    return (
        <Card title={t("Campaign consent")}>
            {!channels.length ? (
                <Text style={styles.muted}>{t("No campaign traffic in this period")}</Text>
            ) : (
                <>
                    <View style={styles.totals}>
                        <View><Text style={styles.muted}>{t("Consent decisions")}</Text><Text style={styles.big}>{formatNumber(decisions)}</Text></View>
                        <View><Text style={styles.muted}>{t("Accepted all")}</Text><Text style={styles.big}>{formatPercent(decisions ? (acceptAll / decisions) * 100 : null)}</Text></View>
                        <View><Text style={styles.muted}>{t("Not measurable")}</Text><Text style={styles.big}>{formatNumber(decisions - acceptAll)}</Text></View>
                    </View>
                    {channels.slice(0, 5).map((c) => (
                        <View key={c.channel} accessible accessibilityLabel={`${c.channel}: ${formatNumber(c.consents)}, ${t("Accepted all")} ${formatPercent(c.acceptPct)}`}>
                            <View style={styles.head}>
                                <Text style={styles.channel} numberOfLines={1}>{c.channel}</Text>
                                <Text style={styles.value}>{formatNumber(c.consents)} · {formatPercent(c.acceptPct)}</Text>
                            </View>
                            <ChoiceBar row={c} />
                        </View>
                    ))}
                    <View style={styles.legend}>
                        {[["Accepted all", colors.data], ["Chose some", colors.data2], ["Essential only", "rgba(173,173,173,0.45)"]].map(([label, color]) => (
                            <View key={label} style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: color }]} /><Text style={styles.muted}>{t(label)}</Text></View>
                        ))}
                    </View>
                </>
            )}
            <Text style={styles.link} accessibilityRole="link" onPress={() => openWeb("/analytics/marketing")}>{t("Open Campaign consent")} →</Text>
        </Card>
    );
}

const styles = StyleSheet.create({
    muted: { color: colors.textMuted, fontSize: text.xs },
    totals: { flexDirection: "row", justifyContent: "space-between", gap: space[3] },
    big: { color: colors.textPrimary, fontSize: text.lg, fontWeight: "700", fontVariant: ["tabular-nums"] },
    head: { flexDirection: "row", justifyContent: "space-between", gap: space[3], marginBottom: 6 },
    channel: { flex: 1, color: colors.textPrimary, fontSize: text.sm },
    value: { color: colors.textSecondary, fontSize: text.sm, fontVariant: ["tabular-nums"] },
    bar: { flexDirection: "row", height: 8, borderRadius: radius.sm, overflow: "hidden", backgroundColor: colors.bgSunken, gap: 1 },
    legend: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    swatch: { width: 8, height: 8, borderRadius: 2 },
    link: { color: colors.accentStrong, fontSize: text.sm, fontWeight: "600" },
});
