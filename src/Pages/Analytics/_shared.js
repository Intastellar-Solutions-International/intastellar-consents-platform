const { useState, useEffect, useContext, useMemo, useCallback } = React;
const useParams  = window.ReactRouterDOM.useParams;
const Link       = window.ReactRouterDOM.Link;
const useLocation = window.ReactRouterDOM.useLocation;
import { ScannerHost } from "../../API/host.js";
import Authentication from "../../Authentication/Auth.js";
import { DomainContext, WorkspaceContext, DateRangeContext } from "../../App.js";
import {
    useSyncDomainFromRoute, isCombinedOrClearDomain,
    analyticsPath, analyticsAudiencePath, analyticsAcquisitionPath,
    analyticsConsentPath, analyticsAdSpendPath, analyticsAttributionPath,
    analyticsConversionsPath, analyticsHeatmapPath, analyticsFormsPath,
    analyticsPerformancePath, analyticsPageWeightPath, analyticsDigestPath,
} from "../../Functions/domainPathSegments.js";
import { ymdLocal } from "../../Components/Filter/filterDatePresets.js";

export function authHeaders() {
    return {
        Authorization: Authentication.getToken(),
        Organisation:  String(Authentication.getOrganisation()),
        "Content-Type": "application/json",
    };
}

// Local calendar date, not UTC — `d` is always a local-midnight Date (from
// the date picker or a `new Date()` default), so converting via
// `.toISOString()` shifts it a day in either direction depending on the
// viewer's UTC offset (e.g. a CEST/UTC+2 user's local midnight is still
// "yesterday" in UTC). ymdLocal() reads the local getters instead.
export function toIsoDate(d) {
    return ymdLocal(d);
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
    const [data,          setData]          = useState(() => {
        const key = segCacheKey(domain, fromIso, toIso, segment);
        if (!domain || tick !== 0) return null;
        const hit = reportCache.get(key);
        return hit && (Date.now() - hit.ts < REPORT_CACHE_TTL_MS) ? hit.data : null;
    });
    const [loading,       setLoading]       = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [error,         setError]         = useState(null);

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
        setDetailLoading(true);
        setError(null);

        const params = { domain, from: fromIso, to: toIso };
        if (segment?.device)  params.seg_device  = segment.device;
        if (segment?.country) params.seg_country = segment.country;
        if (segment?.channel) params.seg_channel = segment.channel;
        if (segment?.consent) params.seg_consent = segment.consent;
        const qs = new URLSearchParams(params).toString();
        const headers = authHeaders();

        let ignore = false;

        // Fast call — shows KPIs, pages, acquisition, consent immediately
        const fastP = fetch(`${ScannerHost}/api/analytics-report?${qs}`, { headers })
            .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });

        // Slow call — CTE-heavy: interests, conversions funnels, rage clicks, forms
        const slowP = fetch(`${ScannerHost}/api/analytics-report-detail?${qs}`, { headers })
            .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
            .catch(() => null); // soft failure — UI degrades gracefully

        // Show fast data the moment it arrives
        fastP
            .then(fast => { if (!ignore) { setData(fast); setLoading(false); } })
            .catch(() => {
                if (!ignore) { setError("Could not load analytics data."); setLoading(false); setDetailLoading(false); }
            });

        // Merge both when settled — write to cache only when complete
        Promise.allSettled([fastP, slowP]).then(([fastResult, slowResult]) => {
            if (ignore) return;
            if (fastResult.status !== "fulfilled") { setDetailLoading(false); return; }
            const fast = fastResult.value;
            const slow = slowResult.status === "fulfilled" ? slowResult.value : null;
            const merged = slow ? { ...fast, ...slow } : fast;
            reportCache.set(key, { data: merged, ts: Date.now() });
            setData(merged);
            setDetailLoading(false);
        });

        return () => { ignore = true; };
    }, [domain, fromIso, toIso, tick, segment?.device, segment?.country, segment?.channel, segment?.consent]); // eslint-disable-line react-hooks/exhaustive-deps

    return { data, loading, detailLoading, error };
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

// Fallback only, for a consumer rendered without the real DateRangeContext
// Provider (App.js) above it — e.g. in isolation/tests. The real app always
// has the Provider, so these module-load-time values are never what an
// actual user sees; computed once rather than per-render since that's all
// a fallback needs.
const DEFAULT_FROM_DATE = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
const DEFAULT_TO_DATE = new Date();

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

    // Shared across every analytics tab via DateRangeContext (App.js) — see
    // docs/analytics-audit-plan.md item 12. Previously each page's own call
    // to this hook held getLastDays/fromDate/toDate in local useState, so
    // switching tabs silently reset the range to the hardcoded 30-day
    // default every time. Same three independent values/setters as before
    // (Filter/the date picker already calls each one separately), just
    // lifted to one shared place instead of duplicated per page.
    const [dateRange, setDateRange] = useContext(DateRangeContext);
    const getLastDays = dateRange?.getLastDays ?? 30;
    const fromDate = dateRange?.fromDate ?? DEFAULT_FROM_DATE;
    const toDate   = dateRange?.toDate   ?? DEFAULT_TO_DATE;
    const setLastDays = useCallback(
        (days) => setDateRange(dr => ({ ...(dr || {}), getLastDays: days })),
        [setDateRange]
    );
    const setFromDate = useCallback(
        (d) => setDateRange(dr => ({ ...(dr || {}), fromDate: d })),
        [setDateRange]
    );
    const setToDate = useCallback(
        (d) => setDateRange(dr => ({ ...(dr || {}), toDate: d })),
        [setDateRange]
    );

    const fromIso = useMemo(() => toIsoDate(fromDate), [fromDate]);
    const toIso   = useMemo(() => toIsoDate(toDate),   [toDate]);

    const [segment, setSegment] = useState({ device: null, country: "", channel: null, consent: null });

    return { handle, domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate, fromIso, toIso, segment, setSegment };
}

// Fetches the property-rollup endpoint for a list of domains (workspace combined view).
// Returns the same {data, loading, detailLoading, error} shape as useAnalyticsReport so
// useAnalyticsPage() can switch between the two transparently.
function usePropertyReport(domains, fromIso, toIso, tick) {
    const domainsKey = (domains || []).slice().sort().join(",");
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState(null);

    useEffect(() => {
        if (!domainsKey) { setData(null); return; }
        let ignore = false;
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({ domains: domainsKey, from: fromIso, to: toIso }).toString();
        fetch(`${ScannerHost}/api/analytics-property-report?${qs}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(json => { if (!ignore) { setData(json); setLoading(false); } })
            .catch(() => {
                if (!ignore) { setError("Could not load property analytics."); setLoading(false); }
            });
        return () => { ignore = true; };
    }, [domainsKey, fromIso, toIso, tick]); // eslint-disable-line react-hooks/exhaustive-deps

    return { data, loading, detailLoading: false, error };
}

// Chrome + the standard useAnalyticsReport() call, for pages that fetch the
// same report shape (KPIs/daily/countries/...) and nothing more bespoke.
// When a workspace combined view is active the property rollup endpoint is
// used instead so analytics pages display rolled-up data across all member
// domains without any changes to individual page components.
export function useAnalyticsPage() {
    const chrome = useAnalyticsPageChrome();
    const [activeWorkspace] = useContext(WorkspaceContext);
    const [tick, setTick] = useState(0);
    const segParam = useMemo(() => {
        const s = chrome.segment;
        const hasAny = s.device || s.country || s.channel || s.consent;
        return hasAny ? s : null;
    }, [chrome.segment]);

    // When workspace combined view is active, domain is null — derive the
    // domain list from the active workspace and call the rollup endpoint.
    const workspaceDomains = useMemo(() => {
        if (chrome.domain) return null; // single-domain mode — skip rollup
        if (!activeWorkspace?.domains?.length) return null;
        return activeWorkspace.domains.map(d => d.domain || d).filter(Boolean);
    }, [chrome.domain, activeWorkspace]);

    const singleResult   = useAnalyticsReport(chrome.domain, chrome.fromIso, chrome.toIso, tick, segParam);
    const propertyResult = usePropertyReport(workspaceDomains, chrome.fromIso, chrome.toIso, tick);

    const { data, loading, detailLoading, error } = workspaceDomains ? propertyResult : singleResult;

    const isPropertyRollup = !!workspaceDomains;
    // `hasDomain` is true when either a single domain or a workspace rollup is
    // active — use this in place of the bare `domain` boolean in UI guards so
    // analytics pages show data for workspace combined views too.
    const hasDomain = !!chrome.domain || isPropertyRollup;

    const showSetup = !loading && data && (data.noSiteKey || data.noData);
    const showData  = !loading && data && !data.noSiteKey && !data.noData;

    return { ...chrome, tick, setTick, data, loading, detailLoading, error, showSetup, showData, isPropertyRollup, hasDomain };
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

// One canonical symbol map + locale (de-DE, matching formatPercent/every
// count on the dashboard) instead of the ~7 near-duplicate, subtly
// different copies this used to be spread across (AdSpend.js,
// ConversionCampaigns.js, ReportBuilder.js, ReportView.js, index.js each
// had their own CURRENCY_SYMBOLS map, and ConversionAttribution.js used
// Intl.NumberFormat("en-GB", ...) entirely — a different locale's
// thousands/decimal punctuation from everything else on the page). See
// docs/analytics-audit-plan.md item 12. Pass `cents: true` for a
// value_cents-style integer amount.
export const CURRENCY_SYMBOLS = {
    EUR: "€", USD: "$", GBP: "£", CHF: "CHF ",
    DKK: "kr ", SEK: "kr ", NOK: "kr ", PLN: "zł ",
    AUD: "A$", CAD: "C$", SGD: "S$",
};

export function formatCurrency(amount, currency, { cents = false } = {}) {
    const value = cents ? Number(amount || 0) / 100 : Number(amount || 0);
    const symbol = CURRENCY_SYMBOLS[currency] ?? (currency ? currency + " " : "");
    return `${symbol}${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// One shared number formatter, de-DE locale throughout (same reasoning as
// formatPercent/formatCurrency above) — BandLineChart's y-axis labels
// (Performance.js) used to abbreviate with an English-style "1.1k" (period
// decimal) right next to other dashboard numbers formatted "9.829" (de-DE,
// period thousands-separator) — same digit shape, opposite punctuation
// meaning. `abbreviate: true` now abbreviates in the same de-DE convention
// ("1,1k") instead of switching locale conventions entirely. See
// docs/analytics-audit-plan.md item 12.
export function formatCount(n, { abbreviate = false } = {}) {
    if (n == null || !Number.isFinite(n)) return "—";
    if (abbreviate && Math.abs(n) >= 1000) {
        return (n / 1000).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "k";
    }
    return Math.round(n).toLocaleString("de-DE");
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

// Shimmer placeholder shown while the slow analytics-report-detail call loads.
// `rows` controls how many skeleton lines to render inside the panel.
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
                placeholder="Country"
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

// ── Foreign domain signals ────────────────────────────────────────────────────

// The foreign-domains list itself is all-time (api/analytics-foreign-domains.js's
// GET has no date filter), so without this, the Overview banner's count mixes
// in domains that haven't been seen in weeks alongside ones seen today — see
// docs/analytics-audit-plan.md item 4. Pulled out as a pure function (used by
// a useMemo in index.js) so the split itself is unit-testable without
// mounting the component.
export function splitForeignDomainsByRecency(domains, fromDate) {
    const recent = domains.filter(d => d.last_seen && new Date(d.last_seen) >= fromDate);
    return { recent, olderCount: domains.length - recent.length };
}

export function useForeignDomains(domain) {
    const [domains, setDomains] = useState([]);
    const [reload, setReload] = useState(0);
    useEffect(() => {
        if (!domain) { setDomains([]); return; }
        fetch(`${ScannerHost}/api/analytics-foreign-domains?domain=${encodeURIComponent(domain)}`,
            { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { domains: [] })
            .then(d => setDomains(d.domains || []))
            .catch(() => {});
    }, [domain, reload]);
    return { domains, refresh: () => setReload(n => n + 1) };
}

// ── Site config (businessType, industry, etc.) ────────────────────────────────
export function useSiteConfig(domain) {
    const [config, setConfig] = useState(null);
    useEffect(() => {
        if (!domain) { setConfig(null); return; }
        fetch(`${ScannerHost}/api/analytics-site?domain=${encodeURIComponent(domain)}`,
            { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (!d || d.noSiteKey) { setConfig(null); return; }
                setConfig({ ...d, businessType: d.business_type ?? d.businessType ?? null });
            })
            .catch(() => {});
    }, [domain]);
    return config;
}

// ── Analytics section quick-nav (shared across all Analytics pages) ───────────
export function AnalyticsSubNav({ domain }) {
    const { pathname } = useLocation();

    const domainTabs = domain ? [
        { label: "Overview",    path: analyticsPath(domain),          end: true },
        { label: "Audience",    path: analyticsAudiencePath(domain) },
        { label: "Consent",     path: analyticsConsentPath(domain) },
        { label: "Acquisition", path: analyticsAcquisitionPath(domain) },
        { label: "Ad Spend",    path: analyticsAdSpendPath(domain) },
        { label: "Attribution", path: analyticsAttributionPath(domain) },
        { label: "Conversions", path: analyticsConversionsPath(domain) },
        { label: "Forms",       path: analyticsFormsPath(domain) },
        { label: "Performance", path: analyticsPerformancePath(domain) },
        { label: "Page Weight", path: analyticsPageWeightPath(domain) },
        { label: "Heatmap",     path: analyticsHeatmapPath(domain) },
    ] : [];

    // Digest is a portfolio-level tab — always visible regardless of domain selection
    const allTabs = [
        ...domainTabs,
        { label: "Digest", path: analyticsDigestPath(), end: true, portfolio: true },
    ];

    if (!domain && !allTabs.length) return null;

    return (
        <nav className="sa-subnav" aria-label="Analytics sections">
            {allTabs.map(t => {
                const active = t.end
                    ? pathname === t.path || pathname === t.path + '/'
                    : pathname === t.path || pathname.startsWith(t.path + '/');
                return (
                    <Link key={t.path} to={t.path}
                        className={"sa-subnav__tab" + (active ? " sa-subnav__tab--active" : "") + (t.portfolio ? " sa-subnav__tab--portfolio" : "")}>
                        {t.label}
                    </Link>
                );
            })}
        </nav>
    );
}

