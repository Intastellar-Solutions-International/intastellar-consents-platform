const { useState, useEffect, useMemo, useCallback } = React;
const Link = window.ReactRouterDOM.Link;
import {
    analyticsAudiencePath, analyticsAcquisitionPath, analyticsSettingsPath, analyticsLivePath,
    analyticsConsentPath, analyticsConversionsPath, analyticsFormsPath, analyticsHeatmapPath,
    analyticsGettingStartedPath,
} from "../../Functions/domainPathSegments.js";
import { analyticsSnippet } from "../../Functions/installSnippet.js";
import SetupProgressCard from "../Onboarding/SetupProgressCard.js";
import DataSource from "../../Components/DataSource/index.js";
import { useExcludeBots } from "../../Functions/botFilter.js";
import { ScannerHost } from "../../API/host.js";
import { AnnotationStrip, ExportMenu, HERO_CHART, useAnnotations } from "./DataTools.js";
import { HistoryNote, HistoryTables } from "./HistoryImport.js";
import { ChangeExplainer } from "./ChangeExplainer.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { buildInsights, InsightsSection, SnapshotRow, TopFindings, TOP_FINDINGS, periodLabel } from "./OverviewInsights.js";
import {
    authHeaders, useAnalyticsPage, useAnalyticsReport, useSiteConfig,
    toIsoDate, pctChange, IndustryBenchmarkNote, formatPercent, SegmentFilter, useDimensions,
    useCompareRange, usePrevRange, useLiveData,
    useForeignDomains, splitForeignDomainsByRecency,
    formatCurrency, CURRENCY_SYMBOLS, formatCount,
    LiveActivityBars, LiveBotNote,
} from "./_shared.js";
import { SkeletonBlock, PanelSkeleton } from "./components/Skeleton.js";
import MetricTabStrip from "./components/MetricTabStrip.js";
import EmptyState from "./components/EmptyState.js";
import {
    IconBarChart, IconUsers, IconShieldCheck, IconGlobe, IconTrendingUp,
    IconRadio, IconTarget, IconCash,
    IconScrollDepth, IconFunnel,
} from "./Icons.js";
import "./Analytics.css";
import { STATISTICS_CONSENT } from "../../Functions/consentMetrics.js";
import { appLocale } from "../../Functions/format.js";
import { isLowDataCount, isLowDataRate, MIN_BASE } from "../../Functions/smallSample.js";
import { niceTicks } from "./TrendLineChart.js";
import { t, tx } from "../../i18n/index.js";

// docs/design-audit-plan.md Phase 4: redesigned to match the simpler GA4
// "Active users in last 30 minutes" reference instead of the previous
// everything-in-one-sidebar-panel version (2x2 KPI grid, recent-event feed,
// conversions list, cross-site hosts table) — that detail now lives on the
// dedicated Live View page (LiveView.js) this widget links to; the embedded
// widget is deliberately just the hero number, the per-minute sparkline, and
// a top-5 country table.
function LivePanel({ domain, siteKey }) {
    const { data, countdown } = useLiveData(domain, siteKey);
    const [open, setOpen] = useState(true);

    if (!domain || !data || data.noSiteKey) return null;

    // Ranked by events, not users: visitors without full consent have no
    // session_id, so their country would otherwise list as "0 users".
    const topCountries = (data.countries || [])
        .filter(c => c.events > 0)
        .sort((a, b) => b.events - a.events)
        .slice(0, 5);
    const maxCountryEvents = Math.max(...topCountries.map(c => c.events), 1);

    return (
        <div className="sa-live">
            <div className="sa-live__header" onClick={() => setOpen(o => !o)} role="button" aria-expanded={open}>
                <div className="sa-live__title">
                    <span className="sa-live__dot" />
                    <span className="sa-live__label">{t("Live")}</span>
                </div>
                <div className="sa-live__right">
                    <span className="sa-live__countdown">
                        {open ? `${countdown}s` : t("{count} active", { count: data.sessions.toLocaleString(appLocale()) })}
                    </span>
                    <button type="button" className="sa-live__toggle" aria-label={open ? t("Collapse") : t("Expand")}>
                        {open ? "▲" : "▼"}
                    </button>
                </div>
            </div>

            {open && (
                <div className="sa-live__body">
                    <div>
                        <p className="sa-live__hero-label">{t("Active users in last 30 minutes")}</p>
                        <p className="sa-live__hero-value">{data.sessions.toLocaleString(appLocale())}</p>
                        {data.minimal > 0 && (
                            <p className="sa-live__hero-sub">
                                {data.minimal === 1
                                    ? t("+ 1 event from visitors without full consent (not counted as users)")
                                    : t("+ {count} events from visitors without full consent (not counted as users)", { count: data.minimal.toLocaleString(appLocale()) })}
                            </p>
                        )}
                    </div>

                    <LiveActivityBars perMinute={data.perMinute} perMinuteUsers={data.perMinuteUsers} />
                    <LiveBotNote data={data} />

                    <div className="sa-live__divider" />

                    <div className="sa-live__countries">
                        <div className="sa-live__countries-hd">
                            <span>{t("Country")}</span>
                            <span>{t("Events")}</span>
                        </div>
                        {topCountries.length > 0 ? topCountries.map(c => (
                            <div key={c.code} className="sa-live__country-row"
                                title={t("{events} events · {users} active users", { events: c.events, users: c.activeUsers })}>
                                <span className="sa-live__country-code">{c.code}</span>
                                <div className="sa-live__country-bar-wrap">
                                    <div className="sa-live__country-bar" style={{ width: Math.max(4, Math.round((c.events / maxCountryEvents) * 100)) + "%" }} />
                                </div>
                                <span className="sa-live__country-value">{c.events.toLocaleString(appLocale())}</span>
                            </div>
                        )) : (
                            <p className="sa-live__countries-empty">{t("No visitors right now")}</p>
                        )}
                    </div>

                    {data.trackerMismatch && (
                        <p className="sa-live__mismatch">
                            {tx("Tracker is sending events under a different site key — the script tag on {domain} likely has a stale or wrong {attr} value. Check Analytics Settings → Script.", { domain: <strong>{domain}</strong>, attr: <code>data-site</code> })}
                        </p>
                    )}

                    <Link className="sa-live__view-all" to={analyticsLivePath(domain)}>
                        {t("View real time →")}
                    </Link>
                </div>
            )}
        </div>
    );
}


function CopyButton({ text }) {
    const [copied, setCopied] = useState(false);
    const copy = useCallback(() => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {});
    }, [text]);
    return (
        <button
            type="button"
            className={"sa-copy-btn" + (copied ? " sa-copy-btn--done" : "")}
            onClick={copy}
        >
            {copied ? t("Copied!") : t("Copy snippet")}
        </button>
    );
}

function smoothPath(pts) {
    if (!pts.length) return '';
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
        const x0 = pts[i - 1][0], y0 = pts[i - 1][1];
        const x1 = pts[i][0],     y1 = pts[i][1];
        const mx = (x0 + x1) / 2;
        d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
    }
    return d;
}

function AreaChart({ daily }) {
    const { W, H, PAD } = HERO_CHART;
    const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;

    if (!daily?.length) return <div className="sa-chart sa-chart--empty">{t("No data for this period")}</div>;

    // Shared tick rule (TrendLineChart's niceTicks, also used by the CMP's
    // ConsentTrend): round, evenly spaced, no repeated labels on small values.
    const yTicks = niceTicks(Math.max(...daily.map(d => d.minimal + d.full), 1));
    const maxVal = yTicks[yTicks.length - 1];
    const n = daily.length;
    const xOf = i => PAD.l + (n === 1 ? cW / 2 : (i / (n - 1)) * cW);
    const yOf = v => PAD.t + cH - (v / maxVal) * cH;
    const base = PAD.t + cH;

    const totalPts = daily.map((d, i) => [xOf(i), yOf(d.minimal + d.full)]);
    const fullPts  = daily.map((d, i) => [xOf(i), yOf(d.full)]);

    const totalArea = smoothPath(totalPts)
        + ` L${totalPts[n - 1][0]},${base} L${PAD.l},${base} Z`;
    const fullArea = smoothPath(fullPts)
        + ` L${fullPts[n - 1][0]},${base} L${PAD.l},${base} Z`;

    const fmtN = v => formatCount(v, { abbreviate: true });
    const labelIdxs = n <= 1 ? [0] :
        [0, Math.round(n / 4), Math.round(n / 2), Math.round((n * 3) / 4), n - 1]
        .filter((v, idx, a) => a.indexOf(v) === idx && v < n);

    return (
        <div className="sa-area-chart">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", display: "block" }}>
                <defs>
                    {/* CMP chart series (tokens.css): --c-data-2 = all visits,
                        --c-data = with consent. Colours via style: SVG
                        presentation attributes don't resolve var(). */}
                    <linearGradient id="sa-grad-total" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   style={{ stopColor: "rgb(var(--c-data-2) / 0.35)" }} />
                        <stop offset="100%" style={{ stopColor: "rgb(var(--c-data-2) / 0.02)" }} />
                    </linearGradient>
                    <linearGradient id="sa-grad-full" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   style={{ stopColor: "rgb(var(--c-data) / 0.55)" }} />
                        <stop offset="100%" style={{ stopColor: "rgb(var(--c-data) / 0.04)" }} />
                    </linearGradient>
                </defs>

                {yTicks.map((v, i) => {
                    const y = yOf(v);
                    return (
                        <g key={i}>
                            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                                stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                            <text x={PAD.l - 6} y={y + 4} textAnchor="end"
                                fontSize="13" style={{ fill: "var(--color-text-muted)" }}>
                                {fmtN(v)}
                            </text>
                        </g>
                    );
                })}

                <path d={totalArea} fill="url(#sa-grad-total)" />
                <path d={fullArea}  fill="url(#sa-grad-full)" />
                <path d={smoothPath(totalPts)} fill="none" style={{ stroke: "rgb(var(--c-data-2) / 0.8)" }} strokeWidth="1.5" />
                <path d={smoothPath(fullPts)}  fill="none" style={{ stroke: "rgb(var(--c-data))" }}  strokeWidth="1.5" />

                {labelIdxs.map(i => (
                    <text key={daily[i].date} x={xOf(i)} y={H - PAD.b + 18}
                        textAnchor="middle" fontSize="13" style={{ fill: "var(--color-text-muted)" }}>
                        {daily[i].date.slice(5)}
                    </text>
                ))}
            </svg>
            <div className="sa-chart__legend">
                <span className="sa-chart__legend-dot sa-chart__legend-dot--full" />
                <span>{t("With consent")}</span>
                <span className="sa-chart__legend-dot sa-chart__legend-dot--minimal" />
                <span>{t("No consent (minimal)")}</span>
            </div>
        </div>
    );
}

// Single-series version of AreaChart, for daily metrics that aren't a
// minimal/full consent-level split — Phase 4's hero chart pairing needs this
// for Active users, Unique sessions (counts), and Consent rate (a
// percentage, not a volume, hence the separate `yMax`/`formatValue`
// handling). Shares smoothPath()/the same W-H-PAD layout as AreaChart so
// switching hero tabs doesn't visibly jump the chart's proportions.
// One chart colour for every single-metric chart: CMP's --c-data ("chart
// marks that measure something" — not good/bad, so bounce isn't red).
const DATA_LINE = "rgb(var(--c-data))";
const DATA_FILL_FROM = "rgb(var(--c-data) / 0.45)";
const DATA_FILL_TO = "rgb(var(--c-data) / 0.02)";

function SingleValueChart({ daily, valueOf, color = DATA_LINE, fillFrom = DATA_FILL_FROM, fillTo = DATA_FILL_TO, formatValue, yMax, gradientId }) {
    const { W, H, PAD } = HERO_CHART;
    const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;

    if (!daily?.length) return <div className="sa-chart sa-chart--empty">{t("No data for this period")}</div>;

    const values = daily.map(valueOf);
    // Rates keep a fixed 0–yMax scale; counts use the shared niceTicks.
    const yTicks = yMax != null ? [0, 0.25, 0.5, 0.75, 1].map(f => yMax * f) : niceTicks(Math.max(...values, 1));
    const maxVal = yTicks[yTicks.length - 1];
    const n = daily.length;
    const xOf = i => PAD.l + (n === 1 ? cW / 2 : (i / (n - 1)) * cW);
    const yOf = v => PAD.t + cH - (v / maxVal) * cH;
    const base = PAD.t + cH;

    const pts = daily.map((d, i) => [xOf(i), yOf(valueOf(d))]);
    const area = smoothPath(pts) + ` L${pts[n - 1][0]},${base} L${PAD.l},${base} Z`;

    const fmt = formatValue || (v => formatCount(v, { abbreviate: true }));
    const labelIdxs = n <= 1 ? [0] :
        [0, Math.round(n / 4), Math.round(n / 2), Math.round((n * 3) / 4), n - 1]
        .filter((v, idx, a) => a.indexOf(v) === idx && v < n);

    return (
        <div className="sa-area-chart">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", display: "block" }}>
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   style={{ stopColor: fillFrom }} />
                        <stop offset="100%" style={{ stopColor: fillTo }} />
                    </linearGradient>
                </defs>

                {yTicks.map((v, i) => {
                    const y = yOf(v);
                    return (
                        <g key={i}>
                            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                                stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                            <text x={PAD.l - 6} y={y + 4} textAnchor="end"
                                fontSize="13" style={{ fill: "var(--color-text-muted)" }}>
                                {fmt(v)}
                            </text>
                        </g>
                    );
                })}

                <path d={area} fill={`url(#${gradientId})`} />
                <path d={smoothPath(pts)} fill="none" style={{ stroke: color }} strokeWidth="1.5" />

                {labelIdxs.map(i => (
                    <text key={daily[i].date} x={xOf(i)} y={H - PAD.b + 18}
                        textAnchor="middle" fontSize="13" style={{ fill: "var(--color-text-muted)" }}>
                        {daily[i].date.slice(5)}
                    </text>
                ))}
            </svg>
        </div>
    );
}

const BT_LABELS = {
    ecommerce:   "E-commerce",
    b2b:         "B2B / SaaS",
    media:       "Media & Content",
    local:       "Local Business",
    aviation:    "Aviation",
    tourism:     "Tourism & Travel",
    hospitality: "Hospitality",
    finance:     "Finance & Insurance",
    healthcare:  "Healthcare",
    education:   "Education",
    real_estate: "Real Estate",
    automotive:  "Automotive",
};

// Same definition as the Conversions tab and ReportBuilder/ReportView's
// "Conversions" metric (sum of per-event counts, not deduped by session —
// see data.totals.convertedSessions/conversionRate for the session-level
// view) — the canonical conversions count unified in
// docs/analytics-audit-plan.md item 5, now also surfaced here as an
// optional Overview KPI card (Phase 2).
/** Headline conversions: tier "lead" or "sale" only — not auto-collected events
 * (scroll depth, outbound clicks…, tier "micro") or registered CTA clicks
 * ("intent"). Same rule as ConversionsOverview and the conversion rate. */
export function totalConversions(conversions) {
    return (conversions || [])
        .filter((c) => c?.tier === "lead" || c?.tier === "sale")
        .reduce((s, c) => s + (c.count || 0), 0);
}

function fmtRevenue(amount, currency = "EUR") {
    const sym = CURRENCY_SYMBOLS[currency] ?? (currency + " ");
    if (amount >= 1_000_000) return sym + (amount / 1_000_000).toFixed(2) + "M";
    if (amount >= 1_000)     return sym + (amount / 1_000).toFixed(1) + "k";
    return formatCurrency(amount, currency);
}

const ALL_CARD_DEFS = [
    { id: "users",    label: "Active users",    desc: "Engaged sessions in the period" },
    { id: "bounce",   label: "Bounce rate",     desc: "Sessions with no engagement" },
    { id: "sessions", label: "Unique sessions", desc: "Consent-gated sessions" },
    { id: "events",   label: "Total events",    desc: "All recorded events" },
    { id: "consent",  label: STATISTICS_CONSENT.label, desc: STATISTICS_CONSENT.hint },
    { id: "countries",label: "Countries",       desc: "Distinct visitor countries" },
    { id: "leads",    label: "Quality leads",   desc: "Engaged sessions matching lead rules" },
    { id: "revenue",  label: "Revenue",         desc: "Ecommerce revenue events" },
    { id: "conversions",     label: "Conversions",      desc: "Registered conversion events (same definition as the Conversions tab)" },
    { id: "conversionRate",  label: "Conversion rate",  desc: "Sessions with at least one conversion" },
];

function CustomizePanel({ currentCards, defaultCards, onSave, onClose }) {
    const [draft, setDraft] = useState(currentCards || defaultCards);

    const toggle = (id) => setDraft(d =>
        d.includes(id) ? d.filter(x => x !== id) : [...d, id]
    );

    return (
        <div className="sa-customize-backdrop" onClick={onClose}>
            <div className="sa-customize-panel" onClick={e => e.stopPropagation()}>
                <div className="sa-customize-panel__head">
                    <span className="sa-customize-panel__title">{t("Customize cards")}</span>
                    <button className="sa-customize-panel__close" onClick={onClose} aria-label={t("Close")}>✕</button>
                </div>
                <p className="sa-customize-panel__sub">{t("Choose which KPI cards appear on the dashboard.")}</p>
                <div className="sa-customize-panel__list">
                    {ALL_CARD_DEFS.map(c => (
                        <label key={c.id} className={"sa-customize-panel__item" + (draft.includes(c.id) ? " sa-customize-panel__item--on" : "")}>
                            <input
                                type="checkbox"
                                className="sa-customize-panel__check"
                                checked={draft.includes(c.id)}
                                onChange={() => toggle(c.id)}
                            />
                            <span className="sa-customize-panel__item-label">{t(c.label)}</span>
                            <span className="sa-customize-panel__item-desc">{t(c.desc)}</span>
                        </label>
                    ))}
                </div>
                <div className="sa-customize-panel__actions">
                    <button className="sa-customize-panel__reset" onClick={() => { onSave(null); onClose(); }}>
                        {t("Reset to default")}
                    </button>
                    <button className="sa-customize-panel__apply" onClick={() => { onSave(draft); onClose(); }}>
                        {t("Apply")}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Top of the Overview: what stands out in the selected period. Leads with
// the highest-ranked insight (buildInsights — same rules and thresholds as
// the Insights row, which then only shows the rest) and lists the next two.
// When nothing crosses an insight threshold it falls back to a plain recap
// in sessions (not events, which mostly track page views), with the trend
// clause dropped when there's no previous-period baseline.
function buildOverviewHeadline({ data, prevData, insights, trendSessions }) {
    if (insights.length) {
        const [first, ...rest] = insights.slice(0, TOP_FINDINGS);
        return {
            lead: { text: first.title, tone: first.tone },
            sub: first.detail,
            bullets: rest.map(i => ({ text: i.title, tone: i.tone, to: i.to })),
            cta: { to: first.to, label: first.cta },
        };
    }

    const vars = {
        users: data.totals.engagedUsers.toLocaleString(appLocale()),
        sessions: data.totals.uniqueSessions.toLocaleString(appLocale()),
        change: formatPercent(Math.abs(trendSessions ?? 0)),
    };
    const hasTrend = trendSessions != null && Number.isFinite(trendSessions);
    const text = !hasTrend
        ? t("{users} active users across {sessions} sessions.", vars)
        : trendSessions >= 0
            ? t("{users} active users across {sessions} sessions, up {change} on the previous period.", vars)
            : t("{users} active users across {sessions} sessions, down {change} on the previous period.", vars);
    return {
        lead: { text },
        sub: prevData
            ? t("Nothing unusual compared with the previous period: traffic, sources, consent and conversions are all within normal range.")
            : t("Comparing with the previous period…"),
    };
}

// Per-business-type default KPI card ordering — the hero metric tabs take
// the first 4 ids (customizable via CustomizePanel). Pure function of data/siteConfig,
// no rendering.
function kpiDefaultOrder({ data, siteConfig }) {
    const bt         = siteConfig?.businessType || "";
    const hasRevenue = data.totals.revenue != null && data.totals.revenue > 0;
    const hasLeads   = data.totals.qualityLeads !== null;

    let defaultOrder;
    switch (bt) {
        case "ecommerce":
            defaultOrder = hasRevenue
                ? ["revenue", "users", "sessions", "consent", "countries"]
                : ["users", "sessions", "consent", "countries"];
            break;
        case "b2b":
            defaultOrder = hasLeads
                ? ["leads", "users", "events", "sessions", "consent"]
                : ["users", "events", "sessions", "consent", "countries"];
            break;
        case "media":
            defaultOrder = ["events", "sessions", "users", "consent", "countries"];
            break;
        case "local":
            defaultOrder = ["sessions", "users", "countries", "consent", "events"];
            break;
        case "aviation":
            defaultOrder = hasRevenue
                ? ["revenue", "users", "bounce", "countries", "sessions", "consent"]
                : ["countries", "users", "bounce", "sessions", "consent", "events"];
            break;
        case "tourism":
            defaultOrder = hasRevenue
                ? ["revenue", "users", "countries", "sessions", "consent"]
                : hasLeads
                    ? ["leads", "countries", "users", "sessions", "consent"]
                    : ["users", "countries", "sessions", "consent", "events"];
            break;
        case "hospitality":
            defaultOrder = hasRevenue
                ? ["revenue", "leads", "users", "sessions", "consent"]
                : hasLeads
                    ? ["leads", "users", "sessions", "consent", "countries"]
                    : ["users", "sessions", "consent", "countries", "events"];
            break;
        case "finance":
            defaultOrder = hasLeads
                ? ["leads", "consent", "users", "sessions", "events"]
                : ["consent", "users", "sessions", "events", "countries"];
            break;
        case "healthcare":
            defaultOrder = hasLeads
                ? ["leads", "consent", "users", "sessions", "bounce"]
                : ["consent", "users", "sessions", "bounce", "events"];
            break;
        case "education":
            defaultOrder = hasLeads
                ? ["leads", "events", "users", "countries", "consent"]
                : ["events", "users", "countries", "consent", "sessions"];
            break;
        case "real_estate":
            defaultOrder = hasLeads
                ? ["leads", "events", "users", "sessions", "consent"]
                : ["events", "users", "sessions", "consent", "countries"];
            break;
        case "automotive":
            defaultOrder = hasLeads
                ? ["leads", "users", "sessions", "consent", "countries"]
                : ["users", "sessions", "consent", "countries", "events"];
            break;
        default:
            defaultOrder = ["users", "events", "sessions", "consent", "countries"];
            if (hasLeads)   defaultOrder.push("leads");
            if (hasRevenue) defaultOrder.push("revenue");
    }

    // Active users, Bounce rate, and Consent rate are core engagement
    // metrics that belong together in the hero's first 4 tabs (heroIds =
    // kpiOrder.slice(0,4)) — always, regardless of which vertical-specific
    // metric a business type otherwise leads with. Forced to the front in
    // this fixed order; whatever was each vertical's own top pick (revenue,
    // leads, events, ...) becomes the 4th hero tab instead of the 1st.
    const CORE_HERO = ["users", "bounce", "consent"];
    defaultOrder = [...CORE_HERO, ...defaultOrder.filter(id => !CORE_HERO.includes(id))];
    return defaultOrder;
}

// Plain-data registry for every possible overview KPI card — label/value/
// trend/hasDaily, no JSX rendering. docs/design-audit-plan.md Phase 4: the
// hero composite (MetricTabStrip, pulling its 4 tabs from the first 4 ids of
// kpiDefaultOrder()/customCards) needs this same
// per-card data to build its tab labels/values/deltas, and needs `hasDaily`
// to know which metric actually has a day-by-day series to chart —
// api/analytics-report.js's `daily` field only covers event count today, so
// every other metric's hasDaily is false (not a fabricated series).
function buildKpiCardMeta({ data, siteConfig, trendEngaged, trendEvents, trendSessions, trendConsent, trendBounce }) {
    const bt         = siteConfig?.businessType || "";
    const consentPct = data.totals.consentRate;
    const currency   = data.totals.revenueCurrency || "EUR";
    const bounceRate = data.totals.uniqueSessions > 0
        ? ((data.totals.uniqueSessions - data.totals.engagedUsers) / data.totals.uniqueSessions) * 100
        : null;

    return {
        revenue: {
            icon: <IconCash />, label: t("Revenue"), value: fmtRevenue(data.totals.revenue, currency),
            sub: data.totals.transactions ? t("{count} transactions", { count: data.totals.transactions.toLocaleString(appLocale()) }) : t("ecommerce events"),
            variant: "revenue", hasDaily: false,
        },
        users: {
            icon: <IconRadio />, label: t("Active users"), value: data.totals.engagedUsers.toLocaleString(appLocale()),
            sub: t("engaged: 10s+, clicked, or 2+ pages"), variant: "live", trend: trendEngaged,
            // api/analytics-report.js's dailyEngagedRes — same engagement
            // criteria as the engagedUsers total, grouped by day (Phase 4).
            hasDaily: true,
            renderChart: (daily) => (
                <SingleValueChart daily={daily} valueOf={d => d.engaged}
                    gradientId="sa-grad-users" />
            ),
        },
        bounce: {
            icon: <IconScrollDepth />, label: t("Bounce rate"),
            value: bounceRate != null ? formatPercent(bounceRate) : "—",
            sub: t("sessions with no engagement"),
            variant: bounceRate != null && bounceRate > 60 ? "warn" : "blue",
            trend: trendBounce != null ? -trendBounce : undefined,
            // Same uniqueSessions/engaged columns the "users"/"sessions" tabs
            // already chart per day (api/analytics-report.js's daily series) —
            // just divided the same way the aggregate bounceRate above is.
            hasDaily: true,
            renderChart: (daily) => (
                <SingleValueChart daily={daily}
                    valueOf={d => d.uniqueSessions > 0 ? ((d.uniqueSessions - d.engaged) / d.uniqueSessions) * 100 : 0}
                    formatValue={v => formatPercent(v, 0)} yMax={100} gradientId="sa-grad-bounce" />
            ),
        },
        events: {
            icon: <IconBarChart />, label: bt === "media" ? t("Page views") : t("Total events"),
            value: data.totals.total.toLocaleString(appLocale()),
            sub: t("{minimal} minimal · {full} full", { minimal: data.totals.minimal.toLocaleString(appLocale()), full: data.totals.full.toLocaleString(appLocale()) }),
            trend: trendEvents, hasDaily: true,
            renderChart: (daily) => <AreaChart daily={daily} />,
        },
        sessions: {
            icon: <IconUsers />, label: t("Unique sessions"), value: data.totals.uniqueSessions.toLocaleString(appLocale()),
            sub: t("consent-gated sessions only"), trend: trendSessions,
            // dailyRes now carries unique_sessions per day alongside the
            // existing minimal/full columns — one extra column, same query.
            hasDaily: true,
            renderChart: (daily) => (
                <SingleValueChart daily={daily} valueOf={d => d.uniqueSessions}
                    gradientId="sa-grad-sessions" />
            ),
        },
        consent: {
            icon: <IconShieldCheck />, label: t(STATISTICS_CONSENT.label), value: formatPercent(consentPct),
            sub: t(STATISTICS_CONSENT.hint),
            variant: consentPct < 20 ? "warn" : "live", trend: trendConsent,
            // Derived client-side from daily.minimal/.full — no backend change
            // needed, same per-day event counts the "Total events" tab already
            // has, just divided differently (full / (minimal+full)).
            hasDaily: true,
            renderChart: (daily) => (
                <SingleValueChart daily={daily}
                    valueOf={d => (d.minimal + d.full) > 0 ? (d.full / (d.minimal + d.full)) * 100 : 0}
                    formatValue={v => formatPercent(v, 0)} yMax={100} gradientId="sa-grad-consent" />
            ),
            children: <IndustryBenchmarkNote benchmark={data.industryBenchmark} actualPct={consentPct} />,
        },
        countries: {
            icon: <IconGlobe />, label: t("Countries"), value: data.countries.length,
            sub: data.countries[0] ? t("Top: {country}", { country: data.countries[0].code }) : null, hasDaily: false,
        },
        leads: {
            icon: <IconTarget />, label: t("Quality leads"), value: (data.totals.qualityLeads ?? 0).toLocaleString(appLocale()),
            sub: t("engaged + page/event match"), variant: "live", hasDaily: false,
        },
        conversions: {
            icon: <IconFunnel />, label: t("Conversions"), value: totalConversions(data.conversions).toLocaleString(appLocale()),
            sub: t("purchase, lead, and other registered events"), variant: "live", hasDaily: false,
        },
        conversionRate: {
            icon: <IconTrendingUp />, label: t("Conversion rate"), value: formatPercent(data.totals.conversionRate ?? 0),
            sub: t("sessions with at least one conversion"), hasDaily: false,
        },
    };
}

function SetupCard({ domain, onKeyGenerated }) {
    const [siteKey,    setSiteKey]    = useState(null);
    const [loading,    setLoading]    = useState(true);
    const [generating, setGenerating] = useState(false);

    useEffect(() => {
        if (!domain) { setLoading(false); return; }
        fetch(`${ScannerHost}/api/analytics-site?domain=${encodeURIComponent(domain)}`, {
            headers: authHeaders(),
        }).then(async r => {
            if (r.ok) { const d = await r.json(); setSiteKey(d.id); }
        }).catch(() => {}).finally(() => setLoading(false));
    }, [domain]);

    const generate = async () => {
        setGenerating(true);
        const r = await fetch(`${ScannerHost}/api/analytics-site`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ domain }),
        }).catch(() => null);
        if (r?.ok) {
            const d = await r.json();
            setSiteKey(d.id);
            onKeyGenerated?.();
        }
        setGenerating(false);
    };

    const snippet = siteKey ? analyticsSnippet(siteKey) : null;

    return (
        <div className="sa-setup">
            <div className="sa-setup__icon"><IconRadio /></div>
            <h3 className="sa-setup__title">{tx("No data yet for {domain}", { domain: <strong>{domain}</strong> })}</h3>
            <p className="sa-setup__body">
                {tx("Embed the script below on every page of your site. The script reads the Intastellar consent cookie and only collects full analytics when the visitor accepts {category}. Minimal data (page path + consent choice) is always recorded.", { category: <em>statisticCookies</em> })}
            </p>
            <p className="sa-setup__body">
                {tx("Setting up a new site? {link} has one install code for the cookie banner and Analytics together.", { link: <Link className="sa-link" to={analyticsGettingStartedPath()}>{t("Get started")}</Link> })}
            </p>

            {loading && <p className="sa-setup__loading">{t("Loading…")}</p>}

            {!loading && !siteKey && (
                <button
                    type="button"
                    className="sa-setup__gen-btn"
                    onClick={generate}
                    disabled={generating}
                >
                    {generating ? t("Generating…") : t("Generate site key")}
                </button>
            )}

            {!loading && siteKey && (
                <div className="sa-setup__snippet-wrap">
                    <div className="sa-setup__snippet-header">
                        <span className="sa-setup__snippet-label">{t("Embed snippet")}</span>
                        <CopyButton text={snippet} />
                    </div>
                    <pre className="sa-setup__snippet">{snippet}</pre>
                    <p className="sa-setup__hint">
                        {tx("Paste into the {tag} of every page. Data will appear here within a few minutes of the first visitor.", { tag: <code>&lt;head&gt;</code> })}
                    </p>
                </div>
            )}
        </div>
    );
}

// ── Loading skeletons ──────────────────────────────────────────────────────────
// Shown while the fast /api/analytics-report call is in flight, shaped to match
// the real layout below (KPI strip, chart + live feed, geo row) so the page
// doesn't flash from blank to fully populated.

// SkeletonBlock/PanelSkeleton promoted to components/Skeleton.js (Phase 1
// of docs/design-audit-plan.md) — this page now only composes them into its
// own specific layout shape, same as before.
function OverviewSkeleton() {
    return (
        <div className="sa-overview">
            <div className="sa-overview-main">
                <div className="sa-chart-section">
                    <div className="sa-chart-section__hd">
                        <SkeletonBlock width={140} height={12} />
                        <SkeletonBlock width={70} height={10} />
                    </div>
                    <SkeletonBlock width="100%" height={220} />
                </div>
                <PanelSkeleton rows={5} />
            </div>

            <div className="sa-snapshot-row">
                {Array.from({ length: 3 }, (_, i) => <PanelSkeleton key={i} rows={5} />)}
            </div>

            <div className="sa-insights__grid">
                {Array.from({ length: 3 }, (_, i) => <PanelSkeleton key={i} rows={2} />)}
            </div>
        </div>
    );
}

// Imported Google Analytics 4 numbers for days before tracking began
// (HistoryImport.js) — a section of its own, never blended into our charts.
function HistoryPanel({ history }) {
    const daily = history.daily.map((d) => ({ date: d.date, sessions: Number(d.sessions || 0) }));
    return (
        <div className="sa-panel sa-history">
            <h3 className="sa-panel__title">
                <IconTrendingUp className="sa-icon" /> {t("Before Intastellar Analytics")}
            </h3>
            <HistoryNote history={history} />
            <div className="sa-history__kpis">
                <span><strong>{history.totals.sessions.toLocaleString(appLocale())}</strong> {t("Sessions")}</span>
                <span><strong>{history.totals.users.toLocaleString(appLocale())}</strong> {t("Users")}</span>
                <span><strong>{history.totals.pageviews.toLocaleString(appLocale())}</strong> {t("Page views")}</span>
                {history.totals.keyEvents > 0 ? <span><strong>{Math.round(history.totals.keyEvents).toLocaleString(appLocale())}</strong> {t("Key events")}</span> : null}
            </div>
            <SingleValueChart daily={daily} valueOf={(d) => d.sessions} gradientId="sa-history-fill" color="var(--color-data)" />
            <HistoryTables history={history} only={["channels", "pages"]} />
        </div>
    );
}

// The explanation compares whole-site traffic; with a segment filter on it
// would explain a different number than the chart shows, so it's hidden.
const segParamActive = (s) => !!(s && (s.device || s.country || s.channel || s.consent || s.dimension));

// ── Main overview page ────────────────────────────────────────────────────────
export default function SiteAnalytics() {
    document.title = "Overview, Analytics | Intastellar Consents";

    const {
        domain, hasDomain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate, fromIso, toIso,
        tick, setTick, data, loading, detailLoading, error, showSetup, showData, segment, setSegment,
    } = useAnalyticsPage();

    // Comparison period for the "vs previous period" trend chips on the KPI
    // cards — defaults to the immediately-preceding period of the same
    // length, same as before this control existed. docs/design-audit-plan.md
    // Phase 3 "compact header": the sticky header's date-range control
    // (Filter, via StickyPageTitle) already has a "Compare to prior period"
    // toggle + baseline picker built in and working elsewhere in the app
    // (Dashboard.js et al.) — it just wasn't wired up on any Analytics page
    // yet. useCompareRange()/usePrevRange() (_shared.js) wire it here; this
    // only changes which dates get requested from the same useAnalyticsReport
    // hook already in use below, not what it calculates or how trend/
    // pctChange works.
    const compare = useCompareRange();
    const prevRange = usePrevRange(fromDate, toDate, compare);
    // Same "Exclude suspected bots" preference as the CMP and Live view
    const [excludeBots, setExcludeBots] = useExcludeBots();
    const { data: prevData } = useAnalyticsReport(domain, prevRange.fromIso, prevRange.toIso, tick);
    // Notes on the timeline — one site only (not a property rollup), same period as the chart.
    const singleSite = !!(data && !data.noSiteKey && !data.isPropertyRollup);
    const notes = useAnnotations(singleSite ? domain : null, data?.from, data?.to);
    const dimensions = useDimensions(singleSite ? domain : null, data?.from, data?.to);

    const siteConfig    = useSiteConfig(domain);
    const { domains: foreignDomains } = useForeignDomains(domain);
    const pendingForeignDomains = foreignDomains.filter(d => !d.approved);
    // Split by whether the domain was actually seen within the selected date
    // range — see docs/analytics-audit-plan.md item 4.
    const { recent: recentPendingForeignDomains, olderCount: olderPendingForeignDomainsCount } = useMemo(
        () => splitForeignDomainsByRecency(pendingForeignDomains, fromDate),
        [pendingForeignDomains, fromDate]
    );

    const trendEngaged  = useMemo(() => pctChange(data?.totals?.engagedUsers,   prevData?.totals?.engagedUsers),   [data, prevData]);
    const trendEvents   = useMemo(() => pctChange(data?.totals?.total,          prevData?.totals?.total),          [data, prevData]);
    const trendSessions = useMemo(() => pctChange(data?.totals?.uniqueSessions, prevData?.totals?.uniqueSessions), [data, prevData]);
    const trendConsent  = useMemo(() => pctChange(data?.totals?.consentRate,    prevData?.totals?.consentRate),    [data, prevData]);

    const bounceRate     = useMemo(() => data?.totals?.uniqueSessions > 0 ? (data.totals.uniqueSessions - data.totals.engagedUsers) / data.totals.uniqueSessions * 100 : null, [data]);
    const prevBounceRate = useMemo(() => prevData?.totals?.uniqueSessions > 0 ? (prevData.totals.uniqueSessions - prevData.totals.engagedUsers) / prevData.totals.uniqueSessions * 100 : null, [prevData]);
    const trendBounce    = useMemo(() => pctChange(bounceRate, prevBounceRate), [bounceRate, prevBounceRate]);

    // Which hero changes rest on too few items to mean anything (shown as
    // "Too little data" instead of an arrow), and the counts behind each —
    // see src/Functions/smallSample.js. Counts compare the two periods'
    // values; rates (consent, bounce) their denominators.
    const lowData = useMemo(() => {
        const cur = data?.totals, p = prevData?.totals;
        if (!cur) return {};
        const n = (v) => Number(v || 0).toLocaleString(appLocale());
        const out = {};
        if (p) {
            if (isLowDataCount(cur.engagedUsers, p.engagedUsers)) out.users = t("{before} → {after} active users", { before: n(p.engagedUsers), after: n(cur.engagedUsers) });
            if (isLowDataCount(cur.total, p.total)) out.events = t("{before} → {after} events", { before: n(p.total), after: n(cur.total) });
            if (isLowDataCount(cur.uniqueSessions, p.uniqueSessions)) out.sessions = t("{before} → {after} sessions", { before: n(p.uniqueSessions), after: n(cur.uniqueSessions) });
            if (isLowDataRate(cur.total, p.total)) out.consent = t("Based on {before} and {after} events", { before: n(p.total), after: n(cur.total) });
            if (isLowDataRate(cur.uniqueSessions, p.uniqueSessions)) out.bounce = t("Based on {before} and {after} sessions", { before: n(p.uniqueSessions), after: n(cur.uniqueSessions) });
        }
        // The value itself on a small base (e.g. a 99,5% bounce rate from 3 sessions)
        out.basis = {
            bounce: cur.uniqueSessions < MIN_BASE ? t("Based on only {count} sessions", { count: n(cur.uniqueSessions) }) : undefined,
            consent: cur.total < MIN_BASE ? t("Based on only {count} events", { count: n(cur.total) }) : undefined,
        };
        return out;
    }, [data, prevData]);

    // Home = insights + snapshot; every card links into a sidebar report.
    const reportPaths = useMemo(() => ({
        acquisition: analyticsAcquisitionPath(domain),
        audience:    analyticsAudiencePath(domain),
        consent:     analyticsConsentPath(domain),
        conversions: analyticsConversionsPath(domain),
        forms:       analyticsFormsPath(domain),
        heatmap:     analyticsHeatmapPath(domain),
    }), [domain]);
    const insights = useMemo(() => buildInsights({
        data, prevData,
        conversions:     totalConversions(data?.conversions),
        prevConversions: totalConversions(prevData?.conversions),
        paths: reportPaths,
    }), [data, prevData, reportPaths]);

    // Dashboard card customization — stored in DB via analytics-site PATCH.
    const [customCards,     setCustomCards]     = useState(null);
    const [showCustomize,   setShowCustomize]   = useState(false);

    // cardMeta/order computed once here — the hero MetricTabStrip below
    // (paired with the chart) renders the first 4 ids, in the
    // business-type/customization-aware order.
    const cardMeta = useMemo(
        // Only with real totals: a domain without Analytics answers
        // { noSiteKey: true } (no totals) and must reach the setup card, not crash.
        () => data?.totals ? buildKpiCardMeta({ data, siteConfig, trendEngaged, trendEvents, trendSessions, trendConsent, trendBounce }) : {},
        [data, siteConfig, trendEngaged, trendEvents, trendSessions, trendConsent, trendBounce]
    );
    const kpiOrder = useMemo(
        () => data?.totals ? (customCards || kpiDefaultOrder({ data, siteConfig })) : [],
        [data, siteConfig, customCards]
    );
    const heroIds = kpiOrder.slice(0, 4);

    // Default to the first hero metric that actually has a daily series to
    // chart (today, only "events" does — see buildKpiCardMeta's hasDaily);
    // falls back to heroIds[0] so an account whose top metric has no daily
    // breakdown honestly shows that gap instead of silently picking a
    // different metric. Pinned to the user's own pick once they select a tab.
    const [heroMetric, setHeroMetric] = useState(null);
    const activeHeroMetric = heroMetric || heroIds.find(id => cardMeta[id]?.hasDaily) || heroIds[0] || null;

    useEffect(() => {
        if (siteConfig?.dashboard_cards) {
            setCustomCards(siteConfig.dashboard_cards);
        } else {
            setCustomCards(null);
        }
    }, [siteConfig]);

    const saveCustomCards = useCallback(async (cards) => {
        if (!domain) return;
        setCustomCards(cards);
        await fetch(`${ScannerHost}/api/analytics-site?domain=${encodeURIComponent(domain)}`, {
            method: "PATCH",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ dashboardCards: cards }),
        }).catch(() => {});
    }, [domain]);

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                className="sa-sticky-header"
                title={t("Overview")}
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
                previousPeriod={compare.previousPeriod}
                previousPeriod2={compare.previousPeriod2}
                compareRange={compare.compareRange}
                setCompareRange={compare.setCompareRange}
                setCompareWindowStart={compare.setCompareWindowStart}
                setCompareWindowEnd={compare.setCompareWindowEnd}
                toolbar={data && !data.noSiteKey ? (
                    <div className="sa-meta-row">
                        {data.isPropertyRollup ? (
                            <span className="sa-site-key-badge">{t("Property rollup — {count} domains", { count: (data.domains || []).length })}</span>
                        ) : (
                            <span className="sa-site-key-badge">
                                {tx("Site key: {key}", { key: <code>{data.siteId}</code> })}
                            </span>
                        )}
                        {!data.isPropertyRollup && (
                            <SegmentFilter segment={segment} setSegment={setSegment} dimensions={dimensions} />
                        )}
                        {singleSite && <ExportMenu domain={domain} from={data.from} to={data.to} excludeBots={excludeBots} />}
                    </div>
                ) : null}
            />
            <div className="dashboard-content">
                <div className="sa-page">

                    {!hasDomain && (
                        <p className="sa-notice">{t("Select a specific domain in the header to view analytics.")}</p>
                    )}
                    {/* Above the skeleton, so the banner sits in the same spot
                        while loading and after — it used to render below the
                        skeleton and jump to the top once loading finished. */}
                    {pendingForeignDomains.length > 0 && (
                        <div className="sa-foreign-banner">
                            <span className="sa-foreign-banner__dot" />
                            <span className="sa-foreign-banner__text">
                                {recentPendingForeignDomains.length > 0 ? (
                                    <>
                                        {recentPendingForeignDomains.length === 1
                                            ? tx("{domain} — an unrecognized domain seen in this date range. {notCounted} in any number below — approve it here if it's actually yours.", { domain: <strong>{recentPendingForeignDomains[0].domain}</strong>, notCounted: <strong>{t("Not counted")}</strong> })
                                            : tx("{domains} seen in this date range. {notCounted} in any number below — approve them here if they're actually yours.", { domains: <strong>{t("{count} unrecognized domains", { count: recentPendingForeignDomains.length })}</strong>, notCounted: <strong>{t("Not counted")}</strong> })}
                                        {olderPendingForeignDomainsCount > 0 && (
                                            <> {olderPendingForeignDomainsCount === 1
                                                ? t("(+1 older, already-excluded domain not shown here.)")
                                                : t("(+{count} older, already-excluded domains not shown here.)", { count: olderPendingForeignDomainsCount })}</>
                                        )}
                                    </>
                                ) : (
                                    pendingForeignDomains.length === 1
                                        ? tx("{domains} seen previously (none in this date range) — already excluded from every number below. Review in case it's still active.", { domains: <strong>{t("1 unrecognized domain")}</strong> })
                                        : tx("{domains} seen previously (none in this date range) — already excluded from every number below. Review in case any are still active.", { domains: <strong>{t("{count} unrecognized domains", { count: pendingForeignDomains.length })}</strong> })
                                )}
                            </span>
                            <Link className="sa-foreign-banner__link" to={analyticsSettingsPath(domain)}>
                                {t("Review & approve →")}
                            </Link>
                        </div>
                    )}

                    {/* Shared CMP + Analytics checklist; hidden once setup is complete */}
                    <SetupProgressCard platform={localStorage.getItem("platform") || "gdpr"} to={analyticsGettingStartedPath()} />

                    {hasDomain && loading && <OverviewSkeleton />}
                    {hasDomain && error && (
                        <p className="sa-notice sa-notice--error">{error}</p>
                    )}

                    {domain && showSetup && (
                        <SetupCard
                            domain={domain}
                            onKeyGenerated={() => setTick(t => t + 1)}
                        />
                    )}

                    {showData && (
                        <div className="sa-overview">

                            {/* ── What stands out this period ─────────────────────── */}
                            <TopFindings
                                period={periodLabel(fromIso, toIso)}
                                {...buildOverviewHeadline({ data, prevData, insights, trendSessions })}
                            />

                            {/* ── Dashboard mode badge ───────────────────────────── */}
                            {siteConfig?.businessType && (
                                <div className="sa-mode-badge">
                                    <span className="sa-mode-badge__dot" />
                                    {tx("Dashboard tuned for {type}", { type: <strong>{t(BT_LABELS[siteConfig.businessType])}</strong> })}
                                    <Link className="sa-mode-badge__link" to={analyticsSettingsPath(domain)}>{t("Change mode")}</Link>
                                </div>
                            )}

                            {/* ── Main: hero (GA4-style metric tabs + paired chart,
                                60 %) + live feed (40 %) ──────────────────────────
                                Tabs are the first 4 ids of kpiOrder, so the
                                user's own card choice (Customize) decides them. */}
                            <div className="sa-overview-main">
                                <div className="sa-chart-section">
                                    <MetricTabStrip
                                        className="sa-chart-section__tabs"
                                        metrics={heroIds.map(id => cardMeta[id] && {
                                            key: id,
                                            label: cardMeta[id].label,
                                            value: cardMeta[id].value,
                                            basis: lowData.basis?.[id],
                                            delta: cardMeta[id].trend != null && Number.isFinite(cardMeta[id].trend)
                                                ? { value: cardMeta[id].trend, lowData: !!lowData[id], basis: lowData[id] }
                                                : null,
                                        }).filter(Boolean)}
                                        active={activeHeroMetric}
                                        onSelect={setHeroMetric}
                                    />
                                    <div className="sa-chart-section__hd">
                                        <h3 className="sa-chart-section__title">
                                            <IconTrendingUp className="sa-icon" /> {cardMeta[activeHeroMetric]?.label || t("Trend")}
                                        </h3>
                                        <div className="sa-chart-section__hd-right">
                                            <span className="sa-chart-section__period">{t("Last {count} days", { count: getLastDays })}</span>
                                            {/* Picks which 4 metrics the tabs above show */}
                                            <button type="button" className="sa-customize-btn" onClick={() => setShowCustomize(true)}
                                                aria-label={t("Customize which metrics are shown")}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                                                </svg>
                                                {t("Customize")}
                                            </button>
                                        </div>
                                    </div>
                                    {cardMeta[activeHeroMetric]?.hasDaily ? (
                                        <>
                                            {cardMeta[activeHeroMetric].renderChart(data.daily)}
                                            {singleSite && <AnnotationStrip key={data.to} daily={data.daily} notes={notes} defaultDay={data.to} />}
                                        </>
                                    ) : (
                                        <EmptyState
                                            title={t("No daily breakdown yet")}
                                            message={t("{metric} is only available as a period total today — a day-by-day trend isn't tracked for it yet.", { metric: cardMeta[activeHeroMetric]?.label || t("This metric") })}
                                            dependency="daily breakdown for this metric"
                                        />
                                    )}
                                    <DataSource
                                        className="tw-mt-3"
                                        source={t("Analytics events from your site")}
                                        filters={[
                                            t("Users = visitors with statistics consent; others counted anonymously"),
                                            data.excludeBots === false ? t("Including suspected bots") : t("Suspected bots excluded"),
                                            [segment.device, segment.channel, segment.consent, segment.country].some(Boolean)
                                                ? t("Filtered: {filters}", { filters: [segment.device, segment.channel, segment.consent && t("{choice} consent", { choice: segment.consent }), segment.country].filter(Boolean).join(", ") })
                                                : null,
                                        ]}
                                        fetchedAt={data.fetchedAt}
                                        helpArticle="reading-the-numbers"
                                        action={
                                            <button type="button" className="sa-live__bots-toggle" onClick={() => setExcludeBots(!excludeBots)}>
                                                {excludeBots ? t("Include bots") : t("Exclude bots")}
                                            </button>
                                        }
                                    />
                                </div>
                                <LivePanel domain={domain} siteKey={siteConfig?.id} />
                            </div>

                            {/* ── What changed vs the previous period, and why ── */}
                            {singleSite && !segParamActive(segment) && <ChangeExplainer domain={domain} from={data.from} to={data.to} excludeBots={excludeBots} />}

                            {/* ── Snapshot: top 5s, each linking to its full report ── */}
                            <SnapshotRow data={data} paths={reportPaths} />

                            {/* ── Insights the top block didn't already show —
                                last on the page, as its own section ── */}
                            {insights.length > TOP_FINDINGS && (
                                <InsightsSection
                                    insights={insights.slice(TOP_FINDINGS)}
                                    compareLabel={compare.compareActive ? t("vs comparison period") : t("vs previous period")}
                                />
                            )}

                            {showCustomize && (
                                <CustomizePanel
                                    currentCards={customCards}
                                    defaultCards={["users", "events", "sessions", "consent", "countries"]}
                                    onSave={saveCustomCards}
                                    onClose={() => setShowCustomize(false)}
                                />
                            )}

                        </div>
                    )}

                    {!loading && data?.history && <HistoryPanel history={data.history} />}

                </div>
            </div>
        </div>
    );
}
