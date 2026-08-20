const { useState, useEffect, useContext, useMemo } = React;
const useParams = window.ReactRouterDOM.useParams;
import { ScannerHost } from "../../API/host.js";
import Authentication from "../../Authentication/Auth.js";
import { DomainContext } from "../../App.js";
import { useSyncDomainFromRoute, isCombinedOrClearDomain } from "../../Functions/domainPathSegments.js";

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

export function useAnalyticsReport(domain, fromIso, toIso, tick = 0) {
    const [data,    setData]    = useState(() => cachedReport(domain, fromIso, toIso, tick));
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState(null);

    useEffect(() => {
        if (!domain) { setData(null); return; }

        const fresh = cachedReport(domain, fromIso, toIso, tick);
        if (fresh) { setData(fresh); setError(null); return; }

        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({ domain, from: fromIso, to: toIso }).toString();
        fetch(`${ScannerHost}/api/analytics-report?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                const json = await r.json();
                reportCache.set(`${domain}|${fromIso}|${toIso}`, { data: json, ts: Date.now() });
                setData(json);
            })
            .catch(() => setError("Could not load analytics data."))
            .finally(() => setLoading(false));
    }, [domain, fromIso, toIso, tick]); // eslint-disable-line react-hooks/exhaustive-deps

    return { data, loading, error };
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

    return { handle, domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate, fromIso, toIso };
}

// Chrome + the standard useAnalyticsReport() call, for pages that fetch the
// same report shape (KPIs/daily/countries/...) and nothing more bespoke.
export function useAnalyticsPage() {
    const chrome = useAnalyticsPageChrome();
    const [tick, setTick] = useState(0);
    const { data, loading, error } = useAnalyticsReport(chrome.domain, chrome.fromIso, chrome.toIso, tick);

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

