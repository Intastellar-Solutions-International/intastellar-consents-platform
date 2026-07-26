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
                    chartCard={true}
                    subtitle="Share of accept-all, essential-only, and granular choices across all channels."
                >
                    {mixData ? (
                        <Pie data={mixData} chartCard={true} />
                    ) : (
                        <EmptyNote>No classified choice data in this window.</EmptyNote>
                    )}
                </ChartCard>
                <ChartCard
                    title="Consents by channel"
                    subtitle="Top channels by consent volume (up to 10)."
                >
                    {channelsData ? (
                        <BarChart data={channelsData} xTitle="Channel" yTitle="Consents" chartCard={true} />
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
                            chartCard={true}
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
                        <Pie data={mixData} chartCard={true} />
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
                            chartCard={true}
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
                            chartCard={true}
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
                        <BarChart data={topPathsData} xTitle="Path" yTitle="Consents" chartCard={true} />
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
 * (utm_source, utm_medium, utm_campaign, referrer_host). The "channel"
 * is a client-side derivation of that tuple, so to show "consents per
 * day for this channel" we:
 *
 *   1. For each timeseries row, rebuild the same row shape the table's
 *      `deriveMarketingChannel(...)` expects and run it through that
 *      derivation. We match by the resulting channel name — not by a
 *      rowKey hash — because the aggregated `marketingAttribution`
 *      endpoint (a) hard-codes `referrerHost = "—"` and (b) collapses
 *      varying `utm_medium` values onto one bucket, so any rowKey we
 *      computed from a well-populated timeseries row would never match
 *      the table's rowKey. Channel derivation is the single source of
 *      truth for "what bucket does this row belong to".
 *   2. Aggregate by date.
 *   3. Reshape into the payload `<Line/>` expects —
 *      `{date, num, previousPeriod: {date, num}}`.
 *
 * When a comparison period is on, we pair the i-th current-period day
 * with the i-th baseline day so the Line chart can overlay them.
 */

function tsChannelRow(r) {
    /*
     * Normalise a raw timeseries row (snake_case or camelCase) into the
     * shape `deriveMarketingChannel` reads. `"—"` is the same "missing"
     * sentinel the aggregated endpoint returns, so derivation heuristics
     * see identical input regardless of which endpoint produced the row.
     */
    const utmSource = String(r.utm_source ?? r.utmSource ?? "—") || "—";
    const utmMedium = String(r.utm_medium ?? r.utmMedium ?? "—") || "—";
    const utmCampaign = String(r.utm_campaign ?? r.utmCampaign ?? "—") || "—";
    const referrer = String(
        r.referrer_host ?? r.referrerHost ?? r.referrer ?? "—"
    );
    return {
        utmSource,
        utmMedium,
        utmCampaign,
        referrer: referrer || "—",
    };
}

function dailyConsentsForChannel(timeseriesRows, selectedChannel, deriveChannel) {
    if (!Array.isArray(timeseriesRows) || timeseriesRows.length === 0) return [];
    if (!selectedChannel || typeof deriveChannel !== "function") return [];
    const byDate = new Map();
    for (const r of timeseriesRows) {
        const channel = deriveChannel(tsChannelRow(r));
        if (channel !== selectedChannel) continue;
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
    deriveChannel,
    timeseriesRows,
    baselineTimeseriesRows,
    fromDate,
    toDate,
    compareEnabled,
    loading,
    errorMessage,
}) {
    const primaryDaily = useMemo(
        () => dailyConsentsForChannel(timeseriesRows, channelName, deriveChannel),
        [timeseriesRows, channelName, deriveChannel]
    );
    const baselineDaily = useMemo(
        () =>
            compareEnabled
                ? dailyConsentsForChannel(baselineTimeseriesRows, channelName, deriveChannel)
                : [],
        [baselineTimeseriesRows, channelName, deriveChannel, compareEnabled]
    );

    const lineData = useMemo(
        () => buildLineSeries(primaryDaily, compareEnabled ? baselineDaily : []),
        [primaryDaily, baselineDaily, compareEnabled]
    );

    const hasPoints = lineData.length > 0;
    const endpointReturnedRows = Array.isArray(timeseriesRows) && timeseriesRows.length > 0;
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
                            {endpointReturnedRows
                                ? `The daily trend endpoint returned data for this window, but no rows classified into "${channelName}" under the current channel rules.`
                                : "No daily consent data for this window yet. Once the backend marketingAttributionTimeseries endpoint is live (see docs/marketingAttributionTimeseries.md), the line will appear here."}
                        </EmptyNote>
                    ) : (
                        <Line
                            data={lineData}
                            title="Consents"
                            fromDate={fromYmd}
                            toDate={toYmd}
                            compareEnabled={compareEnabled}
                            showInsights
                            showRangeControls
                        />
                    )}
                </div>
            </div>
        </section>
    );
}

/* ─── Ga4SessionsChart ───────────────────────────────────────────────────── */

function fmtInt(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return Math.round(x).toLocaleString("de-DE");
}

function fmtDuration(seconds) {
    const s = Math.round(Number(seconds) || 0);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60), r = s % 60;
    return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

/*
 * Maps GA4's sessionDefaultChannelGroup value to consent-platform channel names.
 * The match is intentionally broad — one GA4 group covers several possible channel
 * labels depending on how UTM tags were set up. Returns [] when no pattern applies
 * (e.g. "Referral", "Unassigned") so the cross-reference shows a genuine gap.
 */
function matchConsentChannels(ga4Group, channelOverview) {
    const matchers = {
        "Paid Search":    c => /(google ads|microsoft ads|bing)/i.test(c.channel),
        "Paid Shopping":  c => /(google ads|microsoft ads)/i.test(c.channel),
        "Cross-network":  c => /google ads/i.test(c.channel),
        "Organic Search": c => /organic search/i.test(c.channel),
        "Paid Social":    c => /ads/i.test(c.channel) && /(facebook|instagram|linkedin|tiktok|twitter|pinterest|meta)/i.test(c.channel),
        "Paid Video":     c => /tiktok ads/i.test(c.channel),
        "Organic Social": c => !/ads/i.test(c.channel) && /(facebook \(organic\)|^instagram$|^linkedin$|^tiktok$|twitter|^pinterest$)/i.test(c.channel),
        "Direct":         c => /^direct$/i.test(c.channel),
        "Email":          c => /email/i.test(c.channel),
        "Affiliates":     c => /affiliate/i.test(c.channel),
    };
    const fn = matchers[ga4Group];
    if (!fn) return [];
    return (channelOverview || []).filter(fn);
}

export function Ga4SessionsChart({ rows, platformBreakdown, summary, channelBreakdown, totalConsents, channelOverview, syncing }) {
    if (!rows || rows.length === 0) {
        if (!syncing) return null;
        return (
            <div className="ga4-card">
                <div className="ga4-card__header">
                    <span className="ga4-card__title">Google Analytics 4</span>
                    <span className="ga4-sessions-chart__syncing">loading…</span>
                </div>
            </div>
        );
    }

    const W = 620, H = 200;
    const PAD = { top: 20, right: 16, bottom: 40, left: 52 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const maxSessions = Math.max(...rows.map(r => Number(r.sessions) || 0), 1);
    const barW = Math.max(4, Math.min(28, (plotW / rows.length) * 0.7));
    const toX = i => PAD.left + ((i + 0.5) / rows.length) * plotW;
    const toY = v => PAD.top + plotH - (Math.max(0, v) / maxSessions) * plotH;

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxSessions * f));
    const xStep = Math.ceil(rows.length / 8);

    const totalSessions = platformBreakdown?.reduce((s, p) => s + p.sessions, 0) || 0;
    const ssPlatform = platformBreakdown?.find(p => p.platform === "(other)");
    const hasSsTracking = ssPlatform && ssPlatform.sessions > 0;
    const ssShare = hasSsTracking && totalSessions > 0
        ? Math.round((ssPlatform.sessions / totalSessions) * 100) : 0;

    // KPI values — prefer aggregate summary, fall back to summing daily rows
    const kpis = summary ? [
        { label: "Sessions",      value: fmtInt(summary.sessions) },
        { label: "Users",         value: fmtInt(summary.totalUsers) },
        { label: "New users",     value: fmtInt(summary.newUsers) },
        { label: "Page views",    value: fmtInt(summary.pageViews) },
        { label: "Engagement",    value: `${(summary.engagementRate * 100).toFixed(1)}%`,
          title: "Engaged sessions as a share of total sessions (GA4's replacement for bounce rate)." },
        { label: "Avg. session",  value: fmtDuration(summary.avgSessionDuration) },
    ] : null;

    return (
        <div className="ga4-card">
            <div className="ga4-card__header">
                <span className="ga4-card__title">Google Analytics 4</span>
                <div className="ga4-card__badges">
                    {hasSsTracking && (
                        <span className="ga4-ss-badge"
                              title={`${ssShare}% of sessions from server-side tracking (Measurement Protocol / sGTM)`}>
                            ⚡ Server-side · {ssShare}%
                        </span>
                    )}
                    {syncing && <span className="ga4-sessions-chart__syncing">syncing…</span>}
                </div>
            </div>

            {/* KPI strip */}
            {kpis && (
                <div className="ga4-kpi-strip">
                    {kpis.map(k => (
                        <div key={k.label} className="ga4-kpi" title={k.title || ""}>
                            <span className="ga4-kpi__value">{k.value}</span>
                            <span className="ga4-kpi__label">{k.label}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Daily sessions bar chart */}
            <div className="recon-chart-scroll">
                <svg viewBox={`0 0 ${W} ${H}`} className="marketing-reconciliation__trend-svg"
                     role="img" aria-label="GA4 daily sessions bar chart">
                    {yTicks.map(v => (
                        <g key={v}>
                            <line x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)}
                                  stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                            <text x={PAD.left - 6} y={toY(v) + 4} textAnchor="end"
                                  fontSize="9" fill="rgba(160,175,200,0.5)">
                                {v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : v}
                            </text>
                        </g>
                    ))}
                    {rows.map((r, i) => {
                        const sessions = Number(r.sessions) || 0;
                        const top = toY(sessions);
                        const ht = PAD.top + plotH - top;
                        return (
                            <rect key={r.date} x={toX(i) - barW / 2} y={top}
                                  width={barW} height={Math.max(1, ht)}
                                  rx="2" fill="rgba(227,116,0,0.75)">
                                <title>{r.date}: {fmtInt(sessions)} sessions · {fmtInt(r.users || 0)} users · {fmtInt(r.pageViews || 0)} page views</title>
                            </rect>
                        );
                    })}
                    {rows.filter((_, i) => i % xStep === 0 || i === rows.length - 1).map(r => {
                        const i = rows.indexOf(r);
                        return (
                            <text key={r.date} x={toX(i)} y={H - PAD.bottom + 14}
                                  textAnchor="middle" fontSize="9" fill="rgba(160,175,200,0.55)">
                                {(r.date || "").slice(5)}
                            </text>
                        );
                    })}
                    <text x={PAD.left - 38} y={PAD.top + plotH / 2} textAnchor="middle"
                          fontSize="9" fill="rgba(150,165,190,0.5)"
                          transform={`rotate(-90,${PAD.left - 38},${PAD.top + plotH / 2})`}>
                        Sessions / day
                    </text>
                </svg>
            </div>

            {/* Platform / server-side tracking breakdown */}
            {platformBreakdown && platformBreakdown.length > 0 && (
                <div className="ga4-platform-breakdown">
                    <h4 className="ga4-platform-breakdown__title">Session source breakdown</h4>
                    <div className="ga4-platform-breakdown__rows">
                        {platformBreakdown.map(p => {
                            const share = totalSessions > 0 ? (p.sessions / totalSessions) * 100 : 0;
                            const isSs = p.platform === "(other)";
                            return (
                                <div key={p.platform} className={`ga4-pb-row${isSs ? " ga4-pb-row--ss" : ""}`}>
                                    <span className="ga4-pb-row__name">
                                        {isSs ? (
                                            <>{p.platform}<span className="ga4-pb-row__ss-hint"> — server-side / Measurement Protocol</span></>
                                        ) : p.platform}
                                    </span>
                                    <div className="ga4-pb-row__bar-wrap">
                                        <div className="ga4-pb-row__bar"
                                             style={{ width: `${Math.max(1, share)}%`, background: isSs ? "rgba(99,102,241,0.7)" : "rgba(227,116,0,0.6)" }} />
                                    </div>
                                    <span className="ga4-pb-row__share">{share.toFixed(1)}%</span>
                                    <span className="ga4-pb-row__count">{fmtInt(p.sessions)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Coverage & Blindspots ──────────────────────────────────────── */}
            {summary && summary.sessions > 0 && totalConsents != null && (() => {
                const ga4Sess = summary.sessions;
                const capturePct = Math.min(100, (totalConsents / ga4Sess) * 100);
                const darkZone = Math.max(0, ga4Sess - totalConsents);
                const captureStr = capturePct.toFixed(1) + "%";
                return (
                    <div className="ga4-coverage">
                        <div className="ga4-coverage__header">
                            <h4 className="ga4-coverage__title">Consent coverage</h4>
                            <span className="ga4-coverage__subtitle">GA4 sessions vs consent events in this period</span>
                        </div>

                        <div className="ga4-coverage__metrics">
                            <div className="ga4-coverage__metric">
                                <span className="ga4-coverage__metric-value">{captureStr}</span>
                                <span className="ga4-coverage__metric-label">capture rate</span>
                            </div>
                            <div className="ga4-coverage__metric ga4-coverage__metric--dark">
                                <span className="ga4-coverage__metric-value">{fmtInt(darkZone)}</span>
                                <span className="ga4-coverage__metric-label">session dark zone</span>
                            </div>
                            <div className="ga4-coverage__metric">
                                <span className="ga4-coverage__metric-value">{fmtInt(totalConsents)}</span>
                                <span className="ga4-coverage__metric-label">consent events</span>
                            </div>
                            <div className="ga4-coverage__metric">
                                <span className="ga4-coverage__metric-value">{fmtInt(ga4Sess)}</span>
                                <span className="ga4-coverage__metric-label">GA4 sessions</span>
                            </div>
                        </div>

                        {/* Stacked bar */}
                        <div className="ga4-coverage__bar-track" title={`${captureStr} of sessions generated a consent event`}>
                            <div className="ga4-coverage__bar-fill" style={{ width: `${capturePct}%` }} />
                        </div>
                        <div className="ga4-coverage__bar-legend">
                            <span className="ga4-coverage__legend-consent">Consent events ({fmtInt(totalConsents)})</span>
                            <span className="ga4-coverage__legend-dark">Dark zone ({fmtInt(darkZone)})</span>
                        </div>

                        <p className="ga4-coverage__note">
                            Dark zone = sessions that reached the site but generated no consent event.
                            Typical causes: returning visitors with an existing consent cookie, bounces before
                            the banner rendered, or bot traffic. A very large dark zone can also mean the CMP
                            is loading too late in the page lifecycle.
                        </p>
                    </div>
                );
            })()}

            {/* ── Channel cross-reference ────────────────────────────────────── */}
            {channelBreakdown && channelBreakdown.length > 0 && channelOverview && channelOverview.length > 0 && (() => {
                const ga4Total = channelBreakdown.reduce((s, g) => s + g.sessions, 0) || 1;
                return (
                    <div className="ga4-xref">
                        <div className="ga4-xref__header">
                            <h4 className="ga4-xref__title">GA4 channels vs consent attribution</h4>
                            <span className="ga4-xref__subtitle">
                                Approximate — GA4 channel groups and consent-platform UTM channels use different classification rules.
                            </span>
                        </div>
                        <div className="ga4-xref__scroll">
                            <table className="ga4-xref__table">
                                <thead>
                                    <tr>
                                        <th className="ga4-xref__th">GA4 channel group</th>
                                        <th className="ga4-xref__th ga4-xref__th--num">Sessions</th>
                                        <th className="ga4-xref__th ga4-xref__th--num">Share</th>
                                        <th className="ga4-xref__th">Matched consent channels</th>
                                        <th className="ga4-xref__th ga4-xref__th--num">Consents</th>
                                        <th className="ga4-xref__th ga4-xref__th--num">Coverage</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {channelBreakdown.map(g => {
                                        const matched = matchConsentChannels(g.channelGroup, channelOverview);
                                        const consentSum = matched.reduce((s, c) => s + c.consents, 0);
                                        const covPct = g.sessions > 0 && matched.length > 0
                                            ? (consentSum / g.sessions) * 100 : null;
                                        const sessionShare = (g.sessions / ga4Total) * 100;
                                        const isBlindspot = g.channelGroup === "Unassigned" ||
                                            (g.sessions > 50 && matched.length === 0) ||
                                            (covPct !== null && covPct < 5);
                                        return (
                                            <tr key={g.channelGroup} className={isBlindspot ? "ga4-xref__row--blind" : ""}>
                                                <td className="ga4-xref__td">
                                                    {isBlindspot && (
                                                        <span className="ga4-xref__blind-badge" title="Low or no consent attribution for this GA4 channel — potential tracking gap">
                                                            blind spot
                                                        </span>
                                                    )}
                                                    {g.channelGroup}
                                                </td>
                                                <td className="ga4-xref__td ga4-xref__td--num">{fmtInt(g.sessions)}</td>
                                                <td className="ga4-xref__td ga4-xref__td--num">{sessionShare.toFixed(1)}%</td>
                                                <td className="ga4-xref__td ga4-xref__td--channels">
                                                    {matched.length > 0
                                                        ? matched.map(c => c.channel).join(", ")
                                                        : <span className="ga4-xref__no-match">no match</span>}
                                                </td>
                                                <td className="ga4-xref__td ga4-xref__td--num">
                                                    {matched.length > 0 ? fmtInt(consentSum) : "—"}
                                                </td>
                                                <td className="ga4-xref__td ga4-xref__td--num">
                                                    {covPct !== null
                                                        ? <span className={covPct < 10 ? "ga4-xref__cov--low" : covPct > 50 ? "ga4-xref__cov--high" : "ga4-xref__cov--mid"}>
                                                            {covPct.toFixed(1)}%
                                                          </span>
                                                        : "—"}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className="ga4-xref__note">
                            Coverage = consent events / GA4 sessions for matched channels. Below 10% is flagged as a
                            potential blindspot. "Unassigned" traffic has no UTM tags and is invisible to both GA4
                            channel grouping and consent attribution — these are true dark sessions.
                        </p>
                    </div>
                );
            })()}
        </div>
    );
}

export default MarketingChannelCharts;
