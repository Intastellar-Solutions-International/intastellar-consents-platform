const { useState, useEffect, useMemo, useRef } = React;
const useParams  = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { useAnalyticsPageChrome, authHeaders, MiniBar, formatPercent } from "./_shared.js";
import { analyticsPerformancePath, analyticsPerformanceCountryPath } from "../../Functions/domainPathSegments.js";
import { IconBarChart, IconTarget, IconScrollDepth, IconGlobe, IconClock, IconAlertTriangle } from "./Icons.js";
import "./Analytics.css";

// ── CWV thresholds ────────────────────────────────────────────────────────
const THRESHOLDS = {
    lcp:  { good: 2500, poor: 4000, unit: "ms" },
    cls:  { good: 0.1,  poor: 0.25, unit: "" },
    inp:  { good: 200,  poor: 500,  unit: "ms" },
    fcp:  { good: 1800, poor: 3000, unit: "ms" },
    ttfb: { good: 800,  poor: 1800, unit: "ms" },
    load: { good: 3000, poor: 6000, unit: "ms" },
    tbt:  { good: 200,  poor: 600,  unit: "ms" },
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

// ── Period delta chip ─────────────────────────────────────────────────────
function DeltaChip({ current, prev }) {
    if (current == null || prev == null || prev === 0) return null;
    const pct      = ((current - prev) / prev) * 100;
    const improved = pct < 0; // all perf metrics: lower = better
    const color    = improved ? "rgba(34,197,94,0.85)" : "rgba(239,68,68,0.85)";
    const arrow    = improved ? "▼" : "▲";
    return (
        <span className="sa-perf-delta" style={{ color }}>
            {arrow}{Math.abs(pct).toFixed(0)}%
        </span>
    );
}

// ── CWV hero card ─────────────────────────────────────────────────────────
function CwvCard({ label, metric, value, prevValue, desc }) {
    const rating = cwvRating(metric, value);
    const color  = RATING_COLOR[rating] || "rgba(130,130,130,0.5)";
    const rLabel = RATING_LABEL[rating];
    return (
        <div className="sa-perf-cwv-card" style={{ borderColor: color }}>
            <div className="sa-perf-cwv-card__label">{label}</div>
            <div className="sa-perf-cwv-card__value" style={{ color }}>
                {fmtMetric(metric, value)}
                <DeltaChip current={value} prev={prevValue} />
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

    // Max LCP across visible rows to normalise range bars
    const maxLcp = Math.max(...sorted.map(r => r.lcpP90 ?? 0), 1);

    return (
        <div className="sa-table-scroll">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Page</th>
                    <th className="sa-table__num sa-table__sortable" onClick={() => toggleSort("samples")} style={{ cursor: "pointer" }}>
                        Samples{sortKey === "samples" ? (sortAsc ? " ↑" : " ↓") : ""}
                    </th>
                    <Th k="lcpP75">LCP P75</Th>
                    <th style={{ minWidth: 120 }}>
                        <span className="sa-table__sortable" onClick={() => toggleSort("lcpP75")} style={{ cursor: "pointer" }}>
                            LCP range{sortKey === "lcpP75" ? (sortAsc ? " ↑" : " ↓") : ""}
                        </span>
                        <span className="sa-muted" style={{ fontSize: "10px", marginLeft: 4 }}>P50→P90</span>
                    </th>
                    <Th k="clsP75">CLS P75</Th>
                    <Th k="inpP75">INP P75</Th>
                    <Th k="ttfbP75">TTFB P75</Th>
                    <Th k="loadP75">Load P75</Th>
                </tr>
            </thead>
            <tbody>
                {pageRows.map((r, i) => {
                    const p50pct = r.lcpP50 != null ? Math.min(r.lcpP50 / maxLcp * 100, 100) : null;
                    const p75pct = r.lcpP75 != null ? Math.min(r.lcpP75 / maxLcp * 100, 100) : null;
                    const p90pct = r.lcpP90 != null ? Math.min(r.lcpP90 / maxLcp * 100, 100) : null;
                    const lcpRating = cwvRating("lcp", r.lcpP75);
                    const barColor = RATING_COLOR[lcpRating] || "rgba(160,160,180,0.4)";
                    return (
                        <tr key={page * PAGE_SIZE + i}>
                            <td className="sa-table__path" title={r.pathname}>
                                {r.pathname.length > 55 ? "…" + r.pathname.slice(-52) : r.pathname}
                            </td>
                            <td className="sa-table__num">{r.samples.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num" style={{ fontWeight: 700 }}><MetricValue metric="lcp" value={r.lcpP75} /></td>
                            <td style={{ verticalAlign: "middle", paddingRight: 8 }}>
                                {p50pct != null && p90pct != null ? (
                                    <div className="sa-page-lcp-bar">
                                        <div style={{ left: p50pct + "%", width: (p90pct - p50pct) + "%",
                                                      background: barColor.replace("0.9", "0.25"), position: "absolute", top: 0, bottom: 0, borderRadius: 3 }} />
                                        {p75pct != null && (
                                            <div style={{ left: p75pct + "%", position: "absolute", top: 0, bottom: 0,
                                                          width: 2, background: barColor, borderRadius: 1 }} />
                                        )}
                                    </div>
                                ) : <span className="sa-muted">—</span>}
                            </td>
                            <td className="sa-table__num"><MetricValue metric="cls"  value={r.clsP75}  /></td>
                            <td className="sa-table__num"><MetricValue metric="inp"  value={r.inpP75}  /></td>
                            <td className="sa-table__num"><MetricValue metric="ttfb" value={r.ttfbP75} /></td>
                            <td className="sa-table__num"><MetricValue metric="load" value={r.loadP75} /></td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
        <TablePager page={page} setPage={setPage} total={sorted.length} />
        </div>
    );
}

// ── Device grouped bar chart ──────────────────────────────────────────────
function DeviceBarChart({ rows }) {
    if (!rows?.length) return null;
    const METRICS = [
        { key: "lcpP75", label: "LCP", metric: "lcp" },
        { key: "clsP75", label: "CLS", metric: "cls" },
        { key: "inpP75", label: "INP", metric: "inp" },
    ];
    const DEVICE_COLORS = {
        desktop: "rgba(96,165,250,0.75)",
        mobile:  "rgba(192,159,83,0.75)",
        tablet:  "rgba(167,139,250,0.65)",
        unknown: "rgba(120,120,140,0.5)",
    };
    const W = 600, H = 130;
    const PAD = { t: 14, r: 12, b: 36, l: 50 };
    const cW = W - PAD.l - PAD.r;
    const cH = H - PAD.t - PAD.b;
    const groupW = cW / METRICS.length;
    const barW   = groupW / (rows.length + 1);

    // Normalize CLS to ms-equivalent scale for unified axis (×1000)
    const allVals = rows.flatMap(r => METRICS.map(m => {
        const v = r[m.key];
        return m.metric === "cls" ? (v ?? 0) * 1000 : (v ?? 0);
    }));
    const maxVal = Math.max(...allVals, 1);

    function barH(v, metric) {
        const norm = metric === "cls" ? (v ?? 0) * 1000 : (v ?? 0);
        return (norm / maxVal) * cH;
    }
    function barFill(v, metric, device) {
        const rating = cwvRating(metric, v);
        return DEVICE_COLORS[device] || "rgba(160,160,180,0.5)";
    }

    return (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
             style={{ width: "100%", display: "block", maxHeight: "140px", marginBottom: 4 }}>
            {/* Y grid lines */}
            {[0.25, 0.5, 0.75, 1.0].map(f => {
                const y = PAD.t + cH * (1 - f);
                return (
                    <g key={f}>
                        <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                              stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                    </g>
                );
            })}
            {/* Bars */}
            {METRICS.map((m, gi) => {
                const gx = PAD.l + gi * groupW;
                return (
                    <g key={m.key}>
                        {rows.map((r, ri) => {
                            const v  = r[m.key];
                            const bh = barH(v, m.metric);
                            const x  = gx + (ri + 0.5) * barW;
                            const y  = PAD.t + cH - bh;
                            const fill = barFill(v, m.metric, r.device);
                            return (
                                <rect key={ri} x={x} y={y} width={barW * 0.8} height={bh}
                                      fill={fill} rx="2">
                                    <title>{r.device}: {m.label} {fmtMetric(m.metric, v)}</title>
                                </rect>
                            );
                        })}
                        {/* Group label */}
                        <text x={gx + groupW / 2} y={H - 4} textAnchor="middle"
                              fontSize="10" fontWeight="600" fill="rgba(180,180,200,0.6)">
                            {m.label}
                        </text>
                    </g>
                );
            })}
            {/* Legend */}
            {rows.map((r, ri) => (
                <g key={ri}>
                    <rect x={PAD.l + ri * 70} y={H - PAD.b + 18} width={8} height={8}
                          fill={DEVICE_COLORS[r.device] || "rgba(160,160,180,0.5)"} rx="2" />
                    <text x={PAD.l + ri * 70 + 12} y={H - PAD.b + 26} fontSize="9"
                          fill="rgba(160,160,180,0.7)" textTransform="capitalize">
                        {r.device}
                    </text>
                </g>
            ))}
        </svg>
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

const PAGE_SIZE = 7;

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

const RES_TYPE_LABEL = { script: "Script", img: "Image", link: "CSS", css: "BG image", font: "Font", fetch: "Fetch", xmlhttprequest: "XHR", iframe: "iframe", source: "Image", video: "Video", audio: "Audio" };

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
const CT_LABEL  = { window: "same-origin", iframe: "iframe", embed: "embed" };
const INV_LABEL = {
    "event-listener":  "event handler",
    "user-callback":   "timer / rAF",
    "resolve-promise": "Promise",
    "reject-promise":  "Promise (reject)",
    "classic-script":  "script eval",
    "module-script":   "module eval",
};

function LongTaskTable({ rows }) {
    const [page, setPage] = useState(0);
    if (!rows?.length) return null;
    const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const maxBlock = Math.max(...rows.map(r => r.totalBlocking ?? 0), 1);
    return (
        <div className="sa-table-wrap">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Script / source</th>
                    <th className="sa-table__num">Seen</th>
                    <th className="sa-table__num">Avg</th>
                    <th className="sa-table__num">P75</th>
                    <th className="sa-table__num">Peak</th>
                    <th className="sa-table__num" title="Average time from navigation start when this task fires">Avg start</th>
                    <th title="Total ms blocked (sum of duration − 50 ms across all occurrences)">Total block</th>
                </tr>
            </thead>
            <tbody>
                {pageRows.map((r, i) => {
                    const avgColor  = r.avgDur > 500 ? RATING_COLOR["poor"] : RATING_COLOR["needs-improvement"];
                    const phase     = r.avgStart != null ? (r.avgStart < 5000 ? "load" : "post-load") : null;
                    const ctLabel   = r.containerType ? CT_LABEL[r.containerType] || r.containerType : null;
                    const invLabel  = r.invokerType ? INV_LABEL[r.invokerType] || r.invokerType : null;
                    const srcLabel  = r.src || (r.functionName ? "(anonymous)" : "(unattributed)");
                    const blockPct  = r.totalBlocking != null ? (r.totalBlocking / maxBlock) * 100 : 0;
                    const blockColor = r.totalBlocking > 1000 ? RATING_COLOR["poor"] : RATING_COLOR["needs-improvement"];
                    return (
                        <tr key={page * PAGE_SIZE + i}>
                            <td>
                                <code style={{ wordBreak: "break-all", fontSize: "12px" }}>{srcLabel}</code>
                                {r.functionName && (
                                    <span style={{ display: "block", fontSize: "11px", color: "rgba(180,180,220,0.6)", marginTop: 2 }}>
                                        fn: <code style={{ fontSize: "11px" }}>{r.functionName}</code>
                                    </span>
                                )}
                                {(ctLabel || invLabel || phase) && (
                                    <span style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                        {invLabel  && <span className="sa-perf-badge">{invLabel}</span>}
                                        {ctLabel   && <span className="sa-perf-badge">{ctLabel}</span>}
                                        {phase     && <span className={"sa-perf-badge" + (phase === "load" ? " sa-perf-badge--warn" : "")}>{phase}</span>}
                                    </span>
                                )}
                            </td>
                            <td className="sa-table__num">{r.occurrences}</td>
                            <td className="sa-table__num" style={{ color: avgColor, fontWeight: 700 }}>{fmtMs(r.avgDur)}</td>
                            <td className="sa-table__num" style={{ color: avgColor }}>{fmtMs(r.p75Dur)}</td>
                            <td className="sa-table__num sa-muted">{fmtMs(r.maxDur)}</td>
                            <td className="sa-table__num sa-muted">{r.avgStart != null ? fmtMs(r.avgStart) : "—"}</td>
                            <td>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
                                    <div className="sa-blocker-bar-wrap">
                                        <div className="sa-blocker-bar"
                                             style={{ width: blockPct + "%", background: blockColor }} />
                                    </div>
                                    <span style={{ fontWeight: 700, color: blockColor, fontSize: "12px", whiteSpace: "nowrap" }}>
                                        {r.totalBlocking != null ? fmtMs(r.totalBlocking) : "—"}
                                    </span>
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
        <TablePager page={page} setPage={setPage} total={rows.length} />
        </div>
    );
}

// ── Network connection type table ─────────────────────────────────────────
const NET_TYPE_LABEL = {
    "4g":      "4G / WiFi",
    "3g":      "3G",
    "2g":      "2G",
    "slow-2g": "Slow 2G",
    "wifi":    "WiFi",
    "ethernet":"Ethernet",
    "cellular":"Cellular",
    "unknown": "Unknown",
};
const NET_TYPE_ORDER = ["4g","wifi","ethernet","cellular","3g","2g","slow-2g","unknown"];

function NetworkTable({ rows }) {
    if (!rows?.length) return null;
    const sorted = [...rows].sort((a, b) =>
        (NET_TYPE_ORDER.indexOf(a.netType) + 1 || 99) - (NET_TYPE_ORDER.indexOf(b.netType) + 1 || 99)
    );
    const totalSamples = sorted.reduce((s, r) => s + r.samples, 0);
    return (
        <>
        <p className="sa-perf-scope-note">
            Sourced from <code>network_connection</code> events. RTT and downlink are only available in Chromium-based browsers (Chrome, Edge); Safari and Firefox report these as 0 or null.
        </p>
        <div className="sa-table-scroll">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Connection type</th>
                    <th className="sa-table__num">Sessions</th>
                    <th className="sa-table__num">Share</th>
                    <th className="sa-table__num">Avg RTT</th>
                    <th className="sa-table__num">Avg downlink</th>
                    <th className="sa-table__num">Data saver</th>
                </tr>
            </thead>
            <tbody>
                {sorted.map((r, i) => (
                    <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{NET_TYPE_LABEL[r.netType] || r.netType}</td>
                        <td className="sa-table__num">{r.samples.toLocaleString("de-DE")}</td>
                        <td className="sa-table__num">
                            {totalSamples > 0 ? Math.round(r.samples / totalSamples * 100) + "%" : "—"}
                        </td>
                        <td className="sa-table__num">
                            {r.avgRtt != null && r.avgRtt > 0 ? r.avgRtt + " ms" : "—"}
                        </td>
                        <td className="sa-table__num">
                            {r.avgDownlink != null && r.avgDownlink > 0 ? r.avgDownlink + " Mb/s" : "—"}
                        </td>
                        <td className="sa-table__num">
                            {r.saveDataCount > 0
                                ? r.saveDataCount.toLocaleString("de-DE")
                                : <span style={{ opacity: 0.35 }}>—</span>}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
        </div>
        </>
    );
}

// ── Browser breakdown table ───────────────────────────────────────────────
const BROWSER_ICON = { Chrome: "🌐", Firefox: "🦊", Safari: "🧭", Edge: "🌀", Opera: "🔴", other: "•" };

function BrowserTable({ rows }) {
    if (!rows?.length) return (
        <p className="sa-perf-scope-note">
            Browser data is captured for new events. No data yet — rows will appear as visitors are tracked with the updated embed.
        </p>
    );
    return (
        <div className="sa-table-scroll">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Browser</th>
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
                        <td style={{ fontWeight: 600 }}>
                            <span style={{ marginRight: 6 }}>{BROWSER_ICON[r.browser] || "•"}</span>
                            {r.browser}
                            {r.browser === "Safari" && (
                                <span className="sa-muted" style={{ fontSize: 10, marginLeft: 6 }}>
                                    (INP not measured)
                                </span>
                            )}
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

// ── Band line chart — P75 line + P50–P90 shaded band ─────────────────────
function BandLineChart({ daily, p50Key, p75Key, p90Key, metric, isCls, height = 90 }) {
    if (!daily?.length) return null;
    const W = 800, H = height, PAD = { t: 8, r: 8, b: 20, l: 38 };
    const cW = W - PAD.l - PAD.r;
    const cH = H - PAD.t - PAD.b;

    const vals = daily.flatMap(d => [d[p50Key], d[p75Key], d[p90Key]]).filter(v => v != null);
    if (!vals.length) return null;

    const t  = THRESHOLDS[metric];
    const rawMax = Math.max(...vals);
    const capMax = t ? Math.max(rawMax, t.poor * 1.2) : rawMax;
    const maxVal = Math.max(capMax, 1);

    function yOf(v) {
        if (v == null) return null;
        return PAD.t + cH - Math.min(v / maxVal, 1) * cH;
    }
    function xOf(i) {
        return PAD.l + (daily.length > 1 ? (i / (daily.length - 1)) * cW : cW / 2);
    }
    function fmtY(v) { return isCls ? v.toFixed(2) : v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v) + ""; }

    // Build SVG path strings
    const pts75 = daily.map((d, i) => ({ x: xOf(i), y: yOf(d[p75Key]) })).filter(p => p.y != null);
    const linePath = pts75.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");

    // Band area: go along p90 points, then reverse along p50 points
    const bandPoints = [
        ...daily.map((d, i) => ({ x: xOf(i), y: yOf(d[p90Key]) })).filter(p => p.y != null),
    ];
    const band50Points = [
        ...daily.map((d, i) => ({ x: xOf(i), y: yOf(d[p50Key]) })).filter(p => p.y != null).reverse(),
    ];
    const bandPath = bandPoints.length
        ? bandPoints.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ")
          + " " + band50Points.map(p => "L" + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ") + " Z"
        : "";

    // Threshold background bands
    const yGood = t ? yOf(t.good) : null;
    const yPoor = t ? yOf(t.poor) : null;

    // Y-axis ticks
    const tickCount = 3;
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round(maxVal * i / tickCount));

    // X-axis labels: first, mid, last
    const labelIdxs = [0, Math.floor((daily.length - 1) / 2), daily.length - 1]
        .filter((v, i, a) => v >= 0 && a.indexOf(v) === i);

    return (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
             style={{ width: "100%", display: "block", maxHeight: height + "px" }}>
            {/* Threshold background zones */}
            {t && yGood != null && (
                <rect x={PAD.l} y={PAD.t} width={cW} height={Math.max(0, yGood - PAD.t)}
                      fill="rgba(239,68,68,0.04)" />
            )}
            {t && yGood != null && yPoor != null && (
                <rect x={PAD.l} y={yGood} width={cW} height={Math.max(0, yPoor - yGood)}
                      fill="rgba(234,179,8,0.04)" />
            )}
            {t && yPoor != null && (
                <rect x={PAD.l} y={yPoor} width={cW}
                      height={Math.max(0, PAD.t + cH - yPoor)} fill="rgba(34,197,94,0.04)" />
            )}
            {/* Grid lines */}
            {ticks.map((v, i) => {
                const y = yOf(v);
                if (y == null) return null;
                return (
                    <g key={i}>
                        <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                              stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                        <text x={PAD.l - 4} y={y + 3} textAnchor="end" fontSize="8"
                              fill="rgba(160,160,180,0.45)">{fmtY(v)}</text>
                    </g>
                );
            })}
            {/* P50–P90 band */}
            {bandPath && <path d={bandPath} fill="rgba(192,159,83,0.1)" stroke="none" />}
            {/* P75 line */}
            {linePath && (
                <path d={linePath} fill="none" stroke="rgba(192,159,83,0.75)" strokeWidth="1.5" />
            )}
            {/* Threshold lines */}
            {t && yGood != null && (
                <line x1={PAD.l} y1={yGood} x2={W - PAD.r} y2={yGood}
                      stroke="rgba(234,179,8,0.3)" strokeWidth="1" strokeDasharray="3,3" />
            )}
            {t && yPoor != null && (
                <line x1={PAD.l} y1={yPoor} x2={W - PAD.r} y2={yPoor}
                      stroke="rgba(239,68,68,0.3)" strokeWidth="1" strokeDasharray="3,3" />
            )}
            {/* X labels */}
            {labelIdxs.map(i => (
                <text key={i} x={xOf(i)} y={H - 2} textAnchor="middle" fontSize="8"
                      fill="rgba(160,160,180,0.5)">
                    {String(daily[i]?.day || "").slice(5)}
                </text>
            ))}
        </svg>
    );
}

// ── Trends over time — sparkline grid ────────────────────────────────────
const SPARKLINE_DEFS = [
    { p50Key: "lcpP50",  p75Key: "lcpP75",  p90Key: "lcpP90",  label: "LCP",  metric: "lcp",  isCls: false },
    { p50Key: "inpP50",  p75Key: "inpP75",  p90Key: "inpP90",  label: "INP",  metric: "inp",  isCls: false },
    { p50Key: "fcpP50",  p75Key: "fcpP75",  p90Key: "fcpP90",  label: "FCP",  metric: "fcp",  isCls: false },
    { p50Key: "ttfbP50", p75Key: "ttfbP75", p90Key: "ttfbP90", label: "TTFB", metric: "ttfb", isCls: false },
    { p50Key: "clsP50",  p75Key: "clsP75",  p90Key: "clsP90",  label: "CLS",  metric: "cls",  isCls: true  },
    { p50Key: null,      p75Key: "tbtP75",  p90Key: null,       label: "TBT",  metric: "tbt",  isCls: false },
];

function MetricSparklines({ daily }) {
    if (!daily?.length) return null;
    return (
        <div className="sa-perf-sparklines">
            {SPARKLINE_DEFS.map(s => {
                const latest = daily[daily.length - 1]?.[s.p75Key];
                const rating = cwvRating(s.metric, latest);
                const color  = RATING_COLOR[rating];
                return (
                    <div key={s.p75Key} className="sa-perf-sparkline-card">
                        <div className="sa-perf-sparkline-card__header">
                            <span>{s.label} <span className="sa-perf-sparkline-p75">P75</span></span>
                            <span style={color ? { color, fontWeight: 700 } : { color: "rgba(200,200,220,0.6)" }}>
                                {s.isCls ? fmtCls(latest) : fmtMs(latest)}
                            </span>
                        </div>
                        <BandLineChart daily={daily} p50Key={s.p50Key} p75Key={s.p75Key}
                                       p90Key={s.p90Key} metric={s.metric} isCls={s.isCls} height={80} />
                    </div>
                );
            })}
        </div>
    );
}

// ── Full percentile distribution table + range bars ──────────────────────
const PCTILE_METRICS = [
    { key: "lcp",  label: "LCP",  desc: "Largest Contentful Paint", isCls: false },
    { key: "cls",  label: "CLS",  desc: "Cumulative Layout Shift",  isCls: true  },
    { key: "inp",  label: "INP",  desc: "Interaction to Next Paint",isCls: false },
    { key: "fcp",  label: "FCP",  desc: "First Contentful Paint",   isCls: false },
    { key: "ttfb", label: "TTFB", desc: "Time to First Byte",       isCls: false },
    { key: "load", label: "Load", desc: "Full page load event",     isCls: false },
];
const PCTILE_COLS = ["P25", "P50", "P75", "P90", "P95"];

function PctileRangeBar({ metric, p25, p75, p95, isCls }) {
    if (p25 == null || p95 == null || p95 <= 0) return null;
    const t     = THRESHOLDS[metric];
    const scale = p95;
    function pct(v) { return v == null ? null : Math.min(v / scale * 100, 100); }
    const goodEnd = t ? pct(Math.min(t.good, p95)) : null;
    const niEnd   = t ? pct(Math.min(t.poor, p95)) : null;

    const barLeft  = pct(p25);
    const barWidth = pct(p95) - pct(p25);
    const tickPos  = pct(p75);

    return (
        <div className="sa-pctile-range-wrap">
            {/* threshold zone background */}
            <div className="sa-pctile-range-bg">
                {goodEnd != null && <div style={{ width: goodEnd + "%", background: "rgba(34,197,94,0.12)" }} />}
                {niEnd   != null && <div style={{ width: (niEnd - (goodEnd || 0)) + "%", background: "rgba(234,179,8,0.1)" }} />}
                <div style={{ flex: 1, background: "rgba(239,68,68,0.08)" }} />
            </div>
            {/* P25–P95 span bar */}
            <div className="sa-pctile-range-bar"
                 style={{ left: barLeft + "%", width: barWidth + "%" }} />
            {/* P75 tick */}
            {tickPos != null && (
                <div className="sa-pctile-range-tick"
                     style={{ left: tickPos + "%" }}
                     title={`P75: ${isCls ? fmtCls(p75) : fmtMs(p75)}`} />
            )}
        </div>
    );
}

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
                    <th style={{ minWidth: 120 }}>Range P25→P95</th>
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
                        <td style={{ verticalAlign: "middle", paddingRight: 12 }}>
                            <PctileRangeBar metric={m.key}
                                p25={totals[`${m.key}P25`]}
                                p75={totals[`${m.key}P75`]}
                                p95={totals[`${m.key}P95`]}
                                isCls={m.isCls} />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
        </div>
    );
}

// ── Generic metric histogram ───────────────────────────────────────────────
// Works for LCP (ms buckets), INP (ms buckets), and CLS (fractional buckets).
function MetricHistogram({ histogram, metric, bucketKey = "bucketMs", step, maxBucket, goodThresh, poorThresh, fmtBucket }) {
    if (!histogram?.length) return null;

    const W = 600, H = 160;
    const PAD = { t: 10, r: 12, b: 32, l: 36 };
    const cW = W - PAD.l - PAD.r;
    const cH = H - PAD.t - PAD.b;

    // Fill in missing buckets for even spacing
    const filled = [];
    for (let v = 0; v <= maxBucket; v = Math.round((v + step) * 1e6) / 1e6) {
        const found = histogram.find(b => Math.abs(b[bucketKey] - v) < step * 0.01);
        filled.push({ bv: v, count: found?.count ?? 0 });
    }

    const maxCount = Math.max(...filled.map(b => b.count), 1);
    const barW = cW / filled.length;

    function barColor(v) {
        if (v < goodThresh) return "rgba(34,197,94,0.65)";
        if (v < poorThresh) return "rgba(234,179,8,0.65)";
        return "rgba(239,68,68,0.65)";
    }

    function xOfVal(v) { return PAD.l + (v / step) * barW; }

    const gridLines = [0.25, 0.5, 0.75, 1.0];

    return (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
             style={{ width: "100%", display: "block", maxHeight: "180px" }}>
            {/* Y grid lines */}
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
            {[{ v: goodThresh, col: "rgba(234,179,8,0.45)" }, { v: poorThresh, col: "rgba(239,68,68,0.45)" }].map(({ v, col }) => {
                const x = xOfVal(v);
                if (x < PAD.l || x > W - PAD.r) return null;
                return (
                    <g key={v}>
                        <line x1={x} y1={PAD.t} x2={x} y2={PAD.t + cH} stroke={col} strokeWidth="1" strokeDasharray="3,3" />
                        <text x={x + 3} y={PAD.t + 9} fontSize="9" fill={col}>{fmtBucket(v)}</text>
                    </g>
                );
            })}
            {/* Bars */}
            {filled.map((b, i) => {
                const x  = PAD.l + i * barW;
                const bh = (b.count / maxCount) * cH;
                const y  = PAD.t + cH - bh;
                return (
                    <rect key={i} x={x + 1} y={y} width={barW - 2} height={bh} fill={barColor(b.bv)} rx="1">
                        <title>{fmtBucket(b.bv)}: {b.count.toLocaleString("de-DE")} page loads</title>
                    </rect>
                );
            })}
            {/* X labels — show ~6 evenly spaced */}
            {filled.map((b, i) => {
                const every = Math.max(1, Math.floor(filled.length / 6));
                if (i % every !== 0 && i !== filled.length - 1) return null;
                const x = PAD.l + (i + 0.5) * barW;
                return (
                    <text key={i} x={x} y={H - PAD.b + 12} textAnchor="middle" fontSize="9" fill="rgba(160,160,180,0.6)">
                        {fmtBucket(b.bv)}
                    </text>
                );
            })}
        </svg>
    );
}

function LcpHistogram({ histogram }) {
    return (
        <MetricHistogram histogram={histogram?.map(b => ({ bucketMs: b.bucketMs, count: b.count }))}
            metric="lcp" bucketKey="bucketMs" step={500} maxBucket={8000}
            goodThresh={2500} poorThresh={4000}
            fmtBucket={v => v >= 8000 ? "8s+" : v === 0 ? "0" : (v / 1000).toFixed(1) + "s"} />
    );
}

function ClsHistogram({ histogram }) {
    return (
        <MetricHistogram histogram={histogram?.map(b => ({ bucketMs: b.bucket, count: b.count }))}
            metric="cls" bucketKey="bucketMs" step={0.025} maxBucket={0.5}
            goodThresh={0.1} poorThresh={0.25}
            fmtBucket={v => v >= 0.5 ? "0.5+" : v.toFixed(3)} />
    );
}

function InpHistogram({ histogram }) {
    return (
        <MetricHistogram histogram={histogram?.map(b => ({ bucketMs: b.bucketMs, count: b.count }))}
            metric="inp" bucketKey="bucketMs" step={50} maxBucket={1000}
            goodThresh={200} poorThresh={500}
            fmtBucket={v => v >= 1000 ? "1s+" : v + "ms"} />
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

// ── Business impact ───────────────────────────────────────────────────────
function BusinessImpact({ businessImpact, qualifyingEvents }) {
    // Not configured — qualifying events array is empty in site settings
    if (businessImpact === null) {
        return (
            <div className="sa-perf-bi-empty">
                <p>No qualifying events configured yet.</p>
                <p>
                    Go to <strong>Analytics → Settings → Qualifying events</strong> and add the event name
                    you track when a visitor completes a key action — for example a booking confirmation,
                    a form submission, or a purchase. Any event fired via{" "}
                    <code>window.intaAnalytics.track(&quot;event_name&quot;)</code> can be used.
                </p>
            </div>
        );
    }

    // Configured but no sessions matched in the date range
    if (!businessImpact.length) {
        return (
            <div className="sa-perf-bi-empty">
                <p>No conversion data in this date range.</p>
                <p className="sa-muted" style={{ fontSize: 11 }}>
                    Tracking: {qualifyingEvents.join(", ")}
                </p>
            </div>
        );
    }

    const maxRate  = Math.max(...businessImpact.map(r => r.conversionRate), 0.01);
    const goodRow  = businessImpact.find(r => r.rating === "good");
    const poorRow  = businessImpact.find(r => r.rating === "poor");
    const uplift   = goodRow && poorRow && poorRow.conversionRate > 0
        ? ((goodRow.conversionRate - poorRow.conversionRate) / poorRow.conversionRate * 100)
        : null;

    return (
        <div>
            {uplift !== null && uplift > 0 && (
                <div className="sa-perf-bi-callout">
                    Sessions with <strong>Good</strong> Core Web Vitals convert at a{" "}
                    <strong>{Math.round(uplift)}% higher rate</strong> than <strong>Poor</strong> sessions
                    — a direct performance-to-revenue signal.
                </div>
            )}
            {uplift !== null && uplift <= 0 && (
                <div className="sa-perf-bi-callout sa-perf-bi-callout--neutral">
                    No clear conversion uplift between Good and Poor sessions in this period.
                    Consider a longer date range or check if the qualifying event fires on the right page.
                </div>
            )}
            <div className="sa-perf-bi-rows">
                {businessImpact.map(r => {
                    const color   = RATING_COLOR[r.rating] || "rgba(160,160,180,0.6)";
                    const label   = RATING_LABEL[r.rating]  || r.rating;
                    const barPct  = maxRate > 0 ? (r.conversionRate / maxRate) * 100 : 0;
                    return (
                        <div key={r.rating} className="sa-perf-bi-row">
                            <div className="sa-perf-bi-label">
                                <span style={{ width: 8, height: 8, borderRadius: "50%",
                                               background: color, display: "inline-block",
                                               flexShrink: 0 }} />
                                <span style={{ color }}>{label}</span>
                            </div>
                            <div className="sa-perf-bi-bar-wrap">
                                <div className="sa-perf-bi-bar"
                                     style={{ width: barPct + "%",
                                              background: color.replace(/[\d.]+\)$/, "0.35)") }} />
                            </div>
                            <div className="sa-perf-bi-rate">
                                {r.conversionRate.toFixed(1).replace(".", ",")}%
                            </div>
                            <div className="sa-perf-bi-sessions sa-muted">
                                {r.conversions.toLocaleString("de-DE")} / {r.sessions.toLocaleString("de-DE")} sessions
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="sa-perf-scope-note" style={{ marginTop: 12 }}>
                Full-consent sessions only (session_id required for correlation).
                Tracking: <strong>{qualifyingEvents.join(", ")}</strong>.
            </p>
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
        ? `${cName} — Core Web Vitals | Site Analytics`
        : "Core Web Vitals | Site Analytics";

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
                title={isCountryView ? `${flag} ${cName}` : "Core Web Vitals"}
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
                                ← Core Web Vitals overview
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
                            <div className="sa-perf-section-label">Core Web Vitals</div>
                            <div className="sa-perf-cwv-row">
                                <CwvCard
                                    label="LCP"
                                    metric="lcp"
                                    value={data.totals.lcpP75}
                                    prevValue={data.prevTotals?.lcpP75}
                                    desc="Largest Contentful Paint — how quickly the main content loads. P75 across all pages."
                                />
                                <CwvCard
                                    label="CLS"
                                    metric="cls"
                                    value={data.totals.clsP75}
                                    prevValue={data.prevTotals?.clsP75}
                                    desc="Cumulative Layout Shift — visual stability. Unexpected shifts above 0.1 hurt UX."
                                />
                                <CwvCard
                                    label="INP"
                                    metric="inp"
                                    value={data.totals.inpP75}
                                    prevValue={data.prevTotals?.inpP75}
                                    desc="Interaction to Next Paint — responsiveness to user input. Requires user interaction to measure."
                                />
                            </div>

                            {/* Supporting metrics */}
                            <div className="sa-perf-section-label">Supporting metrics</div>
                            <div className="sa-perf-timing-row">
                                {[
                                    { label: "FCP",  sub: "First Contentful Paint", metric: "fcp",  value: data.totals.fcpP75,  prev: data.prevTotals?.fcpP75  },
                                    { label: "TTFB", sub: "Time to First Byte",     metric: "ttfb", value: data.totals.ttfbP75, prev: data.prevTotals?.ttfbP75 },
                                    { label: "Load", sub: "Full page load event",   metric: "load", value: data.totals.loadP75, prev: data.prevTotals?.loadP75 },
                                    ...(data.totals.tbtP75 != null ? [{ label: "TBT", sub: "Total Blocking Time", metric: "tbt", value: data.totals.tbtP75, prev: data.prevTotals?.tbtP75 }] : []),
                                ].map(c => (
                                    <div key={c.label} className="sa-perf-timing-card">
                                        <span className="sa-perf-timing-card__label">{c.label}</span>
                                        <span className="sa-perf-timing-card__sub">{c.sub}</span>
                                        <span className="sa-perf-timing-card__value">
                                            <MetricValue metric={c.metric} value={c.value} />
                                            <DeltaChip current={c.value} prev={c.prev} />
                                        </span>
                                    </div>
                                ))}
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
                                        <DeviceBarChart rows={data.byDevice} />
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
                                    <p className="sa-panel__desc">
                                        P75 per day with P50–P90 band showing spread. Dashed lines mark Good/Poor thresholds for each metric.
                                        {data.prevPeriod && (
                                            <span className="sa-muted" style={{ marginLeft: 8, fontSize: 11 }}>
                                                Prev. period: {data.prevPeriod.from} – {data.prevPeriod.to}
                                            </span>
                                        )}
                                    </p>
                                    <MetricSparklines daily={data.daily} />
                                </div>
                            )}

                            {/* Grid B: Percentile distribution + histograms */}
                            <div className="sa-perf-2col">
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconTarget className="sa-icon" /> Percentile distribution
                                    </h3>
                                    <p className="sa-panel__desc">
                                        P25 to P95 for every metric. P75 matches Google&apos;s CrUX definition — P90 and P95 reveal your worst-case tail. The range bar visualises spread.
                                    </p>
                                    <PercentileTable totals={data.totals} />
                                </div>
                                <div className="sa-perf-2col" style={{ gap: 12 }}>
                                    {data.histogram?.length > 0 && (
                                        <div className="sa-panel">
                                            <h3 className="sa-panel__title">
                                                <IconBarChart className="sa-icon" /> LCP distribution
                                            </h3>
                                            <p className="sa-panel__desc">
                                                Page loads by 500 ms bucket. Green &lt;2.5 s, yellow 2.5–4 s, red &gt;4 s.
                                            </p>
                                            <LcpHistogram histogram={data.histogram} />
                                        </div>
                                    )}
                                    {data.clsHistogram?.length > 0 && (
                                        <div className="sa-panel">
                                            <h3 className="sa-panel__title">
                                                <IconBarChart className="sa-icon" /> CLS distribution
                                            </h3>
                                            <p className="sa-panel__desc">
                                                Page loads by 0.025 CLS bucket. Green &lt;0.1, yellow 0.1–0.25, red &gt;0.25.
                                            </p>
                                            <ClsHistogram histogram={data.clsHistogram} />
                                        </div>
                                    )}
                                    {data.inpHistogram?.length > 0 && (
                                        <div className="sa-panel">
                                            <h3 className="sa-panel__title">
                                                <IconBarChart className="sa-icon" /> INP distribution
                                            </h3>
                                            <p className="sa-panel__desc">
                                                Interactions by 50 ms bucket. Green &lt;200 ms, yellow 200–500 ms, red &gt;500 ms.
                                            </p>
                                            <InpHistogram histogram={data.inpHistogram} />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Per-page breakdown — full width */}
                            {data.byPage?.length > 0 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconScrollDepth className="sa-icon" /> By page
                                    </h3>
                                    <p className="sa-panel__desc">
                                        LCP P75 per page with P50→P90 range bar (tick = P75). Pages with fewer than 3 samples are excluded.
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
                                                JavaScript tasks longer than 50 ms that block user interaction. Sorted by total blocking time — the most impactful scripts appear first. "load" phase tasks fire during page load (affecting TBT); "post-load" tasks fire after and affect INP. Avg start is relative to navigation.
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

                            {/* Browser breakdown */}
                            <div className="sa-panel">
                                <h3 className="sa-panel__title">
                                    <IconGlobe className="sa-icon" /> By browser
                                </h3>
                                <p className="sa-panel__desc">
                                    Core Web Vitals per browser. Safari shows INP as "—" because the Event Timing API is not supported — this is expected, not a data gap. Browsers with fewer than 3 samples are excluded.
                                </p>
                                <BrowserTable rows={data.byBrowser} />
                            </div>

                            {/* CLS culprit attribution — data collection gap */}
                            {data.totals.clsP75 != null && data.totals.clsP75 >= 0.1 && (
                                <div className="sa-panel sa-perf-gap-panel">
                                    <h3 className="sa-panel__title">
                                        <IconAlertTriangle className="sa-icon" /> CLS culprit elements — data not yet available
                                    </h3>
                                    <p className="sa-panel__desc">
                                        CLS P75 is <strong>{fmtCls(data.totals.clsP75)}</strong> — above the "Good" threshold of 0.1. To identify which elements are causing layout shifts, the embed script needs to be updated to record <code>PerformanceObserver layout-shift</code> entry sources. This is a follow-up data-collection task.
                                    </p>
                                </div>
                            )}

                            {/* Business impact */}
                            <div className="sa-panel">
                                <h3 className="sa-panel__title">
                                    <IconTarget className="sa-icon" /> Business impact
                                </h3>
                                <p className="sa-panel__desc">
                                    Conversion rate segmented by Core Web Vitals rating. A higher rate for "Good" sessions confirms that improving performance directly drives business outcomes.
                                </p>
                                <BusinessImpact
                                    businessImpact={data.businessImpact}
                                    qualifyingEvents={data.qualifyingEvents}
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
