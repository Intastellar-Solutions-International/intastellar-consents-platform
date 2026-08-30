const { useState, useEffect, useMemo, useRef } = React;
const useParams  = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { useAnalyticsPageChrome, authHeaders, MiniBar, formatPercent } from "./_shared.js";
import { analyticsPerformancePath, analyticsPerformanceCountryPath } from "../../Functions/domainPathSegments.js";
import { IconBarChart, IconTarget, IconScrollDepth, IconGlobe, IconClock, IconAlertTriangle } from "./Icons.js";
import TrendLineChart from "./TrendLineChart.js";
import "./Analytics.css";

// ── CWV thresholds ────────────────────────────────────────────────────────
const THRESHOLDS = {
    lcp:  { good: 2500, poor: 4000, unit: "ms" },
    cls:  { good: 0.1,  poor: 0.25, unit: "" },
    inp:  { good: 200,  poor: 500,  unit: "ms" },
    fcp:  { good: 1800, poor: 3000, unit: "ms" },
    ttfb: { good: 800,  poor: 1800, unit: "ms" },
    load: { good: 3000, poor: 6000, unit: "ms" },
};

function cwvRating(metric, value) {
    if (value == null) return null;
    const t = THRESHOLDS[metric];
    if (!t) return null;
    if (value < t.good) return "good";
    if (value < t.poor) return "needs-improvement";
    return "poor";
}

const RATING_COLOR = {
    "good":             "rgba(34,197,94,0.9)",
    "needs-improvement":"rgba(234,179,8,0.9)",
    "poor":             "rgba(239,68,68,0.9)",
};
const RATING_LABEL = {
    "good":             "Good",
    "needs-improvement":"Needs improvement",
    "poor":             "Poor",
};

function fmtMs(v) {
    if (v == null) return "—";
    if (v >= 1000) return (v / 1000).toFixed(1).replace(".", ",") + " s";
    return Math.round(v).toLocaleString("de-DE") + " ms";
}
function fmtCls(v) {
    if (v == null) return "—";
    return v.toFixed(3).replace(".", ",");
}
function fmtMetric(metric, value) {
    if (value == null) return "—";
    return metric === "cls" ? fmtCls(value) : fmtMs(value);
}

function MetricValue({ metric, value }) {
    const rating = cwvRating(metric, value);
    const color  = RATING_COLOR[rating];
    return (
        <span style={color ? { color, fontWeight: 700 } : {}}>
            {fmtMetric(metric, value)}
        </span>
    );
}

// ── Data fetching ─────────────────────────────────────────────────────────
function usePerfReport(domain, fromIso, toIso, country) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!domain) { setData(null); return; }
        let ignore = false;
        setLoading(true);
        const qp = { domain, from: fromIso, to: toIso };
        if (country) qp.country = country;
        const qs = new URLSearchParams(qp).toString();
        fetch(`${ScannerHost}/api/analytics-performance?${qs}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (!ignore) setData(d); })
            .catch(() => { if (!ignore) setData(null); })
            .finally(() => { if (!ignore) setLoading(false); });
        return () => { ignore = true; };
    }, [domain, fromIso, toIso, country]);

    return { data, loading };
}

// ── Country helpers ───────────────────────────────────────────────────────
function countryFlag(code) {
    if (!code || code.length !== 2) return "🌐";
    try {
        return String.fromCodePoint(
            0x1F1E6 + code.charCodeAt(0) - 65,
            0x1F1E6 + code.charCodeAt(1) - 65
        );
    } catch { return "🌐"; }
}

const _displayNames = typeof Intl !== "undefined" && Intl.DisplayNames
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

function countryName(code) {
    if (!code || code === "??") return "Unknown";
    try { return _displayNames ? _displayNames.of(code) : code; } catch { return code; }
}

// ── CWV hero card ─────────────────────────────────────────────────────────
function CwvCard({ label, metric, value, desc }) {
    const rating = cwvRating(metric, value);
    const color  = RATING_COLOR[rating] || "rgba(130,130,130,0.5)";
    const rLabel = RATING_LABEL[rating];
    return (
        <div className="sa-perf-cwv-card" style={{ borderColor: color }}>
            <div className="sa-perf-cwv-card__label">{label}</div>
            <div className="sa-perf-cwv-card__value" style={{ color }}>
                {fmtMetric(metric, value)}
            </div>
            {rLabel && (
                <div className="sa-perf-cwv-card__rating" style={{ color }}>
                    {rLabel}
                </div>
            )}
            {!rLabel && <div className="sa-perf-cwv-card__rating sa-muted">No data</div>}
            <div className="sa-perf-cwv-card__desc">{desc}</div>
        </div>
    );
}

// ── Rating distribution bar ───────────────────────────────────────────────
function RatingBar({ goodPct, niPct, poorPct, goodCount, niCount, poorCount }) {
    if (goodPct == null) return null;
    return (
        <div className="sa-perf-rating-wrap">
            <div className="sa-perf-rating-bar">
                {goodPct > 0 && (
                    <div
                        className="sa-perf-rating-bar__seg sa-perf-rating-bar__seg--good"
                        style={{ width: goodPct + "%" }}
                        title={`Good: ${goodPct.toFixed(1).replace(".", ",")}% (${goodCount.toLocaleString("de-DE")})`}
                    />
                )}
                {niPct > 0 && (
                    <div
                        className="sa-perf-rating-bar__seg sa-perf-rating-bar__seg--ni"
                        style={{ width: niPct + "%" }}
                        title={`Needs improvement: ${niPct.toFixed(1).replace(".", ",")}% (${niCount.toLocaleString("de-DE")})`}
                    />
                )}
                {poorPct > 0 && (
                    <div
                        className="sa-perf-rating-bar__seg sa-perf-rating-bar__seg--poor"
                        style={{ width: poorPct + "%" }}
                        title={`Poor: ${poorPct.toFixed(1).replace(".", ",")}% (${poorCount.toLocaleString("de-DE")})`}
                    />
                )}
            </div>
            <div className="sa-perf-rating-legend">
                <span><span className="sa-perf-dot sa-perf-dot--good" />Good {formatPercent(goodPct, 1)}</span>
                <span><span className="sa-perf-dot sa-perf-dot--ni" />Needs improvement {formatPercent(niPct, 1)}</span>
                <span><span className="sa-perf-dot sa-perf-dot--poor" />Poor {formatPercent(poorPct, 1)}</span>
            </div>
        </div>
    );
}

// ── Per-page table ────────────────────────────────────────────────────────
function PageTable({ rows }) {
    const [sortKey, setSortKey] = useState("samples");
    const [sortAsc, setSortAsc] = useState(false);
    const [page, setPage] = useState(0);

    function toggleSort(key) {
        if (sortKey === key) setSortAsc(a => !a);
        else { setSortKey(key); setSortAsc(false); }
        setPage(0);
    }

    const sorted = useMemo(() => {
        const s = [...rows].sort((a, b) => {
            const av = a[sortKey] ?? (sortAsc ? Infinity : -Infinity);
            const bv = b[sortKey] ?? (sortAsc ? Infinity : -Infinity);
            return sortAsc ? av - bv : bv - av;
        });
        return s;
    }, [rows, sortKey, sortAsc]);

    const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    function Th({ k, children }) {
        const active = sortKey === k;
        return (
            <th
                className={"sa-table__num sa-table__sortable" + (active ? " sa-table__sortable--active" : "")}
                onClick={() => toggleSort(k)}
                style={{ cursor: "pointer" }}
            >
                {children}{active ? (sortAsc ? " ↑" : " ↓") : ""}
            </th>
        );
    }

    return (
        <div className="sa-table-scroll">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Page</th>
                    <th className="sa-table__num sa-table__sortable" onClick={() => toggleSort("samples")} style={{ cursor: "pointer" }}>
                        Samples{sortKey === "samples" ? (sortAsc ? " ↑" : " ↓") : ""}
                    </th>
                    <Th k="lcpP50">LCP P50</Th>
                    <Th k="lcpP75">LCP P75</Th>
                    <Th k="lcpP90">LCP P90</Th>
                    <Th k="clsP75">CLS P75</Th>
                    <Th k="inpP75">INP P75</Th>
                    <Th k="ttfbP75">TTFB P75</Th>
                    <Th k="loadP75">Load P75</Th>
                </tr>
            </thead>
            <tbody>
                {pageRows.map((r, i) => (
                    <tr key={page * PAGE_SIZE + i}>
                        <td className="sa-table__path" title={r.pathname}>
                            {r.pathname.length > 55 ? "…" + r.pathname.slice(-52) : r.pathname}
                        </td>
                        <td className="sa-table__num">{r.samples.toLocaleString("de-DE")}</td>
                        <td className="sa-table__num"><MetricValue metric="lcp"  value={r.lcpP50}  /></td>
                        <td className="sa-table__num" style={{ fontWeight: 700 }}><MetricValue metric="lcp"  value={r.lcpP75}  /></td>
                        <td className="sa-table__num"><MetricValue metric="lcp"  value={r.lcpP90}  /></td>
                        <td className="sa-table__num"><MetricValue metric="cls"  value={r.clsP75}  /></td>
                        <td className="sa-table__num"><MetricValue metric="inp"  value={r.inpP75}  /></td>
                        <td className="sa-table__num"><MetricValue metric="ttfb" value={r.ttfbP75} /></td>
                        <td className="sa-table__num"><MetricValue metric="load" value={r.loadP75} /></td>
                    </tr>
                ))}
            </tbody>
        </table>
        <TablePager page={page} setPage={setPage} total={sorted.length} />
        </div>
    );
}

// ── Per-device table ──────────────────────────────────────────────────────
function DeviceTable({ rows }) {
    if (!rows || !rows.length) return null;
    return (
        <div className="sa-table-scroll">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Device</th>
                    <th className="sa-table__num">Samples</th>
                    <th className="sa-table__num">LCP p75</th>
                    <th className="sa-table__num">CLS p75</th>
                    <th className="sa-table__num">INP p75</th>
                    <th className="sa-table__num">TTFB p75</th>
                    <th className="sa-table__num">Load p75</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={i}>
                        <td style={{ textTransform: "capitalize" }}>{r.device}</td>
                        <td className="sa-table__num">{r.samples.toLocaleString("de-DE")}</td>
                        <td className="sa-table__num"><MetricValue metric="lcp"  value={r.lcpP75}  /></td>
                        <td className="sa-table__num"><MetricValue metric="cls"  value={r.clsP75}  /></td>
                        <td className="sa-table__num"><MetricValue metric="inp"  value={r.inpP75}  /></td>
                        <td className="sa-table__num"><MetricValue metric="ttfb" value={r.ttfbP75} /></td>
                        <td className="sa-table__num"><MetricValue metric="load" value={r.loadP75} /></td>
                    </tr>
                ))}
            </tbody>
        </table>
        </div>
    );
}

// ── Lazy page screenshot ──────────────────────────────────────────────────
// Fetches with auth headers (can't use plain <img src> for that), converts
// to a blob URL, and only triggers when the element scrolls into view.
function LazyScreenshot({ domain, path }) {
    const ref      = useRef(null);
    const [url, setUrl]     = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el || !domain || !path) return;
        let cancelled = false;

        const obs = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return;
            obs.disconnect();
            const qs = new URLSearchParams({ domain, path }).toString();
            fetch(`${ScannerHost}/api/analytics-screenshot?${qs}`, { headers: authHeaders() })
                .then(r => r.ok ? r.blob() : Promise.reject())
                .then(blob => { if (!cancelled) setUrl(URL.createObjectURL(blob)); })
                .catch(() => { if (!cancelled) setFailed(true); });
        }, { rootMargin: "300px" });

        obs.observe(el);
        return () => { obs.disconnect(); cancelled = true; };
    }, [domain, path]);

    // Revoke blob URL when it changes or component unmounts
    useEffect(() => {
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [url]);

    return (
        <div ref={ref} className="sa-perf-thumb" style={{ overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {url    && <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
            {failed && <span style={{ fontSize: "10px", color: "rgba(200,200,220,0.25)" }}>—</span>}
            {!url && !failed && <div className="sa-perf-thumb-shimmer" />}
        </div>
    );
}

// ── LCP element table ─────────────────────────────────────────────────────
const IMG_TAGS = new Set(["img", "picture", "video", "source"]);

function lcpImgUrl(src, domain) {
    if (!src) return null;
    // Same-origin paths start with "/"; cross-origin stored as "cdn.host/path"
    if (src.startsWith("/")) return `https://${domain}${src}`;
    return `https://${src}`;
}

const PAGE_SIZE = 10;

function TablePager({ page, setPage, total }) {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    if (totalPages <= 1) return null;
    return (
        <div className="sa-table-pager">
            <button
                className="sa-table-pager__btn"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
            >&#8249;</button>
            <span className="sa-table-pager__info">{page + 1} / {totalPages}</span>
            <button
                className="sa-table-pager__btn"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
            >&#8250;</button>
        </div>
    );
}

function LcpElemTable({ rows, domain }) {
    const [page, setPage] = useState(0);
    if (!rows?.length) return null;
    const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    return (
        <div className="sa-table-wrap">
        <table className="sa-table">
            <thead>
                <tr>
                    <th style={{ width: "96px" }}>Element</th>
                    <th style={{ width: "96px" }}>Page</th>
                    <th>Details</th>
                    <th className="sa-num">LCP P75</th>
                    <th className="sa-num">Seen</th>
                </tr>
            </thead>
            <tbody>
                {pageRows.map((r, i) => {
                    const rating  = cwvRating("lcp", r.lcpP75);
                    const color   = RATING_COLOR[rating];
                    const desc    = [r.tag, r.elId ? `#${r.elId}` : null, r.cls ? `.${r.cls}` : null].filter(Boolean).join("");
                    const imgUrl  = IMG_TAGS.has(r.tag) && r.src ? lcpImgUrl(r.src, domain) : null;
                    return (
                        <tr key={page * PAGE_SIZE + i}>
                            <td>
                                {imgUrl ? (
                                    <img
                                        src={imgUrl}
                                        alt=""
                                        loading="lazy"
                                        className="sa-perf-thumb"
                                        onError={e => { e.currentTarget.style.display = "none"; }}
                                    />
                                ) : (
                                    <span className="sa-perf-thumb-placeholder">{r.tag || "?"}</span>
                                )}
                            </td>
                            <td>
                                <LazyScreenshot domain={domain} path={r.pathname || "/"} />
                            </td>
                            <td>
                                <code>{desc || r.tag || "—"}</code>
                                {r.src && <span className="sa-muted" style={{ display: "block", fontSize: "11px" }}>{r.src}</span>}
                                <span className="sa-muted" style={{ display: "block", fontSize: "11px", marginTop: "2px" }}>{r.pathname || "—"}</span>
                            </td>
                            <td className="sa-num" style={color ? { color, fontWeight: 700 } : {}}>{fmtMs(r.lcpP75)}</td>
                            <td className="sa-num">{r.occurrences}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
        <TablePager page={page} setPage={setPage} total={rows.length} />
        </div>
    );
}

const RES_TYPE_LABEL = { script: "Script", img: "Image", link: "CSS", font: "Font", fetch: "Fetch", xmlhttprequest: "XHR", iframe: "iframe" };

// ── Slow resources table ───────────────────────────────────────────────────
function SlowResTable({ rows }) {
    const [page, setPage] = useState(0);
    if (!rows?.length) return null;
    const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    return (
        <div className="sa-table-wrap">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Resource</th>
                    <th>Type</th>
                    <th className="sa-num">Avg load</th>
                    <th className="sa-num">Avg size</th>
                    <th className="sa-num">Seen</th>
                </tr>
            </thead>
            <tbody>
                {pageRows.map((r, i) => {
                    const slow = r.avgDur > 1000;
                    const warn = r.avgDur > 500;
                    return (
                        <tr key={page * PAGE_SIZE + i}>
                            <td><code style={{ wordBreak: "break-all", fontSize: "12px" }}>{r.url || "—"}</code></td>
                            <td className="sa-muted">{RES_TYPE_LABEL[r.resourceType] || r.resourceType || "—"}</td>
                            <td className="sa-num" style={slow ? { color: RATING_COLOR["poor"], fontWeight: 700 } : warn ? { color: RATING_COLOR["needs-improvement"], fontWeight: 700 } : {}}>{fmtMs(r.avgDur)}</td>
                            <td className="sa-num sa-muted">{r.avgKb > 0 ? `${r.avgKb} KB` : "—"}</td>
                            <td className="sa-num">{r.occurrences}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
        <TablePager page={page} setPage={setPage} total={rows.length} />
        </div>
    );
}

// ── Long tasks table ───────────────────────────────────────────────────────
function LongTaskTable({ rows }) {
    if (!rows?.length) return null;
    return (
        <div className="sa-table-wrap">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Script / source</th>
                    <th className="sa-num">Occurrences</th>
                    <th className="sa-num">Avg block</th>
                    <th className="sa-num">Max block</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={i}>
                        <td><code style={{ wordBreak: "break-all", fontSize: "12px" }}>{r.src || "(same-origin — unattributed)"}</code></td>
                        <td className="sa-num">{r.occurrences}</td>
                        <td className="sa-num" style={{ color: r.avgDur > 200 ? RATING_COLOR["poor"] : RATING_COLOR["needs-improvement"], fontWeight: 700 }}>{fmtMs(r.avgDur)}</td>
                        <td className="sa-num sa-muted">{fmtMs(r.maxDur)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
        </div>
    );
}

// ── Network connection type table ─────────────────────────────────────────
const NET_TYPE_LABEL = {
    "4g":     "4G / WiFi",
    "3g":     "3G",
    "2g":     "2G",
    "slow-2g":"Slow 2G",
    "wifi":   "WiFi",
    "ethernet":"Ethernet",
    "cellular":"Cellular",
    "unknown":"Unknown",
};

function NetworkTable({ rows }) {
    if (!rows?.length) return null;
    return (
        <div className="sa-table-scroll">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Connection</th>
                    <th className="sa-table__num">Samples</th>
                    <th className="sa-table__num">LCP P75</th>
                    <th className="sa-table__num">CLS P75</th>
                    <th className="sa-table__num">INP P75</th>
                    <th className="sa-table__num">TTFB P75</th>
                    <th className="sa-table__num">Load P75</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{NET_TYPE_LABEL[r.netType] || r.netType}</td>
                        <td className="sa-table__num">{r.samples.toLocaleString("de-DE")}</td>
                        <td className="sa-table__num"><MetricValue metric="lcp"  value={r.lcpP75}  /></td>
                        <td className="sa-table__num"><MetricValue metric="cls"  value={r.clsP75}  /></td>
                        <td className="sa-table__num"><MetricValue metric="inp"  value={r.inpP75}  /></td>
                        <td className="sa-table__num"><MetricValue metric="ttfb" value={r.ttfbP75} /></td>
                        <td className="sa-table__num"><MetricValue metric="load" value={r.loadP75} /></td>
                    </tr>
                ))}
            </tbody>
        </table>
        </div>
    );
}

// ── Trends over time — sparkline grid ────────────────────────────────────
const SPARKLINE_DEFS = [
    { key: "lcpP75",  label: "LCP",  metric: "lcp",  isCls: false },
    { key: "inpP75",  label: "INP",  metric: "inp",  isCls: false },
    { key: "fcpP75",  label: "FCP",  metric: "fcp",  isCls: false },
    { key: "ttfbP75", label: "TTFB", metric: "ttfb", isCls: false },
    { key: "clsP75",  label: "CLS",  metric: "cls",  isCls: true  },
];

function MetricSparklines({ daily }) {
    if (!daily?.length) return null;
    return (
        <div className="sa-perf-sparklines">
            {SPARKLINE_DEFS.map(s => {
                const chartData = daily.map(d => ({ label: d.day, num: d[s.key] ?? 0 }));
                const latest    = daily[daily.length - 1]?.[s.key];
                const rating    = cwvRating(s.metric, latest);
                const color     = RATING_COLOR[rating];
                return (
                    <div key={s.key} className="sa-perf-sparkline-card">
                        <div className="sa-perf-sparkline-card__header">
                            <span>{s.label}</span>
                            <span style={color ? { color, fontWeight: 700 } : { color: "rgba(200,200,220,0.6)" }}>
                                {s.isCls ? fmtCls(latest) : fmtMs(latest)}
                            </span>
                        </div>
                        <TrendLineChart data={chartData} title={`${s.label} P75`} height={72} />
                    </div>
                );
            })}
        </div>
    );
}

// ── Full percentile distribution table ───────────────────────────────────
const PCTILE_METRICS = [
    { key: "lcp",  label: "LCP",  desc: "Largest Contentful Paint", isCls: false },
    { key: "cls",  label: "CLS",  desc: "Cumulative Layout Shift",  isCls: true  },
    { key: "inp",  label: "INP",  desc: "Interaction to Next Paint",isCls: false },
    { key: "fcp",  label: "FCP",  desc: "First Contentful Paint",   isCls: false },
    { key: "ttfb", label: "TTFB", desc: "Time to First Byte",       isCls: false },
    { key: "load", label: "Load", desc: "Full page load event",     isCls: false },
];
const PCTILE_COLS = ["P25", "P50", "P75", "P90", "P95"];

function PercentileTable({ totals }) {
    if (!totals) return null;
    return (
        <div className="sa-table-wrap">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Metric</th>
                    {PCTILE_COLS.map(p => (
                        <th key={p} className="sa-table__num" style={p === "P75" ? { fontWeight: 800 } : {}}>
                            {p}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {PCTILE_METRICS.map(m => (
                    <tr key={m.key}>
                        <td>
                            <strong>{m.label}</strong>
                            <span className="sa-muted" style={{ display: "block", fontSize: "11px" }}>{m.desc}</span>
                        </td>
                        {PCTILE_COLS.map(p => {
                            const field = `${m.key}${p}`;
                            const v     = totals[field];
                            const rating = cwvRating(m.key, v);
                            const color  = RATING_COLOR[rating];
                            return (
                                <td
                                    key={p}
                                    className="sa-table__num"
                                    style={{
                                        ...(color ? { color } : {}),
                                        fontWeight: p === "P75" ? 700 : undefined,
                                    }}
                                >
                                    {m.isCls ? fmtCls(v) : fmtMs(v)}
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
        </div>
    );
}

// ── LCP histogram ─────────────────────────────────────────────────────────
function LcpHistogram({ histogram }) {
    if (!histogram?.length) return null;

    const W = 600, H = 160;
    const PAD = { t: 10, r: 12, b: 32, l: 36 };
    const cW = W - PAD.l - PAD.r;
    const cH = H - PAD.t - PAD.b;

    // Fill in any missing buckets so bars are evenly spaced
    const maxBucket = Math.max(...histogram.map(b => b.bucketMs));
    const filled = [];
    for (let ms = 0; ms <= maxBucket; ms += 500) {
        const found = histogram.find(b => b.bucketMs === ms);
        filled.push({ bucketMs: ms, count: found?.count ?? 0 });
    }

    const maxCount = Math.max(...filled.map(b => b.count), 1);
    const barW = cW / filled.length;

    function barFill(ms) {
        if (ms < 2500) return "rgba(34,197,94,0.65)";
        if (ms < 4000) return "rgba(234,179,8,0.65)";
        return "rgba(239,68,68,0.65)";
    }

    function xLabel(ms) {
        if (ms >= 8000) return "8s+";
        if (ms === 0)   return "0";
        return (ms / 1000).toFixed(1) + "s";
    }

    const gridLines = [0.25, 0.5, 0.75, 1.0];

    // x position of the 2500ms and 4000ms threshold lines
    const xThresh = (ms) => PAD.l + (ms / 500) * barW;

    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            style={{ width: "100%", display: "block", maxHeight: "180px" }}
        >
            {/* Y grid lines + labels */}
            {gridLines.map(f => {
                const y = PAD.t + cH - f * cH;
                const v = Math.round(maxCount * f);
                return (
                    <g key={f}>
                        <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                        <text x={PAD.l - 4} y={y + 4} textAnchor="end" fontSize="9" fill="rgba(160,160,180,0.5)">{v}</text>
                    </g>
                );
            })}

            {/* Threshold lines */}
            {[2500, 4000].map(ms => {
                const x = xThresh(ms);
                const col = ms === 2500 ? "rgba(234,179,8,0.45)" : "rgba(239,68,68,0.45)";
                const lbl = ms === 2500 ? "2.5s" : "4s";
                return (
                    <g key={ms}>
                        <line x1={x} y1={PAD.t} x2={x} y2={PAD.t + cH} stroke={col} strokeWidth="1" strokeDasharray="3,3" />
                        <text x={x + 3} y={PAD.t + 9} fontSize="9" fill={col}>{lbl}</text>
                    </g>
                );
            })}

            {/* Bars */}
            {filled.map((b, i) => {
                const x    = PAD.l + i * barW;
                const bh   = (b.count / maxCount) * cH;
                const y    = PAD.t + cH - bh;
                return (
                    <rect key={i} x={x + 1} y={y} width={barW - 2} height={bh} fill={barFill(b.bucketMs)} rx="1">
                        <title>{xLabel(b.bucketMs)}: {b.count.toLocaleString("de-DE")} page loads</title>
                    </rect>
                );
            })}

            {/* X labels — every other bucket */}
            {filled.map((b, i) => {
                if (i % 2 !== 0 && i !== filled.length - 1) return null;
                const x = PAD.l + (i + 0.5) * barW;
                return (
                    <text key={i} x={x} y={H - PAD.b + 12} textAnchor="middle" fontSize="9" fill="rgba(160,160,180,0.6)">
                        {xLabel(b.bucketMs)}
                    </text>
                );
            })}
        </svg>
    );
}

// ── Country breakdown table ───────────────────────────────────────────────
const Link = window.ReactRouterDOM.Link;

function CountryTable({ rows, domain }) {
    if (!rows?.length) return null;
    return (
        <div className="sa-table-scroll">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Country</th>
                    <th className="sa-table__num">Samples</th>
                    <th className="sa-table__num">LCP P75</th>
                    <th className="sa-table__num">CLS P75</th>
                    <th className="sa-table__num">INP P75</th>
                    <th className="sa-table__num">TTFB P75</th>
                    <th style={{ minWidth: 120 }}>Rating split</th>
                </tr>
            </thead>
            <tbody>
                {rows.map(r => {
                    const rating   = cwvRating("lcp", r.lcpP75);
                    const color    = RATING_COLOR[rating];
                    const total    = (r.goodCount + r.niCount + r.poorCount) || 1;
                    const goodPct  = r.goodCount / total * 100;
                    const niPct   = r.niCount   / total * 100;
                    const poorPct  = r.poorCount / total * 100;
                    const to       = analyticsPerformanceCountryPath(domain, r.country);
                    return (
                        <tr key={r.country}>
                            <td>
                                <Link to={to} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit" }}>
                                    <span style={{ fontSize: 20, lineHeight: 1 }}>{countryFlag(r.country)}</span>
                                    <span>
                                        <span style={{ fontWeight: 600 }}>{countryName(r.country)}</span>
                                        <span className="sa-muted" style={{ marginLeft: 6, fontSize: 11 }}>{r.country}</span>
                                    </span>
                                </Link>
                            </td>
                            <td className="sa-table__num">{r.samples.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num" style={color ? { color, fontWeight: 700 } : {}}>{fmtMs(r.lcpP75)}</td>
                            <td className="sa-table__num"><MetricValue metric="cls"  value={r.clsP75}  /></td>
                            <td className="sa-table__num"><MetricValue metric="inp"  value={r.inpP75}  /></td>
                            <td className="sa-table__num"><MetricValue metric="ttfb" value={r.ttfbP75} /></td>
                            <td>
                                <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", minWidth: 100 }}>
                                    {goodPct > 0 && <div style={{ width: goodPct + "%", background: "rgba(34,197,94,0.75)" }} title={`Good ${goodPct.toFixed(0)}%`} />}
                                    {niPct  > 0 && <div style={{ width: niPct  + "%", background: "rgba(234,179,8,0.75)"  }} title={`Needs improvement ${niPct.toFixed(0)}%`} />}
                                    {poorPct > 0 && <div style={{ width: poorPct + "%", background: "rgba(239,68,68,0.75)" }} title={`Poor ${poorPct.toFixed(0)}%`} />}
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
        </div>
    );
}

// ── Main page (also handles /country/:country sub-route) ──────────────────
export default function AnalyticsPerformance() {
    const { country } = useParams();
    const history     = useHistory();

    const isCountryView = Boolean(country);
    const flag          = isCountryView ? countryFlag(country) : null;
    const cName         = isCountryView ? countryName(country) : null;

    document.title = isCountryView
        ? `${cName} — Performance | Site Analytics`
        : "Performance | Site Analytics";

    const {
        domain,
        getLastDays, setLastDays,
        fromDate, setFromDate,
        toDate, setToDate,
        fromIso, toIso,
    } = useAnalyticsPageChrome();

    const { data, loading } = usePerfReport(domain, fromIso, toIso, country || null);

    const showData = data && !data.noData;

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title={isCountryView ? `${flag} ${cName}` : "Performance"}
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
            />
            <div className="dashboard-content">
                <div className="sa-page">
                    {/* Back link for country view */}
                    {isCountryView && domain && (
                        <div className="sa-perf-back">
                            <button
                                className="sa-perf-back__btn"
                                onClick={() => history.push(analyticsPerformancePath(domain))}
                            >
                                ← Performance overview
                            </button>
                            <span className="sa-perf-back__title">
                                <span style={{ fontSize: 22, marginRight: 8 }}>{flag}</span>
                                {cName}
                                <span className="sa-muted" style={{ marginLeft: 8, fontSize: 13, fontWeight: 400 }}>{country}</span>
                            </span>
                        </div>
                    )}

                    {!domain && (
                        <p className="sa-notice">Select a domain to view performance data.</p>
                    )}
                    {domain && loading && <p className="sa-notice">Loading&hellip;</p>}
                    {domain && !loading && data?.noData && (
                        <div className="sa-perf-empty">
                            <h3>No performance data yet{isCountryView ? ` for ${cName}` : ""}</h3>
                            <p>The embed script collects Core Web Vitals automatically once deployed. Data appears after visitors begin interacting with the site — metrics are sent when users navigate away or close the tab.</p>
                            <p className="sa-muted">Metrics captured: LCP, CLS, INP, FCP, TTFB, load time.</p>
                        </div>
                    )}

                    {showData && (
                        <>
                            {/* Core Web Vitals hero row */}
                            <div className="sa-perf-cwv-row">
                                <CwvCard
                                    label="LCP"
                                    metric="lcp"
                                    value={data.totals.lcpP75}
                                    desc="Largest Contentful Paint — how quickly the main content loads. P75 across all pages."
                                />
                                <CwvCard
                                    label="CLS"
                                    metric="cls"
                                    value={data.totals.clsP75}
                                    desc="Cumulative Layout Shift — visual stability. Unexpected shifts above 0.1 hurt UX."
                                />
                                <CwvCard
                                    label="INP"
                                    metric="inp"
                                    value={data.totals.inpP75}
                                    desc="Interaction to Next Paint — responsiveness to user input. Requires user interaction to measure."
                                />
                            </div>

                            {/* Additional timing metrics */}
                            <div className="sa-perf-timing-row">
                                <div className="sa-perf-timing-card">
                                    <span className="sa-perf-timing-card__label">FCP</span>
                                    <span className="sa-perf-timing-card__sub">First Contentful Paint</span>
                                    <span className="sa-perf-timing-card__value">
                                        <MetricValue metric="fcp" value={data.totals.fcpP75} />
                                    </span>
                                </div>
                                <div className="sa-perf-timing-card">
                                    <span className="sa-perf-timing-card__label">TTFB</span>
                                    <span className="sa-perf-timing-card__sub">Time to First Byte</span>
                                    <span className="sa-perf-timing-card__value">
                                        <MetricValue metric="ttfb" value={data.totals.ttfbP75} />
                                    </span>
                                </div>
                                <div className="sa-perf-timing-card">
                                    <span className="sa-perf-timing-card__label">Load</span>
                                    <span className="sa-perf-timing-card__sub">Full page load event</span>
                                    <span className="sa-perf-timing-card__value">
                                        <MetricValue metric="load" value={data.totals.loadP75} />
                                    </span>
                                </div>
                                <div className="sa-perf-timing-card">
                                    <span className="sa-perf-timing-card__label">{data.totals.sampleSize.toLocaleString("de-DE")}</span>
                                    <span className="sa-perf-timing-card__sub">Page samples</span>
                                    <span className="sa-perf-timing-card__value sa-muted" style={{ fontSize: "11px" }}>
                                        Pages with &lt; 3 samples excluded from breakdown
                                    </span>
                                </div>
                            </div>

                            {/* Grid A: Overall rating + By device + By network */}
                            <div className="sa-perf-2col">
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconTarget className="sa-icon" /> Overall rating
                                    </h3>
                                    <p className="sa-panel__desc">
                                        Share of page views rated Good / Needs improvement / Poor based on all three Core Web Vitals (LCP, CLS, INP).
                                    </p>
                                    <RatingBar
                                        goodPct={data.totals.goodPct}
                                        niPct={data.totals.niPct}
                                        poorPct={data.totals.poorPct}
                                        goodCount={data.totals.goodCount}
                                        niCount={data.totals.niCount}
                                        poorCount={data.totals.poorCount}
                                    />
                                </div>
                                {data.byDevice?.length > 0 && (
                                    <div className="sa-panel">
                                        <h3 className="sa-panel__title">
                                            <IconGlobe className="sa-icon" /> By device
                                        </h3>
                                        <p className="sa-panel__desc">
                                            Mobile devices typically show higher LCP and TTFB due to network constraints. A large gap between desktop and mobile signals missing responsive optimisation.
                                        </p>
                                        <DeviceTable rows={data.byDevice} />
                                    </div>
                                )}
                                {data.byNetwork?.length > 0 && (
                                    <div className="sa-panel">
                                        <h3 className="sa-panel__title">
                                            <IconClock className="sa-icon" /> By connection type
                                        </h3>
                                        <p className="sa-panel__desc">
                                            Core Web Vitals per network connection quality. Slow-2G and 3G users reveal how well your site performs under constrained bandwidth.
                                        </p>
                                        <NetworkTable rows={data.byNetwork} />
                                    </div>
                                )}
                            </div>

                            {/* Trends over time — full width so sparklines have room */}
                            {data.daily?.length > 1 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconBarChart className="sa-icon" /> Trends over time
                                    </h3>
                                    <p className="sa-panel__desc">P75 for each Core Web Vital per day. Spikes can indicate deployments, CDN outages, or newly-added heavy resources.</p>
                                    <MetricSparklines daily={data.daily} />
                                </div>
                            )}

                            {/* Grid B: Percentile distribution + LCP histogram */}
                            <div className="sa-perf-2col">
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconTarget className="sa-icon" /> Percentile distribution
                                    </h3>
                                    <p className="sa-panel__desc">
                                        P25 to P95 for every metric. P75 matches Google&apos;s CrUX definition — P90 and P95 reveal your worst-case tail.
                                    </p>
                                    <PercentileTable totals={data.totals} />
                                </div>
                                {data.histogram?.length > 0 && (
                                    <div className="sa-panel">
                                        <h3 className="sa-panel__title">
                                            <IconBarChart className="sa-icon" /> LCP distribution
                                        </h3>
                                        <p className="sa-panel__desc">
                                            Page loads by 500 ms LCP bucket. Green = Good (&lt;2.5 s), yellow = Needs improvement, red = Poor (&gt;4 s).
                                        </p>
                                        <LcpHistogram histogram={data.histogram} />
                                    </div>
                                )}
                            </div>

                            {/* Per-page breakdown — full width (9 columns) */}
                            {data.byPage?.length > 0 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconScrollDepth className="sa-icon" /> By page
                                    </h3>
                                    <p className="sa-panel__desc">
                                        LCP P50/P75/P90 per page plus other metrics — click headers to sort. Pages with fewer than 3 samples are excluded. The P50→P90 spread shows how consistent a page is.
                                    </p>
                                    <PageTable rows={data.byPage} />
                                </div>
                            )}

                            {/* LCP element — full width (has image thumbnails + screenshots) */}
                            {data.lcpElements?.length > 0 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconTarget className="sa-icon" /> LCP element
                                    </h3>
                                    <p className="sa-panel__desc">
                                        Which DOM element triggered Largest Contentful Paint on each page. Optimise the element listed here first — lazy-load, compress, preload, or resize it.
                                    </p>
                                    <LcpElemTable rows={data.lcpElements} domain={domain} />
                                </div>
                            )}

                            {/* Grid C: Slow resources + Main-thread blockers */}
                            {(data.slowResources?.length > 0 || data.longTasks?.length > 0) && (
                                <div className="sa-perf-2col">
                                    {data.slowResources?.length > 0 && (
                                        <div className="sa-panel">
                                            <h3 className="sa-panel__title">
                                                <IconClock className="sa-icon" /> Slow resources
                                            </h3>
                                            <p className="sa-panel__desc">
                                                Assets that took longer than 200 ms to load. Scripts and fonts are the most common culprits — consider self-hosting, deferring, or removing them.
                                            </p>
                                            <SlowResTable rows={data.slowResources} />
                                        </div>
                                    )}
                                    {data.longTasks?.length > 0 && (
                                        <div className="sa-panel">
                                            <h3 className="sa-panel__title">
                                                <IconAlertTriangle className="sa-icon" /> Main-thread blockers
                                            </h3>
                                            <p className="sa-panel__desc">
                                                JavaScript tasks longer than 50 ms that block user interaction. Anything over 200 ms will noticeably delay clicks and input.
                                            </p>
                                            <LongTaskTable rows={data.longTasks} />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Country breakdown — main view only */}
                            {!isCountryView && data.byCountry?.length > 0 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconGlobe className="sa-icon" /> By country
                                    </h3>
                                    <p className="sa-panel__desc">
                                        LCP, CLS, INP, and TTFB P75 per country. Click a row to open the full country breakdown. Countries with fewer than 5 samples are excluded.
                                    </p>
                                    <CountryTable rows={data.byCountry} domain={domain} />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
