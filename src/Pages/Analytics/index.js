const { useState, useEffect, useMemo, useCallback } = React;
const Link = window.ReactRouterDOM.Link;
import {
    analyticsAudiencePath, analyticsAcquisitionPath, analyticsSettingsPath,
} from "../../Functions/domainPathSegments.js";
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import AnalyticsWorldMap from "./AnalyticsWorldMap.js";
import {
    authHeaders, KpiCard, MiniBar, useAnalyticsPage, useAnalyticsReport, useSiteConfig,
    toIsoDate, pctChange, IndustryBenchmarkNote, formatPercent, SegmentFilter, AnalyticsSubNav,
    useForeignDomains,
} from "./_shared.js";
import {
    IconBarChart, IconUsers, IconShieldCheck, IconGlobe, IconTrendingUp,
    IconDocument, IconRadio, IconTarget, IconMegaphone, IconCash, IconExternalLink, IconCursorClick,
    IconScrollDepth,
} from "./Icons.js";
import "./Analytics.css";

const LIVE_URL = `${ScannerHost}/api/analytics-live`;
const LIVE_INTERVAL = 30;

function timeAgo(isoString) {
    const diff = Math.floor((Date.now() - new Date(isoString)) / 1000);
    if (diff < 60) return diff + "s";
    return Math.floor(diff / 60) + "m";
}


function LivePanel({ domain, siteKey, engagedUsers }) {
    const [data,      setData]    = useState(null);
    const [open,      setOpen]    = useState(true);
    const [countdown, setCountdown] = useState(LIVE_INTERVAL);

    const fetchLive = useCallback(async () => {
        if (!domain) return;
        try {
            // Prefer ?site= (site key) — avoids the domain-lookup step and any
            // domain-matching mismatch. Fall back to ?domain= if key isn't known yet.
            const qs = siteKey
                ? `site=${encodeURIComponent(siteKey)}`
                : `domain=${encodeURIComponent(domain)}`;
            const r = await fetch(`${LIVE_URL}?${qs}`, { headers: authHeaders() });
            if (r.ok) setData(await r.json());
        } catch {}
        setCountdown(LIVE_INTERVAL);
    }, [domain, siteKey]);

    useEffect(() => {
        fetchLive();
        const poll = setInterval(fetchLive, LIVE_INTERVAL * 1000);
        return () => clearInterval(poll);
    }, [fetchLive]);

    useEffect(() => {
        const tick = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
        return () => clearInterval(tick);
    }, []);

    if (!domain || !data || data.noSiteKey) return null;

    const maxBar = Math.max(...(data.perMinute || [1]), 1);
    const consentPct = data.total > 0 ? Math.round((data.full / data.total) * 100) : 0;

    return (
        <div className="sa-live">
            {/* ── Header ── */}
            <div className="sa-live__header" onClick={() => setOpen(o => !o)} role="button" aria-expanded={open}>
                <div className="sa-live__title">
                    <span className="sa-live__dot" />
                    <span className="sa-live__label">Live</span>
                    <span className="sa-live__window">last 30 min</span>
                </div>
                <div className="sa-live__right">
                    <span className="sa-live__countdown">
                        {open ? `${countdown}s` : `${data.total} events`}
                    </span>
                    <button type="button" className="sa-live__toggle" aria-label={open ? "Collapse" : "Expand"}>
                        {open ? "▲" : "▼"}
                    </button>
                </div>
            </div>

            {open && (
                <div className="sa-live__body">

                    {/* ── Sparkline ── */}
                    <div className="sa-live__sparkline">
                        <div className="sa-live__spark-hd">
                            <span className="sa-live__spark-label">Events / min</span>
                            <span className="sa-live__spark-peak">{maxBar} peak</span>
                        </div>
                        <div className="sa-live__spark-bars">
                            {(data.perMinute || []).map((v, i) => (
                                <div
                                    key={i}
                                    className={"sa-live__spark-bar" + (i === (data.perMinute.length - 1) ? " sa-live__spark-bar--last" : "")}
                                    style={{ height: Math.max(3, Math.round((v / maxBar) * 44)) + "px" }}
                                    title={`${v} event${v !== 1 ? "s" : ""}`}
                                />
                            ))}
                        </div>
                        <div className="sa-live__spark-times">
                            <span>−30m</span>
                            <span>−15m</span>
                            <span>now</span>
                        </div>
                    </div>

                    {/* ── 2 × 2 KPI grid ── */}
                    <div className="sa-live__kpis">
                        <div className="sa-live__kpi">
                            <span className="sa-live__kpi-label">Active users</span>
                            <span className="sa-live__kpi-value">{(engagedUsers ?? 0).toLocaleString("de-DE")}</span>
                            <span className="sa-live__kpi-sub">in period</span>
                        </div>
                        <div className="sa-live__kpi">
                            <span className="sa-live__kpi-label">Events</span>
                            <span className="sa-live__kpi-value">{data.total.toLocaleString("de-DE")}</span>
                            <span className="sa-live__kpi-sub">{data.minimal}m · {data.full}f</span>
                        </div>
                        <div className="sa-live__kpi">
                            <span className="sa-live__kpi-label">Sessions</span>
                            <span className="sa-live__kpi-value">{data.sessions.toLocaleString("de-DE")}</span>
                            <span className="sa-live__kpi-sub">consent-gated</span>
                        </div>
                        <div className="sa-live__kpi sa-live__kpi--consent" style={{ '--cpct': consentPct + '%' }}>
                            <span className="sa-live__kpi-label">Consent</span>
                            <span className="sa-live__kpi-value">{consentPct}%</span>
                            <span className="sa-live__kpi-sub">this window</span>
                        </div>
                    </div>

                    {/* ── Recent event feed ── */}
                    <div className="sa-live__feed-wrap">
                        <p className="sa-live__section-title">Recent events</p>
                        <div className="sa-live__feed">
                            {(data.recent || []).slice(0, 12).map((e, i) => (
                                <div key={i} className={"sa-live__event" + (e.eventName ? " sa-live__event--custom" : "")}>
                                    <span className="sa-live__event-path" title={e.host ? `${e.host}${e.path}` : e.path}>
                                        {e.eventName
                                            ? <span className="sa-live__event-name">{e.eventName.replace(/_/g, " ")}</span>
                                            : <>{e.host && e.host !== domain ? `${e.host}` : ""}{e.path}</>
                                        }
                                    </span>
                                    <div className="sa-live__event-meta">
                                        {e.country && <span className="sa-live__event-flag">{e.country}</span>}
                                        <span className={"sa-live__event-level sa-live__event-level--" + e.level}>
                                            {e.level}
                                        </span>
                                        <span className="sa-live__event-time">{timeAgo(e.at)}</span>
                                    </div>
                                </div>
                            ))}
                            {!data.recent?.length && !data.trackerMismatch && (
                                <p style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem", margin: 0 }}>No events yet</p>
                            )}
                            {data.trackerMismatch && (
                                <p style={{ color: "#e06c2b", fontSize: "0.8rem", margin: 0, lineHeight: 1.4 }}>
                                    Tracker is sending events under a different site key — the script tag on <strong>{domain}</strong> likely has a stale or wrong <code>data-site</code> value. Check Analytics Settings → Script.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* ── Conversions in last 30 min ── */}
                    <div className="sa-live__conversions-wrap">
                        <p className="sa-live__section-title">
                            Conversions
                            {data.conversions?.length > 0 && (
                                <span className="sa-live__conv-total">
                                    {data.conversions.reduce((s, c) => s + c.count, 0)} total
                                </span>
                            )}
                        </p>
                        {data.conversions?.length > 0 ? (
                            <div className="sa-live__conv-list">
                                {data.conversions.map(c => (
                                    <div key={c.name} className="sa-live__conv-row">
                                        <span className="sa-live__conv-label" title={c.name}>{c.label}</span>
                                        <div className="sa-live__conv-right">
                                            {c.valueCents != null && (
                                                <span className="sa-live__conv-value">
                                                    {c.currency === "DKK" || c.currency === "SEK" || c.currency === "NOK" ? "kr " : c.currency === "USD" ? "$" : c.currency === "GBP" ? "£" : "€"}
                                                    {(c.valueCents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            )}
                                            <span className="sa-live__conv-count">{c.count}×</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="sa-live__conv-empty">No conversions in this window</p>
                        )}
                    </div>

                    {/* ── Multi-host notice ── */}
                    {data.topHosts && data.topHosts.length > 1 && (
                        <div className="sa-live__hosts">
                            <p className="sa-live__section-title">
                                Cross-site hosts
                                <span className="sa-panel__consent-note"> — multiple origins</span>
                            </p>
                            <table className="sa-table">
                                <tbody>
                                    {data.topHosts.map(h => (
                                        <tr key={h.host}>
                                            <td className="sa-table__path" title={h.host}>{h.host}</td>
                                            <td className="sa-table__num">{h.views}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

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

const BT_LABELS = {
    ecommerce: "E-commerce",
    b2b:       "B2B / SaaS",
    media:     "Media & Content",
    local:     "Local Business",
};

function fmtRevenue(amount, currency = "EUR") {
    const SYM = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF ", DKK: "kr ", SEK: "kr ", NOK: "kr " };
    const sym = SYM[currency] ?? (currency + " ");
    if (amount >= 1_000_000) return sym + (amount / 1_000_000).toFixed(2) + "M";
    if (amount >= 1_000)     return sym + (amount / 1_000).toFixed(1) + "k";
    return sym + Number(amount).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function KpiStrip({ data, siteConfig, trendEngaged, trendEvents, trendSessions, trendConsent, trendBounce, customCards, onCustomize }) {
    const bt          = siteConfig?.businessType || "";
    const hasRevenue  = data.totals.revenue != null && data.totals.revenue > 0;
    const hasLeads    = data.totals.qualityLeads !== null;
    const consentPct  = data.totals.consentRate;
    const currency    = data.totals.revenueCurrency || "EUR";

    const bounceRate = data.totals.uniqueSessions > 0
        ? ((data.totals.uniqueSessions - data.totals.engagedUsers) / data.totals.uniqueSessions) * 100
        : null;

    const CARDS = {
        revenue: (
            <KpiCard key="revenue"
                icon={<IconCash />}
                label="Revenue"
                value={fmtRevenue(data.totals.revenue, currency)}
                sub={data.totals.transactions ? `${data.totals.transactions.toLocaleString("de-DE")} transactions` : "ecommerce events"}
                variant="revenue"
            />
        ),
        users: (
            <KpiCard key="users"
                icon={<IconRadio />}
                label="Active users"
                value={data.totals.engagedUsers.toLocaleString("de-DE")}
                sub="engaged: 10s+, clicked, or 2+ pages"
                variant="live"
                trend={trendEngaged}
            />
        ),
        bounce: (
            <KpiCard key="bounce"
                icon={<IconScrollDepth />}
                label="Bounce rate"
                value={bounceRate != null ? formatPercent(bounceRate) : "—"}
                sub="sessions with no engagement"
                variant={bounceRate != null && bounceRate > 60 ? "warn" : "blue"}
                trend={trendBounce != null ? -trendBounce : undefined}
            />
        ),
        events: (
            <KpiCard key="events"
                icon={<IconBarChart />}
                label={bt === "media" ? "Page views" : "Total events"}
                value={data.totals.total.toLocaleString("de-DE")}
                sub={`${data.totals.minimal.toLocaleString("de-DE")} minimal · ${data.totals.full.toLocaleString("de-DE")} full`}
                variant="blue"
                trend={trendEvents}
            />
        ),
        sessions: (
            <KpiCard key="sessions"
                icon={<IconUsers />}
                label="Unique sessions"
                value={data.totals.uniqueSessions.toLocaleString("de-DE")}
                sub="consent-gated sessions only"
                variant="purple"
                trend={trendSessions}
            />
        ),
        consent: (
            <KpiCard key="consent"
                icon={<IconShieldCheck />}
                label="Consent rate"
                value={formatPercent(consentPct)}
                sub="statisticCookies accepted"
                variant={consentPct < 20 ? "warn" : "live"}
                trend={trendConsent}
            >
                <IndustryBenchmarkNote benchmark={data.industryBenchmark} actualPct={consentPct} />
            </KpiCard>
        ),
        countries: (
            <KpiCard key="countries"
                icon={<IconGlobe />}
                label="Countries"
                value={data.countries.length}
                sub={data.countries[0] ? `Top: ${data.countries[0].code}` : null}
                variant="teal"
            />
        ),
        leads: (
            <KpiCard key="leads"
                icon={<IconTarget />}
                label="Quality leads"
                value={(data.totals.qualityLeads ?? 0).toLocaleString("de-DE")}
                sub="engaged + page/event match"
                variant="live"
            />
        ),
    };

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
        default:
            defaultOrder = ["users", "events", "sessions", "consent", "countries"];
            if (hasLeads)   defaultOrder.push("leads");
            if (hasRevenue) defaultOrder.push("revenue");
    }

    const order = customCards || defaultOrder;
    const cards = order.map(id => CARDS[id]).filter(Boolean);
    const cls = cards.length >= 6 ? "sa-kpi-strip sa-kpi-strip--6" : "sa-kpi-strip";

    return (
        <div className="sa-kpi-strip-wrap">
            <div className={cls}>{cards}</div>
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
                    <span className="sa-ci-kpi__label">Consent rate</span>
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

// ── Main overview page ────────────────────────────────────────────────────────
export default function SiteAnalytics() {
    document.title = "Site Analytics | Intastellar Consents";

    const {
        domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate,
        tick, setTick, data, loading, error, showSetup, showData, segment, setSegment,
    } = useAnalyticsPage();

    // Previous period of the same length, immediately preceding the current
    // range — powers the "vs previous period" trend chips on the KPI cards.
    const prevRange = useMemo(() => {
        const spanMs = toDate.getTime() - fromDate.getTime();
        const prevTo = new Date(fromDate.getTime() - 24 * 60 * 60 * 1000);
        const prevFrom = new Date(prevTo.getTime() - spanMs);
        return { fromIso: toIsoDate(prevFrom), toIso: toIsoDate(prevTo) };
    }, [fromDate, toDate]);
    const { data: prevData } = useAnalyticsReport(domain, prevRange.fromIso, prevRange.toIso, tick);

    const siteConfig    = useSiteConfig(domain);
    const { domains: foreignDomains } = useForeignDomains(domain);
    const pendingForeignDomains = foreignDomains.filter(d => !d.approved);

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
                title="Site Analytics"
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
            />
            <div className="dashboard-content">
                <div className="sa-page">

                    <AnalyticsSubNav domain={domain} />

                    {data && !data.noSiteKey && (
                        <div className="sa-meta-row">
                            <span className="sa-site-key-badge">
                                Site key: <code>{data.siteId}</code>
                            </span>
                            <SegmentFilter segment={segment} setSegment={setSegment} />
                        </div>
                    )}

                    {!domain && (
                        <p className="sa-notice">Select a specific domain in the header to view analytics.</p>
                    )}
                    {domain && loading && (
                        <p className="sa-notice">Loading&hellip;</p>
                    )}
                    {domain && error && (
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
                                Receiving signals from {pendingForeignDomains.length === 1
                                    ? <><strong>{pendingForeignDomains[0].domain}</strong> — an unrecognized domain</>
                                    : <><strong>{pendingForeignDomains.length} unrecognized domains</strong></>
                                }. Tracking is paused until approved.
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

                            {/* ── KPI strip (business-type-aware, customizable) ─── */}
                            <KpiStrip
                                data={data}
                                siteConfig={siteConfig}
                                trendEngaged={trendEngaged}
                                trendEvents={trendEvents}
                                trendSessions={trendSessions}
                                trendConsent={trendConsent}
                                trendBounce={trendBounce}
                                customCards={customCards}
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

                            {/* ── Main: chart (60 %) + live feed (40 %) ──────────── */}
                            <div className="sa-overview-main">
                                <div className="sa-chart-section">
                                    <div className="sa-chart-section__hd">
                                        <h3 className="sa-chart-section__title">
                                            <IconTrendingUp className="sa-icon" /> Events per day
                                        </h3>
                                        <span className="sa-chart-section__period">Last {getLastDays} days</span>
                                    </div>
                                    <AreaChart daily={data.daily} />
                                </div>
                                <LivePanel domain={domain} siteKey={siteConfig?.id} engagedUsers={data.totals.engagedUsers} />
                            </div>

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
                                                        <MiniBar value={c.events} max={maxCountry} color="rgba(96,165,250,0.55)" />
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
                                                            style={{ width: pct + "%", background: "rgba(192,159,83,0.55)" }}
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
                                        <span className="sa-panel__consent-note">full events only</span>
                                    </h3>
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
                                                        <MiniBar value={r.events} max={maxReferrer} color="rgba(96,165,250,0.55)" />
                                                    </td>
                                                </tr>
                                            ))}
                                            {!data.referrers.length && (
                                                <tr><td colSpan={4} style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem" }}>No data yet</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                    <Link className="sa-panel__footer-link" to={analyticsAcquisitionPath(domain)}>View traffic acquisition →</Link>
                                </div>

                                <div className="sa-panel">
                                    <h3 className="sa-panel__title"><IconDocument className="sa-icon" /> Top pages</h3>
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

                                {(data.topOutbound || []).length > 0 && (
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
                                                            <MiniBar value={o.clicks} max={maxOutbound} color="rgba(99,102,241,0.5)" />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {(data.formFunnel || []).length > 0 && (
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

                                {((data.topRageSelectors || []).length > 0 || (data.topRagePages || []).length > 0) && (
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
                                                            <td className="sa-form-id">{s.selector}</td>
                                                            <td className="sa-rage__detail">
                                                                {s.elementId    && <span className="sa-rage__id">#{s.elementId}</span>}
                                                                {s.elementClass && <span className="sa-rage__cls">.{s.elementClass.split(" ").filter(Boolean).join(" .")}</span>}
                                                                {!s.elementId && !s.elementClass && <span className="sa-rage__none">—</span>}
                                                            </td>
                                                            <td className="sa-table__num">{s.clicks.toLocaleString("de-DE")}</td>
                                                            <td className="sa-table__bar">
                                                                <MiniBar value={s.clicks} max={maxRageSelector} color="rgba(239,68,68,0.45)" />
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
