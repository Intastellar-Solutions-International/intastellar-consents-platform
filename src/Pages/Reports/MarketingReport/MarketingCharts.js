import Pie from "../../../Components/Charts/Pie";
import BarChart from "../../../Components/Charts/BarChart";
import Line from "../../../Components/Charts/Line";
import { ymdLocal } from "../../../Components/Filter/filterDatePresets.js";

const { useMemo } = React;

/*
 * Visuals for the marketing dashboard. Two entry points:
 *
 *  - <MarketingOverviewCharts/>  renders on the channel-overview view
 *    (no selectedChannel). Shows a donut of the global cookie-choice mix
 *    and a horizontal bar of consents per channel.
 *
 *  - <MarketingChannelCharts/>   renders when a channel is open. Shows
 *    five small charts answering: where volume lives, how users behave on
 *    the banner, which campaigns over/under-perform on acceptance, and
 *    where (geography / landing paths) the channel traffic comes from.
 *
 * Charts are deliberately computed from already-fetched, already-filtered
 * data the parent page holds. No extra API calls — this is a
 * presentational layer on top of `marketingAttribution` rows.
 */

const CHOICE_MIX_FILLS = {
    "Accept all": "#9bca8b",
    "Essential only": "#d88b8b",
    Granular: "#C09F53",
};

function truncateLabel(str, maxLen = 40) {
    const s = String(str ?? "").trim() || "—";
    if (s.length <= maxLen) return s;
    return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}

function sumChoice(rows) {
    let acceptAll = 0;
    let essentialOnly = 0;
    let granular = 0;
    for (const r of rows ?? []) {
        acceptAll += Number(r.acceptAll) || 0;
        essentialOnly += Number(r.essentialOnly) || 0;
        granular += Number(r.granular) || 0;
    }
    return { acceptAll, essentialOnly, granular };
}

function choiceMixPieData(rows) {
    const { acceptAll, essentialOnly, granular } = sumChoice(rows);
    const total = acceptAll + essentialOnly + granular;
    if (total <= 0) return null;
    /*
     * AnyChart honours per-slice `fill` when the dataset uses name/value
     * objects. Pinning colours to semantics (green = accept-all, red =
     * essential-only, gold = granular) keeps the donut readable at a
     * glance across tenants.
     */
    return [
        { name: "Accept all", value: acceptAll, fill: CHOICE_MIX_FILLS["Accept all"] },
        { name: "Essential only", value: essentialOnly, fill: CHOICE_MIX_FILLS["Essential only"] },
        { name: "Granular", value: granular, fill: CHOICE_MIX_FILLS.Granular },
    ].filter((d) => d.value > 0);
}

function topCampaignsBarData(rows, limit = 10) {
    const list = [...(rows ?? [])]
        .filter((r) => (Number(r.consents) || 0) > 0)
        .sort((a, b) => (Number(b.consents) || 0) - (Number(a.consents) || 0))
        .slice(0, limit);
    if (list.length === 0) return null;
    return list.map((r) => ({
        x: truncateLabel(r.utmCampaign, 36),
        value: Number(r.consents) || 0,
    }));
}

function acceptancePctBarData(rows, drillConsents, limit = 10) {
    /*
     * Only plot campaigns with enough volume to give a meaningful rate.
     * The same floor the Highlights section uses (5% of channel, min 5)
     * keeps the two views consistent — if Highlights talks about a
     * campaign, it'll show up here too.
     */
    const minC = Math.max(5, Math.floor((Number(drillConsents) || 0) * 0.05));
    const list = (rows ?? [])
        .filter(
            (r) =>
                (Number(r.consents) || 0) >= minC &&
                r.acceptPct != null &&
                Number.isFinite(r.acceptPct)
        )
        .sort((a, b) => b.acceptPct - a.acceptPct)
        .slice(0, limit);
    if (list.length === 0) return null;
    return list.map((r) => ({
        x: truncateLabel(r.utmCampaign, 36),
        value: Math.round(r.acceptPct * 10) / 10,
    }));
}

function contextBarData(mergedList, limit = 8) {
    if (!Array.isArray(mergedList) || mergedList.length === 0) return null;
    return mergedList
        .slice(0, limit)
        .map((r) => ({ x: truncateLabel(r.id, 36), value: Number(r.consents) || 0 }))
        .filter((d) => d.value > 0);
}

function channelsBarData(channelOverview, limit = 10) {
    if (!Array.isArray(channelOverview) || channelOverview.length === 0) return null;
    return [...channelOverview]
        .sort((a, b) => (Number(b.consents) || 0) - (Number(a.consents) || 0))
        .slice(0, limit)
        .map((c) => ({ x: truncateLabel(c.channel, 36), value: Number(c.consents) || 0 }))
        .filter((d) => d.value > 0);
}

function EmptyNote({ children }) {
    return <p className="marketing-charts__empty">{children}</p>;
}

function ChartCard({ title, subtitle, children, wide = false }) {
    return (
        <section
            className={`marketing-charts__card${wide ? " marketing-charts__card--wide" : ""}`}
            aria-label={title}
        >
            <header className="marketing-charts__card-header">
                <h3 className="marketing-charts__card-title">{title}</h3>
                {subtitle ? <p className="marketing-charts__card-sub">{subtitle}</p> : null}
            </header>
            <div className="marketing-charts__card-body">{children}</div>
        </section>
    );
}

export function MarketingOverviewCharts({ channelOverview, rows }) {
    const mixData = useMemo(() => choiceMixPieData(rows), [rows]);
    const channelsData = useMemo(() => channelsBarData(channelOverview), [channelOverview]);

    if (!rows || rows.length === 0) return null;

    return (
        <section
            className="marketing-charts marketing-charts--overview"
            aria-labelledby="marketing-overview-charts-h"
        >
            <h2 id="marketing-overview-charts-h" className="marketing-report-section__title">
                At a glance — visual
            </h2>
            <p className="marketing-report-section__hint">
                Distribution of cookie choices across all attributed traffic, and where that volume
                concentrates by channel.
            </p>
            <div className="marketing-charts__grid marketing-charts__grid--two-up">
                <ChartCard
                    title="Cookie choice mix"
                    subtitle="Share of accept-all, essential-only, and granular choices across all channels."
                >
                    {mixData ? (
                        <Pie data={mixData} />
                    ) : (
                        <EmptyNote>No classified choice data in this window.</EmptyNote>
                    )}
                </ChartCard>
                <ChartCard
                    title="Consents by channel"
                    subtitle="Top channels by consent volume (up to 10)."
                >
                    {channelsData ? (
                        <BarChart data={channelsData} xTitle="Channel" yTitle="Consents" />
                    ) : (
                        <EmptyNote>No attributed channels yet.</EmptyNote>
                    )}
                </ChartCard>
            </div>
        </section>
    );
}

export function MarketingChannelCharts({
    channelName,
    drilldownRows,
    drillConsents,
    mergedContext,
}) {
    const mixData = useMemo(() => choiceMixPieData(drilldownRows), [drilldownRows]);
    const topCampaignsData = useMemo(
        () => topCampaignsBarData(drilldownRows),
        [drilldownRows]
    );
    const acceptancePctData = useMemo(
        () => acceptancePctBarData(drilldownRows, drillConsents),
        [drilldownRows, drillConsents]
    );
    const topCountriesData = useMemo(
        () => contextBarData(mergedContext?.topCountries),
        [mergedContext?.topCountries]
    );
    const topPathsData = useMemo(
        () => contextBarData(mergedContext?.topLandingPaths),
        [mergedContext?.topLandingPaths]
    );

    if (!channelName || !drilldownRows || drilldownRows.length === 0) return null;

    return (
        <section
            className="marketing-charts marketing-charts--channel"
            aria-labelledby="marketing-channel-charts-h"
        >
            <h2 id="marketing-channel-charts-h" className="marketing-report-section__title">
                {channelName} — visual
            </h2>
            <p className="marketing-report-section__hint">
                Volume distribution, banner behaviour, and campaign acceptance for this channel,
                plus geography and landing context merged from campaign-level slices.
            </p>
            <div className="marketing-charts__grid marketing-charts__grid--three-up">
                <ChartCard
                    title="Top campaigns by consents"
                    subtitle="Up to 10 campaigns with the highest consent volume."
                    wide
                >
                    {topCampaignsData ? (
                        <BarChart
                            data={topCampaignsData}
                            xTitle="Campaign"
                            yTitle="Consents"
                        />
                    ) : (
                        <EmptyNote>No campaigns with consent volume yet.</EmptyNote>
                    )}
                </ChartCard>
                <ChartCard
                    title="Cookie choice mix"
                    subtitle="How people decided on the banner for this channel."
                >
                    {mixData ? (
                        <Pie data={mixData} />
                    ) : (
                        <EmptyNote>No classified choice data for this channel.</EmptyNote>
                    )}
                </ChartCard>
                <ChartCard
                    title="Acceptance % by campaign"
                    subtitle="Campaigns with enough volume to compare (accept-all ÷ classified choices)."
                >
                    {acceptancePctData ? (
                        <BarChart
                            data={acceptancePctData}
                            xTitle="Campaign"
                            yTitle="Acceptance %"
                            tooltipFormat="{%Value}%"
                        />
                    ) : (
                        <EmptyNote>
                            Not enough per-campaign volume to compare acceptance yet.
                        </EmptyNote>
                    )}
                </ChartCard>
                <ChartCard
                    title="Top countries"
                    subtitle="Where consent events originated (merged from campaign-level slices)."
                >
                    {topCountriesData ? (
                        <BarChart
                            data={topCountriesData}
                            xTitle="Country"
                            yTitle="Consents"
                        />
                    ) : (
                        <EmptyNote>
                            No geography context returned for this channel yet.
                        </EmptyNote>
                    )}
                </ChartCard>
                <ChartCard
                    title="Top landing paths"
                    subtitle="Pages that received the most attributed consent events."
                >
                    {topPathsData ? (
                        <BarChart data={topPathsData} xTitle="Path" yTitle="Consents" />
                    ) : (
                        <EmptyNote>No landing-path context returned for this channel yet.</EmptyNote>
                    )}
                </ChartCard>
            </div>
        </section>
    );
}

/*
 * --- Time series --------------------------------------------------------
 *
 * The timeseries endpoint returns per-day rows grouped by
 * (utm_source, utm_medium, utm_campaign, referrer_host). The channel is
 * a client-side derivation of that tuple, so to show "consents per day
 * for this channel" we:
 *
 *   1. Match each timeseries row to the caller's rowKey set (same hash
 *      used by the table) so we only sum rows that belong to the channel.
 *   2. Aggregate by date.
 *   3. Reshape into the payload the existing <Line/> chart expects —
 *      `{name, num, previousPeriod: {num}}` keyed by x-axis label.
 *
 * When the compare series is aligned by position (not date), we pair the
 * i-th current-period day with the i-th baseline day so the Line chart
 * can overlay them. Date granularity is a day; if the baseline has fewer
 * or more days we pad / trim to the primary axis length.
 */

function normUtm(s) {
    return String(s ?? "")
        .trim()
        .toLowerCase();
}

function simplifyRawCampaign(s) {
    return String(s ?? "").trim();
}

function tsRowKey(row) {
    return [
        normUtm(row.utm_source ?? row.utmSource),
        normUtm(row.utm_medium ?? row.utmMedium),
        normUtm(simplifyRawCampaign(row.utm_campaign ?? row.utmCampaign)),
        normUtm(row.referrer_host ?? row.referrerHost ?? row.referrer),
    ].join("|");
}

function dailyConsentsForChannel(timeseriesRows, rowKeySet) {
    if (!Array.isArray(timeseriesRows) || timeseriesRows.length === 0) return [];
    const byDate = new Map();
    for (const r of timeseriesRows) {
        const k = tsRowKey(r);
        if (rowKeySet && !rowKeySet.has(k)) continue;
        const d = String(r.date ?? "").slice(0, 10);
        if (!d) continue;
        const cur = byDate.get(d) ?? 0;
        byDate.set(d, cur + (Number(r.consents) || 0));
    }
    return [...byDate.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([date, consents]) => ({ date, consents }));
}

function buildLineSeries(primaryDaily, baselineDaily) {
    if (primaryDaily.length === 0) return [];
    return primaryDaily.map((d, i) => {
        const cmp = baselineDaily[i];
        return {
            date: d.date,
            num: d.consents,
            previousPeriod:
                cmp != null
                    ? { date: cmp.date, num: Number(cmp.consents) || 0 }
                    : null,
        };
    });
}

export function MarketingTimeseriesChart({
    channelName,
    rowKeys,
    timeseriesRows,
    baselineTimeseriesRows,
    fromDate,
    toDate,
    compareEnabled,
    loading,
    errorMessage,
}) {
    const rowKeySet = useMemo(
        () => (Array.isArray(rowKeys) ? new Set(rowKeys) : null),
        [rowKeys]
    );

    const primaryDaily = useMemo(
        () => dailyConsentsForChannel(timeseriesRows, rowKeySet),
        [timeseriesRows, rowKeySet]
    );
    const baselineDaily = useMemo(
        () => (compareEnabled ? dailyConsentsForChannel(baselineTimeseriesRows, rowKeySet) : []),
        [baselineTimeseriesRows, rowKeySet, compareEnabled]
    );

    const lineData = useMemo(
        () => buildLineSeries(primaryDaily, compareEnabled ? baselineDaily : []),
        [primaryDaily, baselineDaily, compareEnabled]
    );

    const hasPoints = lineData.length > 0;
    const fromYmd = fromDate ? ymdLocal(fromDate) : "";
    const toYmd = toDate ? ymdLocal(toDate) : "";

    return (
        <section
            className="marketing-charts marketing-charts--timeseries"
            aria-labelledby="marketing-timeseries-h"
        >
            <h2 id="marketing-timeseries-h" className="marketing-report-section__title">
                {channelName ? `${channelName} — over time` : "Consents over time"}
            </h2>
            <p className="marketing-report-section__hint">
                Daily consent volume for this channel. When period comparison is on, the dashed
                line is the matching day in the baseline window.
            </p>
            <div className="marketing-charts__card marketing-charts__card--timeseries">
                <div className="marketing-charts__card-body marketing-charts__card-body--tall">
                    {loading ? (
                        <EmptyNote>Loading daily trend…</EmptyNote>
                    ) : errorMessage ? (
                        <EmptyNote>{errorMessage}</EmptyNote>
                    ) : !hasPoints ? (
                        <EmptyNote>
                            No daily consent data for this channel yet. Once the backend
                            <code> marketingAttributionTimeseries </code> endpoint is live, the
                            line will appear here — see <code>docs/marketingAttributionTimeseries.md</code>.
                        </EmptyNote>
                    ) : (
                        <Line
                            data={lineData}
                            title="Consents"
                            fromDate={fromYmd}
                            toDate={toYmd}
                            compareEnabled={compareEnabled}
                        />
                    )}
                </div>
            </div>
        </section>
    );
}

export default MarketingChannelCharts;
