import { useMemo } from "react";
import { Text } from "react-native";
import { useSession } from "../../lib/session.js";
import { useRequest } from "../../lib/useRequest.js";
import { fetchReport } from "../../lib/api.js";
import { formatNumber, formatPercent, formatRelative, periodRange } from "../../lib/format.js";
import { useOpenWeb } from "../../lib/web.js";
import { t } from "../../lib/i18n.js";
import { STATISTICS_CONSENT } from "../../../../../src/Functions/consentMetrics.js";
import { Card, Loading, Message, Screen, SourceLine, styles } from "../../components/ui.js";
import KpiTile, { KpiGrid, delta } from "../../components/KpiTile.js";
import TrendChart from "../../components/TrendChart.js";
import ScopeBar from "../../components/ScopeBar.js";
import DomainGate from "../../components/DomainGate.js";

export default function Home() {
    const openWeb = useOpenWeb();
    const { session, organisationId, domain, days } = useSession();
    const range = useMemo(() => periodRange(days), [days]);
    const report = useRequest(async () => {
        const [current, previous] = await Promise.all([
            fetchReport(session, domain, range.from, range.to),
            fetchReport(session, domain, range.prevFrom, range.prevTo).catch(() => null),
        ]);
        return { current, previous };
    }, `${organisationId}|${domain}|${range.from}`, { enabled: !!domain });

    const cur = report.data?.current;
    const prev = report.data?.previous?.totals;
    const tot = cur?.totals;
    const points = useMemo(() => (cur?.daily || []).map((d) => ({ date: d.date, value: (d.minimal || 0) + (d.full || 0) })), [cur]);

    return (
        <Screen title={t("Home")} header={<ScopeBar />} refreshing={report.refreshing} onRefresh={domain ? report.refresh : undefined}>
            <DomainGate>
                {report.loading && !report.data ? <Loading /> : report.error ? (
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
                            <KpiTile label={t("Active users")} value={formatNumber(tot.engagedUsers)}
                                change={delta({ current: tot.engagedUsers, previous: prev?.engagedUsers })} />
                            <KpiTile label={t("Total events")} value={formatNumber(tot.total)}
                                change={delta({ current: tot.total, previous: prev?.total })} />
                            <KpiTile label={t("Unique sessions")} value={formatNumber(tot.uniqueSessions)}
                                change={delta({ current: tot.uniqueSessions, previous: prev?.uniqueSessions })} />
                            <KpiTile label={t(STATISTICS_CONSENT.label)} value={formatPercent(tot.consentRate)}
                                change={delta({ kind: "rate", current: tot.consentRate, previous: prev?.consentRate, base: tot.total, previousBase: prev?.total })} />
                        </KpiGrid>
                        <Card title={t("Total events")}>
                            {points.length ? <TrendChart points={points} /> : <Text style={styles.muted}>{t("No data for this period")}</Text>}
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
