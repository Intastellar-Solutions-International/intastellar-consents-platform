const { useState, useEffect, useContext, useMemo } = React;
const useParams  = window.ReactRouterDOM.useParams;
const Link       = window.ReactRouterDOM.Link;
const useLocation = window.ReactRouterDOM.useLocation;
import { ScannerHost } from "../../API/host.js";
import Authentication from "../../Authentication/Auth.js";
import { DomainContext } from "../../App.js";
import {
    useSyncDomainFromRoute, isCombinedOrClearDomain,
    analyticsPath, analyticsAudiencePath, analyticsAcquisitionPath,
    analyticsConsentPath, analyticsAdSpendPath, analyticsAttributionPath,
    analyticsConversionsPath, analyticsHeatmapPath,
} from "../../Functions/domainPathSegments.js";

export function authHeaders() {
    return {
        Authorization: Authentication.getToken(),
        Organisation:  String(Authentication.getOrganisation()),
        "Content-Type": "application/json",
    };
}

export function toIsoDate(d) {
    return d.toISOString().slice(0, 10);
}

// Every Analytics sub-page (Overview, Audience, Acquisition, Conversions, ...)
// calls this for the SAME domain+date-range within seconds of each other on
// navigation, but each page is a fresh component mount with no memory of
// what the last one just fetched — without a cache, that's a full ~28-query
// Postgres aggregation re-run from scratch on every single nav, which is
// exactly what shows up as a multi-second "Loading…" on switching sections.
// Keyed module-level (survives across page mounts within the session) with a
// short TTL so it self-heals as new events roll in. `tick` is the existing
// manual-refresh escape hatch (bumped after a mutation like enabling a site
// key) — a bumped tick always bypasses the cache so an explicit refresh
// still means what it says.
const reportCache = new Map(); // `${domain}|${fromIso}|${toIso}` -> { data, ts }
const REPORT_CACHE_TTL_MS = 60000;

function cachedReport(domain, fromIso, toIso, tick) {
    if (!domain || tick !== 0) return null;
    const hit = reportCache.get(`${domain}|${fromIso}|${toIso}`);
    return hit && (Date.now() - hit.ts < REPORT_CACHE_TTL_MS) ? hit.data : null;
}

function segCacheKey(domain, fromIso, toIso, segment) {
    const seg = segment || {};
    return `${domain}|${fromIso}|${toIso}|${seg.device||""}|${seg.country||""}|${seg.channel||""}|${seg.consent||""}`;
}

export function useAnalyticsReport(domain, fromIso, toIso, tick = 0, segment = null) {
    const [data,    setData]    = useState(() => {
        const key = segCacheKey(domain, fromIso, toIso, segment);
        if (!domain || tick !== 0) return null;
        const hit = reportCache.get(key);
        return hit && (Date.now() - hit.ts < REPORT_CACHE_TTL_MS) ? hit.data : null;
    });
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState(null);

    useEffect(() => {
        if (!domain) { setData(null); return; }

        const key = segCacheKey(domain, fromIso, toIso, segment);
        if (tick === 0) {
            const hit = reportCache.get(key);
            if (hit && (Date.now() - hit.ts < REPORT_CACHE_TTL_MS)) {
                setData(hit.data);
                setError(null);
                return;
            }
        }

        setLoading(true);
        setError(null);
        const params = { domain, from: fromIso, to: toIso };
        if (segment?.device)  params.seg_device  = segment.device;
        if (segment?.country) params.seg_country = segment.country;
        if (segment?.channel) params.seg_channel = segment.channel;
        if (segment?.consent) params.seg_consent = segment.consent;
        const qs = new URLSearchParams(params).toString();
        fetch(`${ScannerHost}/api/analytics-report?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                const json = await r.json();
                reportCache.set(key, { data: json, ts: Date.now() });
                setData(json);
            })
            .catch(() => setError("Could not load analytics data."))
            .finally(() => setLoading(false));
    }, [domain, fromIso, toIso, tick, segment?.device, segment?.country, segment?.channel, segment?.consent]); // eslint-disable-line react-hooks/exhaustive-deps

    return { data, loading, error };
}

/**
 * Fetch /api/ad-spend-report for the report builder and viewer.
 * `enabled` should be false when no ad metrics are selected — avoids a
 * network round-trip when the report only uses first-party analytics data.
 */
function readStoredAdCurrency() {
    try { return localStorage.getItem("ia_ad_display_currency") || "EUR"; } catch { return "EUR"; }
}

export function useAdSpendReport(domain, fromIso, toIso, enabled = true) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!enabled || !domain) { setData(null); return; }
        let ignore = false;
        setLoading(true);
        const displayCurrency = readStoredAdCurrency();
        const qs = new URLSearchParams({ from: fromIso, to: toIso, displayCurrency }).toString();
        fetch(`${ScannerHost}/api/ad-spend-report?${qs}`, {
            headers: { ...authHeaders(), Domains: domain },
        })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                const json = await r.json();
                if (!ignore) setData(json?.noConnections ? null : json);
            })
            .catch(() => { if (!ignore) setData(null); })
            .finally(() => { if (!ignore) setLoading(false); });
        return () => { ignore = true; };
    }, [domain, fromIso, toIso, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

    return { data, loading };
}

// Domain resolution + date-range state that's identical across every
// Analytics page — split out from useAnalyticsPage() below so pages with
// their own bespoke data-fetching (Heatmap, Recordings, Bots, ...) can still
// share it without being forced into the useAnalyticsReport() call.
export function useAnalyticsPageChrome() {
    const { handle } = useParams();
    const [globalDomain, setGlobalDomain] = useContext(DomainContext);
    useSyncDomainFromRoute(handle, setGlobalDomain);

    const domain = useMemo(() => {
        if (isCombinedOrClearDomain(globalDomain)) return null;
        return String(globalDomain || "").trim().toLowerCase();
    }, [globalDomain]);

    const [getLastDays, setLastDays] = useState(30);
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d;
    });
    const [toDate, setToDate] = useState(() => new Date());

    const fromIso = useMemo(() => toIsoDate(fromDate), [fromDate]);
    const toIso   = useMemo(() => toIsoDate(toDate),   [toDate]);

    const [segment, setSegment] = useState({ device: null, country: "", channel: null, consent: null });

    return { handle, domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate, fromIso, toIso, segment, setSegment };
}

// Chrome + the standard useAnalyticsReport() call, for pages that fetch the
// same report shape (KPIs/daily/countries/...) and nothing more bespoke.
export function useAnalyticsPage() {
    const chrome = useAnalyticsPageChrome();
    const [tick, setTick] = useState(0);
    const segParam = useMemo(() => {
        const s = chrome.segment;
        const hasAny = s.device || s.country || s.channel || s.consent;
        return hasAny ? s : null;
    }, [chrome.segment]);
    const { data, loading, error } = useAnalyticsReport(chrome.domain, chrome.fromIso, chrome.toIso, tick, segParam);

    const showSetup = !loading && data && (data.noSiteKey || data.noData);
    const showData  = !loading && data && !data.noSiteKey && !data.noData;

    return { ...chrome, tick, setTick, data, loading, error, showSetup, showData };
}

// % change of `current` vs `previous` — null when there's no previous-period
// baseline to compare against (0 or missing), so callers can hide the chip
// instead of showing a misleading "+∞%"/"0%".
export function pctChange(current, previous) {
    if (previous == null || previous === 0) return null;
    if (current == null) return null;
    return ((current - previous) / previous) * 100;
}

export function KpiCard({ icon, label, value, sub, variant, className, trend, children }) {
    return (
        <div className={"sa-kpi" + (variant ? " sa-kpi--" + variant : "") + (className ? " " + className : "")}>
            <div className="sa-kpi__head">
                {icon && <span className="sa-kpi__icon" aria-hidden="true">{icon}</span>}
                <span className="sa-kpi__label">{label}</span>
            </div>
            <span className="sa-kpi__value">
                {value}
                {trend != null && Number.isFinite(trend) && (
                    <span className={"sa-kpi__trend" + (trend >= 0 ? " sa-kpi__trend--up" : " sa-kpi__trend--down")}
                          title="vs. previous period of the same length">
                        {trend >= 0 ? "▲" : "▼"} {formatPercent(Math.abs(trend))}
                    </span>
                )}
            </span>
            {sub && <span className="sa-kpi__sub">{sub}</span>}
            {children}
        </div>
    );
}

export function BarSegment({ pct, color, title }) {
    return (
        <div
            className="sa-bar__seg"
            style={{ width: pct + "%", background: color }}
            title={title}
        />
    );
}

export function ConsentBar({ label, yes, no }) {
    const total = yes + no;
    if (!total) return null;
    const pct = Math.round((yes / total) * 100);
    return (
        <div className="sa-consent-row">
            <span className="sa-consent-row__label">{label}</span>
            <div className="sa-bar">
                <BarSegment pct={pct}       color="rgba(74,222,128,0.75)" title={`Yes: ${yes}`} />
                <BarSegment pct={100 - pct} color="rgba(239,68,68,0.3)"   title={`No: ${no}`}  />
            </div>
            <span className="sa-consent-row__pct">{pct}%</span>
        </div>
    );
}

// Single formatting convention for the whole Analytics dashboard: de-DE
// (period thousands separator, comma decimal separator) — already the
// convention every table on the dashboard uses via .toLocaleString("de-DE")
// for counts. Percentages/rates were inconsistently built with .toFixed()
// or raw string concatenation instead, which always renders a period
// decimal regardless of locale (e.g. "9.8%" next to de-DE counts like
// "1.352") — this is the one place that should be used for any percentage
// or rate shown anywhere on the dashboard.
export function formatPercent(value, digits = 1) {
    if (value == null || !Number.isFinite(value)) return "—";
    return value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + "%";
}

export function formatDuration(seconds) {
    if (seconds == null || !Number.isFinite(seconds)) return "—";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    const oneDecimal = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
    if (seconds < 86400) return `${(seconds / 3600).toLocaleString("de-DE", oneDecimal)}h`;
    return `${(seconds / 86400).toLocaleString("de-DE", oneDecimal)}d`;
}

// Small "ⓘ" hint icon carrying its explanation in the native `title`
// attribute — same lightweight hover-tooltip convention used everywhere
// else in this Analytics directory (plain `title=` on the element itself),
// just made visually discoverable since a label with an invisible title
// attribute gives no hint that it's hoverable.
export function InfoTip({ text }) {
    return (
        <span className="sa-infotip" title={text} aria-label={text}>&#9432;</span>
    );
}

// `benchmark` is the industryBenchmark object returned by /api/analytics-report
// (null when the domain has no industry set in Settings → Analytics Script).
// `actualPct` is the domain's own consent rate for the same period.
export function IndustryBenchmarkNote({ benchmark, actualPct }) {
    if (!benchmark || actualPct == null || !Number.isFinite(actualPct)) return null;
    const diff = actualPct - benchmark.consentRatePct;
    const up = diff >= 0;
    return (
        <div className="sa-benchmark-note">
            <span className="sa-benchmark-note__label">{benchmark.label} avg: {benchmark.consentRatePct}%</span>
            <span className={"sa-benchmark-note__diff" + (up ? " sa-benchmark-note__diff--up" : " sa-benchmark-note__diff--down")}>
                {up ? "▲" : "▼"} {Math.abs(diff).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}pts {up ? "above" : "below"} average
            </span>
            <InfoTip text="Reference estimate, not a live average computed from other customers' traffic. Set the industry in Settings → Analytics Script." />
        </div>
    );
}

export function MiniBar({ value, max, color = "rgba(192,159,83,0.7)" }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
        <div className="sa-mini-bar">
            <div className="sa-mini-bar__fill" style={{ width: pct + "%", background: color }} />
        </div>
    );
}

// Segment filter bar — renders a row of compact dropdowns to filter the
// analytics-report by device, country, traffic channel, and consent level.
// `segment` and `setSegment` come from useAnalyticsPageChrome().
export function SegmentFilter({ segment, setSegment }) {
    function set(k, v) {
        setSegment(s => ({ ...s, [k]: v || null }));
    }

    const hasFilter = segment.device || segment.country || segment.channel || segment.consent;

    return (
        <div className="sa-seg-filter">
            <span className="sa-seg-filter__label">Filter</span>

            <select className="sa-seg-filter__select"
                value={segment.device || ""}
                onChange={e => set("device", e.target.value)}>
                <option value="">All devices</option>
                <option value="desktop">Desktop</option>
                <option value="mobile">Mobile</option>
                <option value="tablet">Tablet</option>
                <option value="other">Other</option>
            </select>

            <select className="sa-seg-filter__select"
                value={segment.channel || ""}
                onChange={e => set("channel", e.target.value)}>
                <option value="">All channels</option>
                <option value="organic">Organic</option>
                <option value="paid">Paid</option>
                <option value="paid_social">Paid Social (Meta)</option>
                <option value="referral">Referral</option>
                <option value="direct">Direct</option>
            </select>

            <select className="sa-seg-filter__select"
                value={segment.consent || ""}
                onChange={e => set("consent", e.target.value)}>
                <option value="">All consent</option>
                <option value="full">Full consent</option>
                <option value="minimal">Minimal consent</option>
            </select>

            <input
                className="sa-seg-filter__country"
                type="text"
                maxLength={2}
                placeholder="Country (e.g. DE)"
                value={segment.country || ""}
                onChange={e => setSegment(s => ({ ...s, country: e.target.value.toUpperCase().slice(0, 2) }))}
            />

            {hasFilter && (
                <button className="sa-seg-filter__clear"
                    onClick={() => setSegment({ device: null, country: "", channel: null, consent: null })}>
                    Clear
                </button>
            )}
        </div>
    );
}

// ── Site config (businessType, industry, etc.) ────────────────────────────────
export function useSiteConfig(domain) {
    const [config, setConfig] = useState(null);
    useEffect(() => {
        if (!domain) { setConfig(null); return; }
        fetch(`${ScannerHost}/api/analytics-site?domain=${encodeURIComponent(domain)}`,
            { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => setConfig(d || null))
            .catch(() => {});
    }, [domain]);
    return config;
}

// ── Analytics section quick-nav (shared across all Analytics pages) ───────────
export function AnalyticsSubNav({ domain }) {
    const { pathname } = useLocation();
    if (!domain) return null;

    const tabs = [
        { label: "Overview",    path: analyticsPath(domain),          end: true },
        { label: "Audience",    path: analyticsAudiencePath(domain) },
        { label: "Consent",     path: analyticsConsentPath(domain) },
        { label: "Acquisition", path: analyticsAcquisitionPath(domain) },
        { label: "Ad Spend",    path: analyticsAdSpendPath(domain) },
        { label: "Attribution", path: analyticsAttributionPath(domain) },
        { label: "Conversions", path: analyticsConversionsPath(domain) },
        { label: "Heatmap",     path: analyticsHeatmapPath(domain) },
    ];

    return (
        <nav className="sa-subnav" aria-label="Analytics sections">
            {tabs.map(t => {
                const active = t.end
                    ? pathname === t.path || pathname === t.path + '/'
                    : pathname === t.path || pathname.startsWith(t.path + '/');
                return (
                    <Link key={t.path} to={t.path}
                        className={"sa-subnav__tab" + (active ? " sa-subnav__tab--active" : "")}>
                        {t.label}
                    </Link>
                );
            })}
        </nav>
    );
}

