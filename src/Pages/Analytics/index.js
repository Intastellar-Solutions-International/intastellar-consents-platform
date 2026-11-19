const { useState, useEffect, useMemo, useCallback } = React;
const Link = window.ReactRouterDOM.Link;
import {
    analyticsAudiencePath, analyticsAcquisitionPath, analyticsSettingsPath, analyticsLivePath,
    analyticsConsentPath, analyticsConversionsPath, analyticsFormsPath, analyticsHeatmapPath,
    analyticsGettingStartedPath,
} from "../../Functions/domainPathSegments.js";
import { analyticsSnippet } from "../../Functions/installSnippet.js";
import SetupProgressCard from "../Onboarding/SetupProgressCard.js";
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { buildInsights, InsightsSection, SnapshotRow } from "./OverviewInsights.js";
import {
    authHeaders, useAnalyticsPage, useAnalyticsReport, useSiteConfig,
    toIsoDate, pctChange, IndustryBenchmarkNote, formatPercent, SegmentFilter,
    useCompareRange, usePrevRange, useLiveData,
    useForeignDomains, splitForeignDomainsByRecency,
    formatCurrency, CURRENCY_SYMBOLS,
    LiveActivityBars,
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
                    <span className="sa-live__label">Live</span>
                </div>
                <div className="sa-live__right">
                    <span className="sa-live__countdown">
                        {open ? `${countdown}s` : `${data.sessions.toLocaleString("de-DE")} active`}
                    </span>
                    <button type="button" className="sa-live__toggle" aria-label={open ? "Collapse" : "Expand"}>
                        {open ? "▲" : "▼"}
                    </button>
                </div>
            </div>

            {open && (
                <div className="sa-live__body">
                    <div>
                        <p className="sa-live__hero-label">Active users in last 30 minutes</p>
                        <p className="sa-live__hero-value">{data.sessions.toLocaleString("de-DE")}</p>
                        {data.minimal > 0 && (
                            <p className="sa-live__hero-sub">
                                + {data.minimal.toLocaleString("de-DE")} event{data.minimal !== 1 ? "s" : ""} from
                                visitors without full consent (not counted as users)
                            </p>
                        )}
                    </div>

                    <LiveActivityBars perMinute={data.perMinute} perMinuteUsers={data.perMinuteUsers} />

                    <div className="sa-live__divider" />

                    <div className="sa-live__countries">
                        <div className="sa-live__countries-hd">
                            <span>Country</span>
                            <span>Events</span>
                        </div>
                        {topCountries.length > 0 ? topCountries.map(c => (
                            <div key={c.code} className="sa-live__country-row"
                                title={`${c.events} event${c.events !== 1 ? "s" : ""} · ${c.activeUsers} active user${c.activeUsers !== 1 ? "s" : ""}`}>
                                <span className="sa-live__country-code">{c.code}</span>
                                <div className="sa-live__country-bar-wrap">
                                    <div className="sa-live__country-bar" style={{ width: Math.max(4, Math.round((c.events / maxCountryEvents) * 100)) + "%" }} />
                                </div>
                                <span className="sa-live__country-value">{c.events.toLocaleString("de-DE")}</span>
                            </div>
                        )) : (
                            <p className="sa-live__countries-empty">No visitors right now</p>
                        )}
                    </div>

                    {data.trackerMismatch && (
                        <p className="sa-live__mismatch">
                            Tracker is sending events under a different site key — the script tag on <strong>{domain}</strong> likely has a stale or wrong <code>data-site</code> value. Check Analytics Settings → Script.
                        </p>
                    )}

                    <Link className="sa-live__view-all" to={analyticsLivePath(domain)}>
                        View real time →
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
            {copied ? "Copied!" : "Copy snippet"}
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
    const W = 800, H = 182;
    const PAD = { t: 14, r: 18, b: 34, l: 46 };
    const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;

    if (!daily?.length) return <div className="sa-chart sa-chart--empty">No data for this period</div>;

    const maxVal = Math.max(...daily.map(d => d.minimal + d.full), 1);
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

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxVal * f));
    const fmtN = v => v >= 10000 ? (v / 1000).toFixed(0) + 'k' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v);
    const labelIdxs = n <= 1 ? [0] :
        [0, Math.round(n / 4), Math.round(n / 2), Math.round((n * 3) / 4), n - 1]
        .filter((v, idx, a) => a.indexOf(v) === idx && v < n);

    return (
        <div className="sa-area-chart">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", display: "block" }}>
                <defs>
                    <linearGradient id="sa-grad-total" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="rgba(249,191,64,0.45)" />
                        <stop offset="100%" stopColor="rgba(249,191,64,0.02)" />
                    </linearGradient>
                    <linearGradient id="sa-grad-full" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="rgba(74,222,128,0.65)" />
                        <stop offset="100%" stopColor="rgba(74,222,128,0.04)" />
                    </linearGradient>
                </defs>

                {yTicks.map((v, i) => {
                    const y = yOf(v);
                    return (
                        <g key={i}>
                            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                                stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                            <text x={PAD.l - 6} y={y + 4} textAnchor="end"
                                fontSize="13" fill="rgba(170,170,195,0.75)">
                                {fmtN(v)}
                            </text>
                        </g>
                    );
                })}

                <path d={totalArea} fill="url(#sa-grad-total)" />
                <path d={fullArea}  fill="url(#sa-grad-full)" />
                <path d={smoothPath(totalPts)} fill="none" stroke="rgba(249,191,64,0.55)" strokeWidth="1.5" />
                <path d={smoothPath(fullPts)}  fill="none" stroke="rgba(74,222,128,0.85)"  strokeWidth="1.5" />

                {labelIdxs.map(i => (
                    <text key={daily[i].date} x={xOf(i)} y={H - PAD.b + 18}
                        textAnchor="middle" fontSize="13" fill="rgba(170,170,195,0.75)">
                        {daily[i].date.slice(5)}
                    </text>
                ))}
            </svg>
            <div className="sa-chart__legend">
                <span className="sa-chart__legend-dot sa-chart__legend-dot--full" />
                <span>With consent</span>
                <span className="sa-chart__legend-dot sa-chart__legend-dot--minimal" />
                <span>No consent (minimal)</span>
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
function SingleValueChart({ daily, valueOf, color, fillFrom, fillTo, formatValue, yMax, gradientId }) {
    const W = 800, H = 182;
    const PAD = { t: 14, r: 18, b: 34, l: 46 };
    const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;

    if (!daily?.length) return <div className="sa-chart sa-chart--empty">No data for this period</div>;

    const values = daily.map(valueOf);
    const maxVal = yMax ?? Math.max(...values, 1);
    const n = daily.length;
    const xOf = i => PAD.l + (n === 1 ? cW / 2 : (i / (n - 1)) * cW);
    const yOf = v => PAD.t + cH - (v / maxVal) * cH;
    const base = PAD.t + cH;

    const pts = daily.map((d, i) => [xOf(i), yOf(valueOf(d))]);
    const area = smoothPath(pts) + ` L${pts[n - 1][0]},${base} L${PAD.l},${base} Z`;

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => maxVal * f);
    const fmt = formatValue || (v => v >= 10000 ? (v / 1000).toFixed(0) + 'k' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)));
    const labelIdxs = n <= 1 ? [0] :
        [0, Math.round(n / 4), Math.round(n / 2), Math.round((n * 3) / 4), n - 1]
        .filter((v, idx, a) => a.indexOf(v) === idx && v < n);

    return (
        <div className="sa-area-chart">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", display: "block" }}>
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={fillFrom} />
                        <stop offset="100%" stopColor={fillTo} />
                    </linearGradient>
                </defs>

                {yTicks.map((v, i) => {
                    const y = yOf(v);
                    return (
                        <g key={i}>
                            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                                stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                            <text x={PAD.l - 6} y={y + 4} textAnchor="end"
                                fontSize="13" fill="rgba(170,170,195,0.75)">
                                {fmt(v)}
                            </text>
                        </g>
                    );
                })}

                <path d={area} fill={`url(#${gradientId})`} />
                <path d={smoothPath(pts)} fill="none" stroke={color} strokeWidth="1.5" />

                {labelIdxs.map(i => (
                    <text key={daily[i].date} x={xOf(i)} y={H - PAD.b + 18}
                        textAnchor="middle" fontSize="13" fill="rgba(170,170,195,0.75)">
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
export function totalConversions(conversions) {
    return (conversions || []).reduce((s, c) => s + (c.count || 0), 0);
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
                    <span className="sa-customize-panel__title">Customize cards</span>
                    <button className="sa-customize-panel__close" onClick={onClose} aria-label="Close">✕</button>
                </div>
                <p className="sa-customize-panel__sub">Choose which KPI cards appear on the dashboard.</p>
                <div className="sa-customize-panel__list">
                    {ALL_CARD_DEFS.map(c => (
                        <label key={c.id} className={"sa-customize-panel__item" + (draft.includes(c.id) ? " sa-customize-panel__item--on" : "")}>
                            <input
                                type="checkbox"
                                className="sa-customize-panel__check"
                                checked={draft.includes(c.id)}
                                onChange={() => toggle(c.id)}
                            />
                            <span className="sa-customize-panel__item-label">{c.label}</span>
                            <span className="sa-customize-panel__item-desc">{c.desc}</span>
                        </label>
                    ))}
                </div>
                <div className="sa-customize-panel__actions">
                    <button className="sa-customize-panel__reset" onClick={() => { onSave(null); onClose(); }}>
                        Reset to default
                    </button>
                    <button className="sa-customize-panel__apply" onClick={() => { onSave(draft); onClose(); }}>
                        Apply
                    </button>
                </div>
            </div>
        </div>
    );
}

// docs/design-audit-plan.md Phase 4: the Executive Overview's headline
// sentence — pure presentation, synthesizing numbers this page already
// fetches (data.totals, the same trendEvents the hero's "Total events" tab
// already shows, data.industryBenchmark — same source IndustryBenchmarkNote
// uses). No new calculation, no fabricated data: the trend clause is
// dropped entirely (not shown as "0%" or omitted silently as if nothing
// changed) when there's no real previous-period baseline to compare
// against, same as the hero's own trend chips do via pctChange().
function buildOverviewHeadline({ data, trendEvents, getLastDays }) {
    const users  = data.totals.engagedUsers;
    const events = data.totals.total;
    const consentPct = data.totals.consentRate;

    let headline = `${users.toLocaleString("de-DE")} active user${users === 1 ? "" : "s"} generated `
        + `${events.toLocaleString("de-DE")} event${events === 1 ? "" : "s"} this period`;
    if (trendEvents != null && Number.isFinite(trendEvents)) {
        headline += `, ${trendEvents >= 0 ? "up" : "down"} ${formatPercent(Math.abs(trendEvents))} from the period before`;
    }
    headline += ".";

    let subline = `${formatPercent(consentPct)} statistics consent rate over the last ${getLastDays} days`;
    if (data.industryBenchmark) {
        const diff = consentPct - data.industryBenchmark.consentRatePct;
        const diffStr = Math.abs(diff).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        subline += ` — ${diffStr}pts ${diff >= 0 ? "above" : "below"} the ${data.industryBenchmark.label} average`;
    }

    return { eyebrow: "Here's what to care about today", headline, subline };
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
            icon: <IconCash />, label: "Revenue", value: fmtRevenue(data.totals.revenue, currency),
            sub: data.totals.transactions ? `${data.totals.transactions.toLocaleString("de-DE")} transactions` : "ecommerce events",
            variant: "revenue", hasDaily: false,
        },
        users: {
            icon: <IconRadio />, label: "Active users", value: data.totals.engagedUsers.toLocaleString("de-DE"),
            sub: "engaged: 10s+, clicked, or 2+ pages", variant: "live", trend: trendEngaged,
            // api/analytics-report.js's dailyEngagedRes — same engagement
            // criteria as the engagedUsers total, grouped by day (Phase 4).
            hasDaily: true,
            renderChart: (daily) => (
                <SingleValueChart daily={daily} valueOf={d => d.engaged}
                    color="rgba(96,165,250,0.85)" fillFrom="rgba(96,165,250,0.45)" fillTo="rgba(96,165,250,0.02)"
                    gradientId="sa-grad-users" />
            ),
        },
        bounce: {
            icon: <IconScrollDepth />, label: "Bounce rate",
            value: bounceRate != null ? formatPercent(bounceRate) : "—",
            sub: "sessions with no engagement",
            variant: bounceRate != null && bounceRate > 60 ? "warn" : "blue",
            trend: trendBounce != null ? -trendBounce : undefined,
            // Same uniqueSessions/engaged columns the "users"/"sessions" tabs
            // already chart per day (api/analytics-report.js's daily series) —
            // just divided the same way the aggregate bounceRate above is.
            hasDaily: true,
            renderChart: (daily) => (
                <SingleValueChart daily={daily}
                    valueOf={d => d.uniqueSessions > 0 ? ((d.uniqueSessions - d.engaged) / d.uniqueSessions) * 100 : 0}
                    color="rgba(239,68,68,0.75)" fillFrom="rgba(239,68,68,0.4)" fillTo="rgba(239,68,68,0.02)"
                    formatValue={v => formatPercent(v, 0)} yMax={100} gradientId="sa-grad-bounce" />
            ),
        },
        events: {
            icon: <IconBarChart />, label: bt === "media" ? "Page views" : "Total events",
            value: data.totals.total.toLocaleString("de-DE"),
            sub: `${data.totals.minimal.toLocaleString("de-DE")} minimal · ${data.totals.full.toLocaleString("de-DE")} full`,
            trend: trendEvents, hasDaily: true,
            renderChart: (daily) => <AreaChart daily={daily} />,
        },
        sessions: {
            icon: <IconUsers />, label: "Unique sessions", value: data.totals.uniqueSessions.toLocaleString("de-DE"),
            sub: "consent-gated sessions only", trend: trendSessions,
            // dailyRes now carries unique_sessions per day alongside the
            // existing minimal/full columns — one extra column, same query.
            hasDaily: true,
            renderChart: (daily) => (
                <SingleValueChart daily={daily} valueOf={d => d.uniqueSessions}
                    color="rgba(167,139,250,0.85)" fillFrom="rgba(167,139,250,0.45)" fillTo="rgba(167,139,250,0.02)"
                    gradientId="sa-grad-sessions" />
            ),
        },
        consent: {
            icon: <IconShieldCheck />, label: STATISTICS_CONSENT.label, value: formatPercent(consentPct),
            sub: STATISTICS_CONSENT.hint,
            variant: consentPct < 20 ? "warn" : "live", trend: trendConsent,
            // Derived client-side from daily.minimal/.full — no backend change
            // needed, same per-day event counts the "Total events" tab already
            // has, just divided differently (full / (minimal+full)).
            hasDaily: true,
            renderChart: (daily) => (
                <SingleValueChart daily={daily}
                    valueOf={d => (d.minimal + d.full) > 0 ? (d.full / (d.minimal + d.full)) * 100 : 0}
                    color="rgba(74,222,128,0.85)" fillFrom="rgba(74,222,128,0.45)" fillTo="rgba(74,222,128,0.02)"
                    formatValue={v => formatPercent(v, 0)} yMax={100} gradientId="sa-grad-consent" />
            ),
            children: <IndustryBenchmarkNote benchmark={data.industryBenchmark} actualPct={consentPct} />,
        },
        countries: {
            icon: <IconGlobe />, label: "Countries", value: data.countries.length,
            sub: data.countries[0] ? `Top: ${data.countries[0].code}` : null, hasDaily: false,
        },
        leads: {
            icon: <IconTarget />, label: "Quality leads", value: (data.totals.qualityLeads ?? 0).toLocaleString("de-DE"),
            sub: "engaged + page/event match", variant: "live", hasDaily: false,
        },
        conversions: {
            icon: <IconFunnel />, label: "Conversions", value: totalConversions(data.conversions).toLocaleString("de-DE"),
            sub: "purchase, lead, and other registered events", variant: "live", hasDaily: false,
        },
        conversionRate: {
            icon: <IconTrendingUp />, label: "Conversion rate", value: formatPercent(data.totals.conversionRate ?? 0),
            sub: "sessions with at least one conversion", hasDaily: false,
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
            <h3 className="sa-setup__title">No data yet for <strong>{domain}</strong></h3>
            <p className="sa-setup__body">
                Embed the script below on every page of your site. The script reads the
                Intastellar consent cookie and only collects full analytics when the visitor
                accepts <em>statisticCookies</em>. Minimal data (page path + consent choice)
                is always recorded.
            </p>
            <p className="sa-setup__body">
                Setting up a new site? <Link className="sa-link" to={analyticsGettingStartedPath()}>Get started</Link> has
                one install code for the cookie banner and Analytics together.
            </p>

            {loading && <p className="sa-setup__loading">Loading&hellip;</p>}

            {!loading && !siteKey && (
                <button
                    type="button"
                    className="sa-setup__gen-btn"
                    onClick={generate}
                    disabled={generating}
                >
                    {generating ? "Generating…" : "Generate site key"}
                </button>
            )}

            {!loading && siteKey && (
                <div className="sa-setup__snippet-wrap">
                    <div className="sa-setup__snippet-header">
                        <span className="sa-setup__snippet-label">Embed snippet</span>
                        <CopyButton text={snippet} />
                    </div>
                    <pre className="sa-setup__snippet">{snippet}</pre>
                    <p className="sa-setup__hint">
                        Paste into the <code>&lt;head&gt;</code> of every page. Data will appear
                        here within a few minutes of the first visitor.
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

// ── Main overview page ────────────────────────────────────────────────────────
export default function SiteAnalytics() {
    document.title = "Overview, Analytics | Intastellar Consents";

    const {
        domain, hasDomain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate,
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
    const { data: prevData } = useAnalyticsReport(domain, prevRange.fromIso, prevRange.toIso, tick);

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
        () => data ? buildKpiCardMeta({ data, siteConfig, trendEngaged, trendEvents, trendSessions, trendConsent, trendBounce }) : {},
        [data, siteConfig, trendEngaged, trendEvents, trendSessions, trendConsent, trendBounce]
    );
    const kpiOrder = useMemo(
        () => data ? (customCards || kpiDefaultOrder({ data, siteConfig })) : [],
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
                title="Overview"
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
                            <span className="sa-site-key-badge">Property rollup &mdash; {(data.domains || []).length} domains</span>
                        ) : (
                            <span className="sa-site-key-badge">
                                Site key: <code>{data.siteId}</code>
                            </span>
                        )}
                        {!data.isPropertyRollup && (
                            <SegmentFilter segment={segment} setSegment={setSegment} />
                        )}
                    </div>
                ) : null}
            />
            <div className="dashboard-content">
                <div className="sa-page">

                    {!hasDomain && (
                        <p className="sa-notice">Select a specific domain in the header to view analytics.</p>
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
                                            ? <><strong>{recentPendingForeignDomains[0].domain}</strong> — an unrecognized domain</>
                                            : <><strong>{recentPendingForeignDomains.length} unrecognized domains</strong></>
                                        } seen in this date range. <strong>Not counted</strong> in any number below —
                                        approve it here if it's actually yours.
                                        {olderPendingForeignDomainsCount > 0 && (
                                            <> (+{olderPendingForeignDomainsCount} older, already-excluded domain{olderPendingForeignDomainsCount === 1 ? "" : "s"} not shown here.)</>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <strong>{pendingForeignDomains.length} unrecognized domain{pendingForeignDomains.length === 1 ? "" : "s"}</strong> seen
                                        previously (none in this date range) — already excluded from every number below.
                                        Review in case any are still active.
                                    </>
                                )}
                            </span>
                            <Link className="sa-foreign-banner__link" to={analyticsSettingsPath(domain)}>
                                Review &amp; approve →
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

                            {/* ── Headline sentence ───────────────────────────────
                                docs/design-audit-plan.md Phase 4. */}
                            {(() => {
                                const h = buildOverviewHeadline({ data, trendEvents, getLastDays });
                                return (
                                    <div className="sa-overview-headline">
                                        <p className="sa-overview-headline__eyebrow">{h.eyebrow}</p>
                                        <p className="sa-overview-headline__text">{h.headline}</p>
                                        <p className="sa-overview-headline__sub">{h.subline}</p>
                                    </div>
                                );
                            })()}

                            {/* ── Dashboard mode badge ───────────────────────────── */}
                            {siteConfig?.businessType && (
                                <div className="sa-mode-badge">
                                    <span className="sa-mode-badge__dot" />
                                    Dashboard tuned for <strong>{BT_LABELS[siteConfig.businessType]}</strong>
                                    <Link className="sa-mode-badge__link" to={analyticsSettingsPath(domain)}>Change mode</Link>
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
                                            delta: cardMeta[id].trend != null && Number.isFinite(cardMeta[id].trend)
                                                ? { value: cardMeta[id].trend }
                                                : null,
                                        }).filter(Boolean)}
                                        active={activeHeroMetric}
                                        onSelect={setHeroMetric}
                                    />
                                    <div className="sa-chart-section__hd">
                                        <h3 className="sa-chart-section__title">
                                            <IconTrendingUp className="sa-icon" /> {cardMeta[activeHeroMetric]?.label || "Trend"}
                                        </h3>
                                        <div className="sa-chart-section__hd-right">
                                            <span className="sa-chart-section__period">Last {getLastDays} days</span>
                                            {/* Picks which 4 metrics the tabs above show */}
                                            <button type="button" className="sa-customize-btn" onClick={() => setShowCustomize(true)}
                                                aria-label="Customize which metrics are shown">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                                                </svg>
                                                Customize
                                            </button>
                                        </div>
                                    </div>
                                    {cardMeta[activeHeroMetric]?.hasDaily ? (
                                        cardMeta[activeHeroMetric].renderChart(data.daily)
                                    ) : (
                                        <EmptyState
                                            title="No daily breakdown yet"
                                            message={`${cardMeta[activeHeroMetric]?.label || "This metric"} is only available as a period total today — a day-by-day trend isn't tracked for it yet.`}
                                            dependency="daily breakdown for this metric"
                                        />
                                    )}
                                </div>
                                <LivePanel domain={domain} siteKey={siteConfig?.id} />
                            </div>

                            {/* ── Snapshot: top 5s, each linking to its full report ── */}
                            <SnapshotRow data={data} paths={reportPaths} />

                            {/* ── Insights: what changed vs the previous period —
                                last on the page, as its own section ── */}
                            <InsightsSection
                                insights={insights}
                                comparing={!prevData}
                                compareLabel={compare.compareActive ? "vs comparison period" : "vs previous period"}
                            />

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

                </div>
            </div>
        </div>
    );
}
