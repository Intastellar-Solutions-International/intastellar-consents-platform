import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSession } from "../../lib/session.js";
import { useRequest } from "../../lib/useRequest.js";
import { fetchAdSpend } from "../../lib/api.js";
import { formatMoney, formatNumber, formatPercent, formatRelative, periodRange } from "../../lib/format.js";
import { useOpenWeb } from "../../lib/web.js";
import { colors, space, text } from "../../lib/theme.js";
import { t } from "../../lib/i18n.js";
import { Card, Message, Screen, SourceLine } from "../../components/ui.js";
import KpiTile, { KpiGrid, delta } from "../../components/KpiTile.js";
import ScopeBar from "../../components/ScopeBar.js";
import DomainGate from "../../components/DomainGate.js";
import CampaignConsentCard from "../../components/CampaignConsentCard.js";
import { SkeletonCard, SkeletonKpis } from "../../components/Skeleton.js";

const CURRENCY = "EUR";
const PLATFORM_LABELS = { google_ads: "Google Ads", meta_ads: "Meta Ads", linkedin_ads: "LinkedIn Ads", microsoft_ads: "Microsoft Ads" };

function totals(platforms) {
    return (platforms || []).reduce((s, p) => ({
        spend: s.spend + Number(p.amount || 0), clicks: s.clicks + Number(p.clicks || 0), impressions: s.impressions + Number(p.impressions || 0),
    }), { spend: 0, clicks: 0, impressions: 0 });
}

export default function AdSpend() {
    const openWeb = useOpenWeb();
    const { session, organisationId, domain, days } = useSession();
    const range = useMemo(() => periodRange(days), [days]);
    const report = useRequest(async () => {
        const [current, previous] = await Promise.all([
            fetchAdSpend(session, domain, range.from, range.to, CURRENCY),
            fetchAdSpend(session, domain, range.prevFrom, range.prevTo, CURRENCY).catch(() => null),
        ]);
        return { current, previous };
    }, `${organisationId}|${domain}|${range.from}`, { enabled: !!domain });

    const cur = report.data?.current;
    const now = totals(cur?.platforms);
    const before = report.data?.previous ? totals(report.data.previous.platforms) : null;
    const cpc = now.clicks > 0 ? now.spend / now.clicks : null;
    const prevCpc = before?.clicks > 0 ? before.spend / before.clicks : null;
    const ctr = now.impressions > 0 ? (now.clicks / now.impressions) * 100 : null;

    return (
        <Screen title={t("Ad Spend")} header={<ScopeBar />} refreshing={report.refreshing} onRefresh={domain ? report.refresh : undefined}>
            <DomainGate>
                {report.loading && !report.data ? <><SkeletonKpis /><SkeletonCard lines={3} /></> : report.error ? (
                    <Message tone="error" title={t("Could not load ad spend data.")} action={t("Try again")} onAction={report.retry} />
                ) : cur?.noConnections ? (
                    <Message title={t("No ad platforms connected for {domain}", { domain })}
                        body={t("Connect Google Ads, Meta Ads, LinkedIn Ads, or Microsoft Ads to see combined spend, blended CAC, and budget pacing alerts here.")}
                        action={t("Connect an ad account")} onAction={() => openWeb(`/settings/ad-connections?site=${encodeURIComponent(domain)}`)} />
                ) : cur ? (
                    <>
                        <KpiGrid>
                            <KpiTile label={t("Total spend")} value={formatMoney(now.spend, CURRENCY)}
                                change={before ? delta({ current: now.spend, previous: before.spend, goodWhen: "down" }) : null} />
                            <KpiTile label={t("Clicks")} value={formatNumber(now.clicks)}
                                change={before ? delta({ current: now.clicks, previous: before.clicks }) : null} />
                            <KpiTile label={t("Avg. cost per click")} value={cpc != null ? formatMoney(cpc, CURRENCY) : "—"}
                                change={prevCpc != null && cpc != null ? delta({ current: cpc, previous: prevCpc, goodWhen: "down" }) : null} />
                            <KpiTile label="CTR" value={formatPercent(ctr, 2)} hint={t("{count} impressions", { count: formatNumber(now.impressions) })} />
                        </KpiGrid>
                        <Card title={t("Platform comparison")}>
                            {(cur.platforms || []).length ? cur.platforms.map((p) => (
                                <View key={p.platform} style={styles.row}>
                                    <Text style={styles.name}>{PLATFORM_LABELS[p.platform] || p.platform}</Text>
                                    <Text style={styles.value}>{formatMoney(p.amount, p.currency || CURRENCY)}</Text>
                                    <Text style={styles.share}>{formatPercent(now.spend > 0 ? (p.amount / now.spend) * 100 : null, 0)}</Text>
                                </View>
                            )) : <Text style={styles.muted}>{t("No data for this period")}</Text>}
                        </Card>
                        <CampaignConsentCard />
                        <SourceLine parts={[
                            t("Amounts in {currency}, converted with ECB rates", { currency: CURRENCY }),
                            report.fetchedAt ? t("Updated {time}", { time: formatRelative(report.fetchedAt) }) : null,
                        ]} />
                    </>
                ) : null}
            </DomainGate>
        </Screen>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[1] },
    name: { flex: 1, color: colors.textPrimary, fontSize: text.sm },
    value: { color: colors.textPrimary, fontSize: text.sm, fontVariant: ["tabular-nums"] },
    share: { width: 44, textAlign: "right", color: colors.textMuted, fontSize: text.sm, fontVariant: ["tabular-nums"] },
    muted: { color: colors.textMuted, fontSize: text.sm },
});
