const { useState, useEffect, useMemo, useRef } = React;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { useAnalyticsPageChrome, authHeaders, MiniBar, formatPercent } from "./_shared.js";
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
function usePerfReport(domain, fromIso, toIso) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!domain) { setData(null); return; }
        let ignore = false;
        setLoading(true);
        const qs = new URLSearchParams({ domain, from: fromIso, to: toIso }).toString();
        fetch(`${ScannerHost}/api/analytics-performance?${qs}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (!ignore) setData(d); })
            .catch(() => { if (!ignore) setData(null); })
            .finally(() => { if (!ignore) setLoading(false); });
        return () => { ignore = true; };
    }, [domain, fromIso, toIso]);

    return { data, loading };
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

    function toggleSort(key) {
        if (sortKey === key) setSortAsc(a => !a);
        else { setSortKey(key); setSortAsc(false); }
    }

    const sorted = useMemo(() => {
        const s = [...rows].sort((a, b) => {
            const av = a[sortKey] ?? (sortAsc ? Infinity : -Infinity);
            const bv = b[sortKey] ?? (sortAsc ? Infinity : -Infinity);
            return sortAsc ? av - bv : bv - av;
        });
        return s;
    }, [rows, sortKey, sortAsc]);

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
                    <Th k="lcpP75">LCP p75</Th>
                    <Th k="clsP75">CLS p75</Th>
                    <Th k="inpP75">INP p75</Th>
                    <Th k="ttfbP75">TTFB p75</Th>
                    <Th k="loadP75">Load p75</Th>
                </tr>
            </thead>
            <tbody>
                {sorted.map((r, i) => (
                    <tr key={i}>
                        <td className="sa-table__path" title={r.pathname}>
                            {r.pathname.length > 55 ? "…" + r.pathname.slice(-52) : r.pathname}
                        </td>
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

function LcpElemTable({ rows, domain }) {
    if (!rows?.length) return null;
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
                {rows.map((r, i) => {
                    const rating  = cwvRating("lcp", r.lcpP75);
                    const color   = RATING_COLOR[rating];
                    const desc    = [r.tag, r.elId ? `#${r.elId}` : null, r.cls ? `.${r.cls}` : null].filter(Boolean).join("");
                    const imgUrl  = IMG_TAGS.has(r.tag) && r.src ? lcpImgUrl(r.src, domain) : null;
                    return (
                        <tr key={i}>
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
        </div>
    );
}

const RES_TYPE_LABEL = { script: "Script", img: "Image", link: "CSS", font: "Font", fetch: "Fetch", xmlhttprequest: "XHR", iframe: "iframe" };

// ── Slow resources table ───────────────────────────────────────────────────
function SlowResTable({ rows }) {
    if (!rows?.length) return null;
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
                {rows.map((r, i) => {
                    const slow = r.avgDur > 1000;
                    const warn = r.avgDur > 500;
                    return (
                        <tr key={i}>
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

// ── Main page ─────────────────────────────────────────────────────────────
export default function AnalyticsPerformance() {
    document.title = "Performance | Site Analytics";

    const {
        domain,
        getLastDays, setLastDays,
        fromDate, setFromDate,
        toDate, setToDate,
        fromIso, toIso,
    } = useAnalyticsPageChrome();

    const { data, loading } = usePerfReport(domain, fromIso, toIso);

    const trendData = useMemo(() => (data?.daily || []).map(d => ({
        label: d.day,
        num:   d.lcpP75 ?? 0,
    })), [data]);

    const showData = data && !data.noData;

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Performance"
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
            />
            <div className="dashboard-content">
                <div className="sa-page">
                    {!domain && (
                        <p className="sa-notice">Select a domain to view performance data.</p>
                    )}
                    {domain && loading && <p className="sa-notice">Loading&hellip;</p>}
                    {domain && !loading && data?.noData && (
                        <div className="sa-perf-empty">
                            <h3>No performance data yet</h3>
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

                            {/* CWV rating distribution */}
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

                            {/* LCP trend */}
                            {trendData.length > 1 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconBarChart className="sa-icon" /> LCP over time
                                    </h3>
                                    <p className="sa-panel__desc">P75 Largest Contentful Paint per day. Spikes can indicate deployments, CDN outages, or new heavy content.</p>
                                    <TrendLineChart data={trendData} title="LCP p75 (ms)" />
                                </div>
                            )}

                            {/* Per-page breakdown */}
                            {data.byPage?.length > 0 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconScrollDepth className="sa-icon" /> By page
                                    </h3>
                                    <p className="sa-panel__desc">
                                        P75 for each metric per page — click column headers to sort. Pages with fewer than 3 samples are excluded. High-traffic slow pages are the highest-impact fix.
                                    </p>
                                    <PageTable rows={data.byPage} />
                                </div>
                            )}

                            {/* Per-device breakdown */}
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

                            {/* LCP element attribution */}
                            {data.lcpElements?.length > 0 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconTarget className="sa-icon" /> LCP element
                                    </h3>
                                    <p className="sa-panel__desc">
                                        Which DOM element triggered Largest Contentful Paint on each page. Images and large text blocks are the most common causes of a slow LCP — optimise the element listed here first (lazy-load, compress, preload, or resize it).
                                    </p>
                                    <LcpElemTable rows={data.lcpElements} domain={domain} />
                                </div>
                            )}

                            {/* Slow resources */}
                            {data.slowResources?.length > 0 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconClock className="sa-icon" /> Slow resources
                                    </h3>
                                    <p className="sa-panel__desc">
                                        Assets that took longer than 200 ms to load, aggregated across all page views. Scripts and fonts are the most common culprits — consider self-hosting, deferring, or removing them. Size is transfer size (0 for cross-origin resources that don't set Timing-Allow-Origin).
                                    </p>
                                    <SlowResTable rows={data.slowResources} />
                                </div>
                            )}

                            {/* Long tasks / main-thread blockers */}
                            {data.longTasks?.length > 0 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconAlertTriangle className="sa-icon" /> Main-thread blockers
                                    </h3>
                                    <p className="sa-panel__desc">
                                        JavaScript tasks longer than 50 ms that block user interaction (the main thread). Anything over 200 ms will noticeably delay clicks and input. Same-origin tasks show as unattributed — this is a browser limitation of the Long Tasks API; cross-origin scripts (ads, analytics, chat widgets) are identified by source.
                                    </p>
                                    <LongTaskTable rows={data.longTasks} />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
