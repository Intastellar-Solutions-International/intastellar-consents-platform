const { useState, useEffect, useMemo, useCallback } = React;
const Link = window.ReactRouterDOM.Link;
import {
    analyticsAudiencePath, analyticsAcquisitionPath, analyticsSettingsPath, analyticsLivePath,
} from "../../Functions/domainPathSegments.js";
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import AnalyticsWorldMap from "./AnalyticsWorldMap.js";
import {
    authHeaders, KpiCard, MiniBar, useAnalyticsPage, useAnalyticsReport, useSiteConfig,
    toIsoDate, pctChange, IndustryBenchmarkNote, formatPercent, SegmentFilter,
    useCompareRange, usePrevRange, useLiveData,
    useForeignDomains, splitForeignDomainsByRecency,
    formatCurrency, CURRENCY_SYMBOLS, elementLabel,
} from "./_shared.js";
import { SkeletonBlock, KpiCardSkeleton, PanelSkeleton } from "./components/Skeleton.js";
import MetricTabStrip from "./components/MetricTabStrip.js";
import EmptyState from "./components/EmptyState.js";
import {
    IconBarChart, IconUsers, IconShieldCheck, IconGlobe, IconTrendingUp,
    IconDocument, IconRadio, IconTarget, IconMegaphone, IconCash, IconExternalLink, IconCursorClick,
    IconScrollDepth, IconFunnel,
} from "./Icons.js";
import "./Analytics.css";

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

    const maxUserBar = Math.max(...(data.perMinuteUsers || [1]), 1);
    const topCountries = (data.countries || []).slice(0, 5);
    const maxCountryUsers = Math.max(...topCountries.map(c => c.activeUsers), 1);

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
                    <p className="sa-live__hero-label">Active users in last 30 minutes</p>
                    <p className="sa-live__hero-value">{data.sessions.toLocaleString("de-DE")}</p>

                    <div className="sa-live__sparkline">
                        <div className="sa-live__spark-hd">
                            <span className="sa-live__spark-label">Active users per minute</span>
                        </div>
                        <div className="sa-live__spark-bars">
                            {(data.perMinuteUsers || []).map((v, i) => (
                                <div
                                    key={i}
                                    className={"sa-live__spark-bar" + (i === (data.perMinuteUsers.length - 1) ? " sa-live__spark-bar--last" : "")}
                                    style={{ height: Math.max(3, Math.round((v / maxUserBar) * 44)) + "px" }}
                                    title={`${v} active user${v !== 1 ? "s" : ""}`}
                                />
                            ))}
                        </div>
                        <div className="sa-live__spark-times">
                            <span>−30m</span>
                            <span>−15m</span>
                            <span>now</span>
                        </div>
                    </div>

                    <div className="sa-live__divider" />

                    <div className="sa-live__countries">
                        <div className="sa-live__countries-hd">
                            <span>Country</span>
                            <span>Active users</span>
                        </div>
                        {topCountries.length > 0 ? topCountries.map(c => (
                            <div key={c.code} className="sa-live__country-row">
                                <span className="sa-live__country-code">{c.code}</span>
                                <div className="sa-live__country-bar-wrap">
                                    <div className="sa-live__country-bar" style={{ width: Math.max(4, Math.round((c.activeUsers / maxCountryUsers) * 100)) + "%" }} />
                                </div>
                                <span className="sa-live__country-value">{c.activeUsers}</span>
                            </div>
                        )) : (
                            <p className="sa-live__countries-empty">No data available</p>
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

const INGEST_URL = "https://analytics.consentsmanagement.com/api/a";

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
                                fontSize="9" fill="rgba(150,150,175,0.5)">
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
                        textAnchor="middle" fontSize="9" fill="rgba(150,150,175,0.55)">
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
                                fontSize="9" fill="rgba(150,150,175,0.5)">
                                {fmt(v)}
                            </text>
                        </g>
                    );
                })}

                <path d={area} fill={`url(#${gradientId})`} />
                <path d={smoothPath(pts)} fill="none" stroke={color} strokeWidth="1.5" />

                {labelIdxs.map(i => (
                    <text key={daily[i].date} x={xOf(i)} y={H - PAD.b + 18}
                        textAnchor="middle" fontSize="9" fill="rgba(150,150,175,0.55)">
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
    { id: "consent",  label: "Consent rate",    desc: "statisticCookies acceptance" },
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

// Per-business-type default KPI card ordering — extracted from KpiStrip so
// both it and the parent (for the hero composite below) can derive the same
// `order` without duplicating this switch. Pure function of data/siteConfig,
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
                ? ["revenue", "countries", "users", "sessions", "consent"]
                : ["countries", "users", "sessions", "consent", "events"];
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
    return defaultOrder;
}

// Plain-data registry for every possible overview KPI card — label/value/
// trend/hasDaily, no JSX rendering. docs/design-audit-plan.md Phase 4: the
// hero composite (MetricTabStrip, pulling its 4 tabs from the first 4 ids of
// kpiDefaultOrder()/customCards, same as KpiStrip below it) needs this same
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
            trend: trendBounce != null ? -trendBounce : undefined, hasDaily: false,
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
            icon: <IconShieldCheck />, label: "Consent rate", value: formatPercent(consentPct),
            sub: "statisticCookies accepted — this analytics tracker's own full-consent rate",
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

// docs/design-audit-plan.md Phase 4: the first 4 ids of `order` become the
// GA4-style MetricTabStrip hero (rendered by the parent, paired with a
// chart); this component renders the *rest* (5th+) as the existing KpiCard
// grid, same as before this phase — so the hero and the already-mature
// business-type/customizable card system share one `order` instead of the
// hero duplicating or ignoring it. `cardMeta`/`order` are computed once in
// the parent (SiteAnalytics) via buildKpiCardMeta()/kpiDefaultOrder() above,
// since the parent's chart section also needs them (to know the selected
// hero metric's label and hasDaily flag).
function KpiStrip({ cardMeta, order, onCustomize }) {
    const restIds = order.slice(4);
    const restCards = restIds.map(id => {
        const m = cardMeta[id];
        if (!m) return null;
        return (
            <KpiCard key={id} icon={m.icon} label={m.label} value={m.value} sub={m.sub} variant={m.variant} trend={m.trend}>
                {m.children}
            </KpiCard>
        );
    }).filter(Boolean);
    const cls = restCards.length >= 6 ? "sa-kpi-strip sa-kpi-strip--6" : "sa-kpi-strip";

    return (
        <div className="sa-kpi-strip-wrap">
            {restCards.length > 0 && <div className={cls}>{restCards}</div>}
            <button className="sa-customize-btn" onClick={onCustomize} title="Customize cards" aria-label="Customize dashboard cards">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                Customize
            </button>
        </div>
    );
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

    const snippet = siteKey
        ? `<script src="${INGEST_URL}" data-site="${siteKey}" async defer></script>`
        : null;

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

// ── Consent Impact Estimator ──────────────────────────────────────────────────
// Shows observed vs estimated true traffic, accounting for the ~25-35% of
// visitors who decline full consent and are therefore counted with less
// granularity. Uses only analytics_events (consent_level column) — the
// consent platform's separate DB is not consulted here.
function ConsentImpactPanel({ impact }) {
    if (!impact || impact.estimatedTrue == null) return null;
    const { consentRate, observedSessions, estimatedTrue } = impact;
    const hidden = Math.max(0, estimatedTrue - observedSessions);
    const hiddenPct = estimatedTrue > 0 ? Math.round((hidden / estimatedTrue) * 100) : 0;

    return (
        <div className="sa-panel sa-consent-impact">
            <h3 className="sa-panel__title">
                <IconShieldCheck className="sa-icon" /> Consent Impact Estimator
            </h3>
            <p className="sa-panel__sub">
                Visitors who decline full consent are visible only as anonymous events — their sessions
                cannot be stitched. This estimates your true session volume based on the observed consent rate.
            </p>
            <div className="sa-ci-kpis">
                <div className="sa-ci-kpi">
                    <span className="sa-ci-kpi__label" title="This analytics tracker's own full-consent rate — not the CMP banner's acceptance rate shown on the Marketing tab, which is a different metric from a different system.">
                        Full-consent rate
                    </span>
                    <span className="sa-ci-kpi__value">{formatPercent(consentRate)}</span>
                </div>
                <div className="sa-ci-kpi">
                    <span className="sa-ci-kpi__label">Observed sessions</span>
                    <span className="sa-ci-kpi__value">{observedSessions.toLocaleString("de-DE")}</span>
                </div>
                <div className="sa-ci-kpi">
                    <span className="sa-ci-kpi__label">Estimated true total</span>
                    <span className="sa-ci-kpi__value">{estimatedTrue.toLocaleString("de-DE")}</span>
                    <span className="sa-ci-kpi__note">~{hiddenPct}% of traffic uncounted in session analytics</span>
                </div>
            </div>
            <div className="sa-ci-bar-wrap">
                <div className="sa-ci-bar">
                    <div className="sa-ci-bar__observed" style={{ width: (100 - hiddenPct) + "%" }} title="Observed (full consent)" />
                    <div className="sa-ci-bar__hidden"   style={{ width: hiddenPct + "%" }} title="Estimated uncounted (declined/minimal consent)" />
                </div>
                <div className="sa-ci-bar-labels">
                    <span>Observed</span>
                    <span>Uncounted</span>
                </div>
            </div>
        </div>
    );
}

// ── Loading skeletons ──────────────────────────────────────────────────────────
// Shown while the fast /api/analytics-report call is in flight, shaped to match
// the real layout below (KPI strip, chart + live feed, geo row) so the page
// doesn't flash from blank to fully populated.

// KpiCardSkeleton/PanelSkeleton promoted to components/Skeleton.js (Phase 1
// of docs/design-audit-plan.md) — this page now only composes them into its
// own specific layout shape, same as before.
function OverviewSkeleton() {
    return (
        <div className="sa-overview">
            <div className="sa-kpi-strip">
                {Array.from({ length: 5 }, (_, i) => <KpiCardSkeleton key={i} />)}
            </div>

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

            <div className="sa-overview-geo">
                <PanelSkeleton rows={5} />
                <PanelSkeleton rows={5} />
                <PanelSkeleton rows={3} />
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

    // Dashboard card customization — stored in DB via analytics-site PATCH.
    const [customCards,     setCustomCards]     = useState(null);
    const [showCustomize,   setShowCustomize]   = useState(false);

    // docs/design-audit-plan.md Phase 4: cardMeta/order computed once here —
    // KpiStrip renders cards 5+ from it, and the hero MetricTabStrip below
    // (paired with the chart) renders the first 4, so both share one
    // business-type/customization-aware ordering instead of the hero
    // duplicating or overriding it.
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

    const maxPageViews  = useMemo(() => Math.max(...(data?.topPages   || []).map(p => p.views),  1), [data]);
    const maxCountry    = useMemo(() => Math.max(...(data?.countries  || []).map(c => c.events), 1), [data]);
    const maxReferrer   = useMemo(() => Math.max(...(data?.referrers  || []).map(r => r.events), 1), [data]);
    const maxOutbound        = useMemo(() => Math.max(...(data?.topOutbound      || []).map(o => o.clicks),    1), [data]);
    const maxRageSelector    = useMemo(() => Math.max(...(data?.topRageSelectors || []).map(s => s.clicks),    1), [data]);
    const deviceTotal  = useMemo(() => (data?.devices || []).reduce((s, d) => s + d.events, 0), [data]);

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
            />
            <div className="dashboard-content">
                <div className="sa-page">

                    {data && !data.noSiteKey && (
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
                    )}

                    {!hasDomain && (
                        <p className="sa-notice">Select a specific domain in the header to view analytics.</p>
                    )}
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

                    {showData && (
                        <div className="sa-overview">

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
                                docs/design-audit-plan.md Phase 4: tabs are the
                                first 4 ids of the order KpiStrip uses below, so
                                nothing duplicates and nothing overrides the
                                user's own card choice. */}
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
                                        <span className="sa-chart-section__period">Last {getLastDays} days</span>
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

                            {/* ── KPI strip: cards 5+ (business-type-aware, customizable) ─── */}
                            <KpiStrip
                                cardMeta={cardMeta}
                                order={kpiOrder}
                                onCustomize={() => setShowCustomize(true)}
                            />
                            {showCustomize && (
                                <CustomizePanel
                                    currentCards={customCards}
                                    defaultCards={["users", "events", "sessions", "consent", "countries"]}
                                    onSave={saveCustomCards}
                                    onClose={() => setShowCustomize(false)}
                                />
                            )}

                            {/* ── Geo row: map | countries | devices ─────────────── */}
                            <div className="sa-overview-geo">
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title"><IconGlobe className="sa-icon" /> Active users by country</h3>
                                    {data.countries.length > 0
                                        ? <AnalyticsWorldMap countries={data.countries} />
                                        : <p className="sa-notice">No geographic data for this period.</p>}
                                </div>

                                <div className="sa-panel">
                                    <h3 className="sa-panel__title"><IconGlobe className="sa-icon" /> Top countries</h3>
                                    <table className="sa-table">
                                        <thead>
                                            <tr>
                                                <th>Country</th>
                                                <th className="sa-table__num">Events</th>
                                                <th className="sa-table__bar" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.countries.slice(0, 8).map(c => (
                                                <tr key={c.code}>
                                                    <td>{c.code}</td>
                                                    <td className="sa-table__num">{c.events.toLocaleString("de-DE")}</td>
                                                    <td className="sa-table__bar">
                                                        <MiniBar value={c.events} max={maxCountry} color="rgba(var(--sa-chart-primary),0.55)" />
                                                    </td>
                                                </tr>
                                            ))}
                                            {!data.countries.length && (
                                                <tr><td colSpan={3} style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem" }}>No data yet</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                    <Link className="sa-panel__footer-link" to={analyticsAudiencePath(domain)}>View audience →</Link>
                                </div>

                                <div className="sa-panel">
                                    <h3 className="sa-panel__title"><IconUsers className="sa-icon" /> Devices</h3>
                                    <div className="sa-consent-list">
                                        {data.devices.map(d => {
                                            const pct = deviceTotal > 0 ? Math.round((d.events / deviceTotal) * 100) : 0;
                                            return (
                                                <div key={d.type} className="sa-consent-row">
                                                    <span className="sa-consent-row__label" style={{ textTransform: "capitalize" }}>{d.type}</span>
                                                    <div className="sa-bar">
                                                        <div className="sa-bar__seg"
                                                            style={{ width: pct + "%", background: "rgba(var(--sa-chart-primary),0.55)" }}
                                                            title={d.events + " events"} />
                                                    </div>
                                                    <span className="sa-consent-row__pct">{pct}%</span>
                                                </div>
                                            );
                                        })}
                                        {!data.devices.length && (
                                            <p style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem", margin: 0 }}>No data yet</p>
                                        )}
                                    </div>
                                    <Link className="sa-panel__footer-link" to={analyticsAudiencePath(domain)}>View audience →</Link>
                                </div>
                            </div>

                            {/* ── Bottom: traffic sources | top pages ────────────── */}
                            <div className="sa-overview-bottom">
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconMegaphone className="sa-icon" /> Traffic sources
                                    </h3>
                                    <div className="sa-table-scroll">
                                    <table className="sa-table">
                                        <thead>
                                            <tr>
                                                <th>Referrer</th>
                                                <th className="sa-table__num">Events</th>
                                                <th className="sa-table__num">Sessions</th>
                                                <th className="sa-table__bar" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.referrers.slice(0, 8).map((r, i) => (
                                                <tr key={i}>
                                                    <td className="sa-table__path" title={r.referrer}>{r.referrer}</td>
                                                    <td className="sa-table__num">{r.events.toLocaleString("de-DE")}</td>
                                                    <td className="sa-table__num">{r.sessions.toLocaleString("de-DE")}</td>
                                                    <td className="sa-table__bar">
                                                        <MiniBar value={r.events} max={maxReferrer} color="rgba(var(--sa-chart-primary),0.55)" />
                                                    </td>
                                                </tr>
                                            ))}
                                            {!data.referrers.length && (
                                                <tr><td colSpan={4} style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem" }}>No data yet</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                    </div>
                                    <Link className="sa-panel__footer-link" to={analyticsAcquisitionPath(domain)}>View traffic acquisition →</Link>
                                </div>

                                <div className="sa-panel">
                                    <h3 className="sa-panel__title"><IconDocument className="sa-icon" /> Top pages</h3>
                                    <div className="sa-table-scroll">
                                    <table className="sa-table">
                                        <thead>
                                            <tr>
                                                <th>Page</th>
                                                <th className="sa-table__num">Views</th>
                                                <th className="sa-table__bar" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.topPages.map(p => (
                                                <tr key={p.pathname}>
                                                    <td className="sa-table__path" title={p.pathname}>{p.pathname}</td>
                                                    <td className="sa-table__num">{p.views.toLocaleString("de-DE")}</td>
                                                    <td className="sa-table__bar">
                                                        <MiniBar value={p.views} max={maxPageViews} />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    </div>
                                </div>

                                {/* Outbound/forms/rage panels depend on the slower detail
                                    call — show placeholders instead of letting them pop in
                                    unannounced once detailLoading settles. */}
                                {detailLoading && (
                                    <>
                                        <PanelSkeleton rows={4} />
                                        <PanelSkeleton rows={3} />
                                    </>
                                )}

                                {!detailLoading && (data.topOutbound || []).length > 0 && (
                                    <div className="sa-panel">
                                        <h3 className="sa-panel__title">
                                            <IconExternalLink className="sa-icon" /> Outbound clicks
                                            <span className="sa-panel__consent-note">{(data.outboundClicks || 0).toLocaleString("de-DE")} total</span>
                                        </h3>
                                        <table className="sa-table">
                                            <thead>
                                                <tr>
                                                    <th>Destination</th>
                                                    <th className="sa-table__num">Clicks</th>
                                                    <th className="sa-table__bar" />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {data.topOutbound.map(o => (
                                                    <tr key={o.host}>
                                                        <td className="sa-table__path">{o.host}</td>
                                                        <td className="sa-table__num">{o.clicks.toLocaleString("de-DE")}</td>
                                                        <td className="sa-table__bar">
                                                            <MiniBar value={o.clicks} max={maxOutbound} color="rgba(var(--sa-chart-primary),0.5)" />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {!detailLoading && (data.formFunnel || []).length > 0 && (
                                    <div className="sa-panel">
                                        <h3 className="sa-panel__title">
                                            <IconScrollDepth className="sa-icon" /> Form performance
                                        </h3>
                                        <table className="sa-table">
                                            <thead>
                                                <tr>
                                                    <th>Form</th>
                                                    <th className="sa-table__num">Started</th>
                                                    <th className="sa-table__num">Submitted</th>
                                                    <th className="sa-table__num">Completion</th>
                                                    <th className="sa-table__bar" />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {data.formFunnel.map(f => {
                                                    const rate = f.completionRate;
                                                    const rateColor = rate == null ? "rgba(120,120,140,0.5)"
                                                        : rate < 30 ? "rgba(239,68,68,0.85)"
                                                        : rate < 60 ? "rgba(234,179,8,0.85)"
                                                        : "rgba(34,197,94,0.85)";
                                                    return (
                                                        <tr key={f.formId + (f.provider || "")}>
                                                            <td>
                                                                <span className="sa-form-id">{f.formId}</span>
                                                                {f.provider && <span className="sa-form-action">{f.provider}</span>}
                                                            </td>
                                                            <td className="sa-table__num">{f.started.toLocaleString("de-DE")}</td>
                                                            <td className="sa-table__num">{f.submitted.toLocaleString("de-DE")}</td>
                                                            <td className="sa-table__num" style={{ color: rateColor, fontWeight: 600 }}>
                                                                {rate != null ? `${rate}%` : "—"}
                                                            </td>
                                                            <td className="sa-table__bar">
                                                                <MiniBar value={f.submitted} max={data.formFunnel[0]?.started || 1} color={rateColor} />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {!detailLoading && ((data.topRageSelectors || []).length > 0 || (data.topRagePages || []).length > 0) && (
                                    <div className="sa-panel">
                                        <h3 className="sa-panel__title">
                                            <IconCursorClick className="sa-icon" /> Frustration signals
                                            {data.rageClicks?.frustrationRate > 0 && (
                                                <span className="sa-panel__consent-note">
                                                    {data.rageClicks.frustrationRate}% of sessions
                                                </span>
                                            )}
                                        </h3>
                                        {(data.topRageSelectors || []).length > 0 && (
                                            <table className="sa-table">
                                                <thead>
                                                    <tr>
                                                        <th>Element</th>
                                                        <th>ID / Class</th>
                                                        <th className="sa-table__num">Rage clicks</th>
                                                        <th className="sa-table__bar" />
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {data.topRageSelectors.map(s => (
                                                        <tr key={s.selector}>
                                                            <td className="sa-form-id" title={s.selector}>{elementLabel({ tag: s.elementTag })}</td>
                                                            <td className="sa-rage__detail">
                                                                {s.elementId    && <span className="sa-rage__id">#{s.elementId}</span>}
                                                                {s.elementClass && <span className="sa-rage__cls">.{s.elementClass.split(" ").filter(Boolean).join(" .")}</span>}
                                                                {!s.elementId && !s.elementClass && <span className="sa-rage__none">—</span>}
                                                            </td>
                                                            <td className="sa-table__num">{s.clicks.toLocaleString("de-DE")}</td>
                                                            <td className="sa-table__bar">
                                                                <MiniBar value={s.clicks} max={maxRageSelector} color="rgba(var(--sa-bad),0.45)" />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                        {(data.topRagePages || []).length > 0 && (
                                            <table className="sa-table" style={(data.topRageSelectors || []).length > 0 ? { marginTop: "1rem" } : {}}>
                                                <thead>
                                                    <tr>
                                                        <th>Page</th>
                                                        <th className="sa-table__num">Rage clicks</th>
                                                        <th className="sa-table__num">Rate</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {data.topRagePages.map(p => (
                                                        <tr key={p.page}>
                                                            <td className="sa-table__path">{p.page}</td>
                                                            <td className="sa-table__num">{p.rageClicks.toLocaleString("de-DE")}</td>
                                                            <td className="sa-table__num">{p.rate != null ? `${p.rate}%` : "—"}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                )}
                            </div>

                            {data.consentImpact && (
                                <ConsentImpactPanel impact={data.consentImpact} />
                            )}

                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
