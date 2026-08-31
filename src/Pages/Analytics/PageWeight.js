const { useState, useEffect, useMemo } = React;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { useAnalyticsPageChrome, authHeaders, formatPercent } from "./_shared.js";
import { IconDocument, IconAlertTriangle } from "./Icons.js";
import "./Analytics.css";

// ── Formatting ───────────────────────────────────────────────────────────
function fmtBytes(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    if (v >= 1024 * 1024) return (v / (1024 * 1024)).toFixed(2).replace(".", ",") + " MB";
    if (v >= 1024) return Math.round(v / 1024).toLocaleString("de-DE") + " KB";
    return Math.round(v).toLocaleString("de-DE") + " B";
}
function fmtMs(v) {
    if (v == null) return "—";
    if (v >= 1000) return (v / 1000).toFixed(1).replace(".", ",") + " s";
    return Math.round(v).toLocaleString("de-DE") + " ms";
}

// Raw PerformanceResourceTiming initiatorType -> human label (same mapping
// Performance.js's Slow Resources table uses, for a consistent vocabulary
// between the two pages).
const RES_TYPE_LABEL = { script: "Script", img: "Image", link: "CSS", css: "BG image", font: "Font", fetch: "Fetch", xmlhttprequest: "XHR", iframe: "iframe", source: "Image", video: "Video", audio: "Audio", doc: "Document" };

// Small fixed taxonomy for the treemap/legend — mirrors the bucketing the
// embed script itself applies before summing bytes per type (api/a.js), so
// the legend's totals and the treemap cells' colors agree with what the
// server actually aggregated.
function bucketOf(rt) {
    if (rt === "script") return "script";
    if (rt === "css" || rt === "link") return "css";
    if (rt === "img" || rt === "source") return "img";
    if (rt === "font") return "font";
    if (rt === "fetch" || rt === "xmlhttprequest" || rt === "beacon") return "xhr";
    if (rt === "video" || rt === "audio") return "media";
    if (rt === "doc") return "doc";
    return "other";
}
const TYPE_COLOR = {
    script: "rgba(96,165,250,0.85)",
    css:    "rgba(167,139,250,0.85)",
    img:    "rgba(52,211,153,0.85)",
    font:   "rgba(251,191,36,0.85)",
    xhr:    "rgba(248,113,113,0.85)",
    media:  "rgba(244,114,182,0.85)",
    doc:    "rgba(148,163,184,0.85)",
    other:  "rgba(120,120,140,0.65)",
};
const TYPE_LABEL = { script: "Scripts", css: "CSS", img: "Images", font: "Fonts", xhr: "XHR / Fetch", media: "Media", doc: "Document (HTML)", other: "Other" };

const SEVERITY_COLOR = { poor: "rgba(239,68,68,0.9)", "needs-improvement": "rgba(234,179,8,0.9)" };
const SEVERITY_LABEL = { poor: "High impact", "needs-improvement": "Medium impact" };

function pageWeightSeverity(v) {
    if (v == null) return null;
    if (v >= 5 * 1024 * 1024) return "poor";
    if (v >= 3 * 1024 * 1024) return "needs-improvement";
    return "good";
}

// ── Data fetching ─────────────────────────────────────────────────────────
function usePageWeightReport(domain, fromIso, toIso) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!domain) { setData(null); return; }
        let ignore = false;
        setLoading(true);
        const qs = new URLSearchParams({ domain, from: fromIso, to: toIso }).toString();
        fetch(`${ScannerHost}/api/analytics-page-weight?${qs}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (!ignore) setData(d); })
            .catch(() => { if (!ignore) setData(null); })
            .finally(() => { if (!ignore) setLoading(false); });
        return () => { ignore = true; };
    }, [domain, fromIso, toIso]);

    return { data, loading };
}

// ── Weight delta chip — lower is better, unlike KpiCard's built-in trend
// (which colors "up" green, assuming a metric like revenue where more is
// good) ─────────────────────────────────────────────────────────────────
function WeightDeltaChip({ current, prev }) {
    if (current == null || prev == null || prev === 0) return null;
    const pct      = ((current - prev) / prev) * 100;
    const improved = pct < 0;
    const color    = improved ? "rgba(34,197,94,0.85)" : "rgba(239,68,68,0.85)";
    const arrow    = improved ? "▼" : "▲";
    return (
        <span className="sa-perf-delta" style={{ color }}>
            {arrow}{Math.abs(pct).toFixed(0)}%
        </span>
    );
}

// ── Squarified treemap layout — pure geometry, no rendering. Verified
// separately for area conservation / no-overlap before wiring into JSX.
function squarify(items, x, y, w, h) {
    const rects = [];
    function worst(row, length) {
        if (!row.length) return Infinity;
        const sum = row.reduce((a, b) => a + b.value, 0);
        if (sum <= 0) return Infinity;
        let max = -Infinity, min = Infinity;
        row.forEach(r => { if (r.value > max) max = r.value; if (r.value < min) min = r.value; });
        const s2 = sum * sum, l2 = length * length;
        return Math.max((l2 * max) / s2, s2 / (l2 * min));
    }
    function layoutRow(row, rx, ry, rw, rh, horizontal) {
        const sum = row.reduce((a, b) => a + b.value, 0);
        let offset = 0;
        row.forEach(r => {
            if (horizontal) {
                const cw = sum > 0 ? (r.value / sum) * rw : 0;
                rects.push({ item: r.item, x: rx + offset, y: ry, w: cw, h: rh });
                offset += cw;
            } else {
                const ch = sum > 0 ? (r.value / sum) * rh : 0;
                rects.push({ item: r.item, x: rx, y: ry + offset, w: rw, h: ch });
                offset += ch;
            }
        });
    }
    function recurse(list, rx, ry, rw, rh) {
        if (!list.length || rw <= 0 || rh <= 0) return;
        if (list.length === 1) { rects.push({ item: list[0].item, x: rx, y: ry, w: rw, h: rh }); return; }
        const shortSide = Math.min(rw, rh);
        let row = [list[0]], i = 1;
        while (i < list.length) {
            const testRow = row.concat([list[i]]);
            if (worst(testRow, shortSide) <= worst(row, shortSide)) { row = testRow; i++; }
            else break;
        }
        const rowSum = row.reduce((a, b) => a + b.value, 0);
        const total  = list.reduce((a, b) => a + b.value, 0);
        if (rw >= rh) {
            const rowW = total > 0 ? (rowSum / total) * rw : 0;
            layoutRow(row, rx, ry, rowW, rh, false);
            recurse(list.slice(i), rx + rowW, ry, rw - rowW, rh);
        } else {
            const rowH = total > 0 ? (rowSum / total) * rh : 0;
            layoutRow(row, rx, ry, rw, rowH, true);
            recurse(list.slice(i), rx, ry + rowH, rw, rh - rowH);
        }
    }
    const sorted = [...items].sort((a, b) => b.value - a.value).filter(it => it.value > 0);
    recurse(sorted, x, y, w, h);
    return rects;
}

const TREEMAP_W = 960, TREEMAP_H = 420;

function Treemap({ topFiles, byType }) {
    const rects = useMemo(() => {
        const docBytes = byType?.find(t => t.type === "doc")?.avgBytes || 0;
        const items = (topFiles || []).slice(0, 23).map(f => ({
            item: { url: f.url, resourceType: f.resourceType, bytes: (f.avgKb || 0) * 1024, occurrences: f.occurrences },
            value: Math.max(0, (f.avgKb || 0) * 1024),
        }));
        if (docBytes > 0) {
            items.push({ item: { url: "(document)", resourceType: "doc", bytes: docBytes, occurrences: null }, value: docBytes });
        }
        return squarify(items.filter(it => it.value > 0), 0, 0, TREEMAP_W, TREEMAP_H);
    }, [topFiles, byType]);

    if (!rects.length) return null;

    return (
        <svg viewBox={`0 0 ${TREEMAP_W} ${TREEMAP_H}`} className="sa-treemap-svg" preserveAspectRatio="none">
            {rects.map((r, i) => {
                const f = r.item;
                const color = TYPE_COLOR[bucketOf(f.resourceType)] || TYPE_COLOR.other;
                const name = f.url === "(document)" ? "Document (HTML)" : (String(f.url || "").split("/").pop() || f.url || "resource");
                const canLabel = r.w > 46 && r.h > 24;
                const maxChars = Math.max(3, Math.floor(r.w / 6.5) - 1);
                const label = name.length > maxChars ? name.slice(0, maxChars) + "…" : name;
                return (
                    <g key={i}>
                        <rect x={r.x} y={r.y} width={Math.max(0, r.w - 1)} height={Math.max(0, r.h - 1)}
                              fill={color} stroke="rgba(10,10,20,0.55)" strokeWidth="1" rx="2">
                            <title>{`${f.url}\n${RES_TYPE_LABEL[f.resourceType] || f.resourceType || "other"} · ${fmtBytes(f.bytes)}${f.occurrences ? ` · seen on ${f.occurrences} pageload(s)` : ""}`}</title>
                        </rect>
                        {canLabel && (
                            <>
                                <text x={r.x + 6} y={r.y + 15} fontSize="11" fontWeight="700"
                                      fill="#fff" stroke="rgba(0,0,0,0.55)" strokeWidth="3" paintOrder="stroke"
                                      style={{ pointerEvents: "none" }}>
                                    {label}
                                </text>
                                {r.h > 40 && (
                                    <text x={r.x + 6} y={r.y + 29} fontSize="10"
                                          fill="#fff" stroke="rgba(0,0,0,0.55)" strokeWidth="3" paintOrder="stroke"
                                          style={{ pointerEvents: "none" }}>
                                        {fmtBytes(f.bytes)}
                                    </text>
                                )}
                            </>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}

function TreemapLegend({ byType }) {
    if (!byType?.length) return null;
    const total = byType.reduce((s, t) => s + t.avgBytes, 0);
    const sorted = [...byType].sort((a, b) => b.avgBytes - a.avgBytes);
    return (
        <div className="sa-treemap-legend">
            {sorted.map(t => (
                <div key={t.type} className="sa-treemap-legend__item">
                    <span className="sa-treemap-legend__swatch" style={{ background: TYPE_COLOR[t.type] || TYPE_COLOR.other }} />
                    <span className="sa-treemap-legend__label">{TYPE_LABEL[t.type] || t.type}</span>
                    <span className="sa-treemap-legend__value">{fmtBytes(t.avgBytes)}</span>
                    {total > 0 && <span className="sa-treemap-legend__pct sa-muted">{formatPercent(t.avgBytes / total * 100, 0)}</span>}
                </div>
            ))}
        </div>
    );
}

// ── Top files table ─────────────────────────────────────────────────────
const PAGE_SIZE = 8;

function TablePager({ page, setPage, total }) {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    if (totalPages <= 1) return null;
    return (
        <div className="sa-table-pager">
            <button className="sa-table-pager__btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>&#8249;</button>
            <span className="sa-table-pager__info">{page + 1} / {totalPages}</span>
            <button className="sa-table-pager__btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>&#8250;</button>
        </div>
    );
}

function TopFilesTable({ rows }) {
    const [page, setPage] = useState(0);
    if (!rows?.length) return null;
    const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    return (
        <div className="sa-table-wrap">
        <table className="sa-table">
            <thead>
                <tr>
                    <th>File</th>
                    <th>Type</th>
                    <th className="sa-num">Avg size</th>
                    <th className="sa-num">Seen</th>
                </tr>
            </thead>
            <tbody>
                {pageRows.map((r, i) => (
                    <tr key={page * PAGE_SIZE + i}>
                        <td><code style={{ wordBreak: "break-all", fontSize: "12px" }}>{r.url || "—"}</code></td>
                        <td className="sa-muted">{RES_TYPE_LABEL[r.resourceType] || r.resourceType || "—"}</td>
                        <td className="sa-num" style={{ fontWeight: 600 }}>{r.avgKb > 0 ? `${r.avgKb.toLocaleString("de-DE")} KB` : "—"}</td>
                        <td className="sa-num sa-muted">{r.occurrences}</td>
                    </tr>
                ))}
            </tbody>
        </table>
        <TablePager page={page} setPage={setPage} total={rows.length} />
        </div>
    );
}

// ── Diagnostics & recommendations rule engine ────────────────────────────
// Every rule is grounded in a number this endpoint actually measured; where
// a savings figure needs a heuristic multiplier (unused-JS / image-
// compression ratios, in the same spirit as Lighthouse's own opportunity
// estimates) it's marked `estimated: true` so the UI can caption it as such
// instead of presenting a guess as a precise fact.
function buildDiagnostics({ totals, byType, slowResources, longTasks }) {
    const byTypeMap = {};
    (byType || []).forEach(t => { byTypeMap[t.type] = t.avgBytes; });
    const out = [];

    if (totals.tbtP75 != null && totals.tbtP75 > 200) {
        const worst = longTasks?.[0];
        out.push({
            id: "tbt",
            severity: totals.tbtP75 >= 600 ? "poor" : "needs-improvement",
            title: "Break up long JavaScript tasks",
            detail: `Total Blocking Time is ${fmtMs(totals.tbtP75)} at P75, delaying how soon the page responds to input.` +
                (worst?.src ? ` The largest single contributor is ${worst.src}.` : ""),
            savingsLabel: `${fmtMs(totals.tbtP75)} of main-thread blocking`,
            estimated: false,
        });
    }

    if (totals.ttfbP75 != null && totals.ttfbP75 > 800) {
        out.push({
            id: "ttfb",
            severity: totals.ttfbP75 >= 1800 ? "poor" : "needs-improvement",
            title: "Speed up server response time",
            detail: `Time to First Byte is ${fmtMs(totals.ttfbP75)} at P75 — above the 800 ms "good" threshold. Consider caching, a CDN, or reducing backend work on the critical request.`,
            savingsLabel: `~${fmtMs(totals.ttfbP75 - 800)} reachable`,
            estimated: false,
        });
    }

    const scriptBytes = byTypeMap.script || 0;
    if (scriptBytes > 300 * 1024) {
        out.push({
            id: "js",
            severity: scriptBytes >= 600 * 1024 ? "poor" : "needs-improvement",
            title: "Reduce unused JavaScript",
            detail: `Scripts average ${fmtBytes(scriptBytes)} per page load. Code-splitting and removing unused libraries typically cut a meaningful share of this.`,
            savingsLabel: `~${fmtBytes(scriptBytes * 0.3)} typically removable`,
            estimated: true,
        });
    }

    const imgBytes = byTypeMap.img || 0;
    if (imgBytes > 500 * 1024) {
        out.push({
            id: "img",
            severity: imgBytes >= 1024 * 1024 ? "poor" : "needs-improvement",
            title: "Compress & modernize images",
            detail: `Images average ${fmtBytes(imgBytes)} per page load. Serving WebP/AVIF and right-sizing images for their display dimensions usually recovers a large share of this.`,
            savingsLabel: `~${fmtBytes(imgBytes * 0.35)} typically recoverable`,
            estimated: true,
        });
    }

    const fontBytes = byTypeMap.font || 0;
    if (fontBytes > 100 * 1024) {
        out.push({
            id: "font",
            severity: "needs-improvement",
            title: "Subset & preload fonts",
            detail: `Fonts average ${fmtBytes(fontBytes)} per page load. Subsetting to used character sets and using woff2 usually shrinks this substantially.`,
            savingsLabel: `~${fmtBytes(fontBytes * 0.25)} typically recoverable`,
            estimated: true,
        });
    }

    const xhrBytes = byTypeMap.xhr || 0;
    if (xhrBytes > 200 * 1024) {
        out.push({
            id: "xhr",
            severity: "needs-improvement",
            title: "Review third-party & API payloads",
            detail: `XHR/fetch responses average ${fmtBytes(xhrBytes)} per page load. Check for anything non-critical to first render that could be deferred or trimmed.`,
            savingsLabel: `${fmtBytes(xhrBytes)} in scope to review`,
            estimated: false,
        });
    }

    if (totals.clsP75 != null && totals.clsP75 > 0.1) {
        out.push({
            id: "cls",
            severity: totals.clsP75 >= 0.25 ? "poor" : "needs-improvement",
            title: "Reserve space to prevent layout shift",
            detail: `Cumulative Layout Shift is ${totals.clsP75.toFixed(3).replace(".", ",")} at P75 — above the 0,1 "good" threshold. Set explicit width/height on images and ad slots, and avoid injecting content above existing content.`,
            savingsLabel: null,
            estimated: false,
        });
    }

    if (totals.avgPageWeight != null && totals.avgPageWeight > 3 * 1024 * 1024) {
        out.push({
            id: "weight",
            severity: pageWeightSeverity(totals.avgPageWeight),
            title: "Trim overall page weight",
            detail: `Pages average ${fmtBytes(totals.avgPageWeight)} — heavier pages take longer to load, especially on mobile networks. See the breakdown above for the biggest contributors.`,
            savingsLabel: `Target under ${fmtBytes(3 * 1024 * 1024)}`,
            estimated: false,
        });
    }

    const slowest = slowResources?.[0];
    if (slowest && slowest.avgDur > 1000) {
        out.push({
            id: "slow-file",
            severity: slowest.avgDur >= 2500 ? "poor" : "needs-improvement",
            title: "Fix the slowest-loading file",
            detail: `${slowest.url || "A resource"} takes ${fmtMs(slowest.avgDur)} on average to load. Consider preloading, a faster host/CDN, or splitting it up.`,
            savingsLabel: `~${fmtMs(Math.max(0, slowest.avgDur - 200))} if brought under 200 ms`,
            estimated: false,
        });
    }

    const severityRank = { poor: 0, "needs-improvement": 1 };
    return out.sort((a, b) => (severityRank[a.severity] ?? 2) - (severityRank[b.severity] ?? 2));
}

function DiagnosticsPanel({ diagnostics }) {
    if (!diagnostics.length) {
        return (
            <p className="sa-perf-scope-note">No issues flagged for this range — page weight and blocking time are within good thresholds.</p>
        );
    }
    return (
        <div className="sa-diag-list">
            {diagnostics.map(d => (
                <div key={d.id} className="sa-diag-item" style={{ borderLeftColor: SEVERITY_COLOR[d.severity] || "rgba(160,160,180,0.4)" }}>
                    <div className="sa-diag-item__head">
                        <span className="sa-diag-item__title">{d.title}</span>
                        {d.severity && (
                            <span className="sa-perf-badge" style={{ color: SEVERITY_COLOR[d.severity], borderColor: SEVERITY_COLOR[d.severity] }}>
                                {SEVERITY_LABEL[d.severity]}
                            </span>
                        )}
                    </div>
                    <p className="sa-diag-item__detail">{d.detail}</p>
                    {d.savingsLabel && (
                        <div className="sa-diag-item__savings">
                            <span className="sa-diag-item__savings-label">{d.estimated ? "Estimated savings" : "Measured impact"}</span>
                            <span className="sa-diag-item__savings-value">{d.savingsLabel}</span>
                        </div>
                    )}
                </div>
            ))}
            <p className="sa-perf-scope-note">
                "Estimated savings" figures use typical compression/removal ratios (similar to Lighthouse's opportunity estimates) applied to measured byte totals — treat them as directional, not exact. "Measured impact" figures are the actual P75 numbers observed.
            </p>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function PageWeight() {
    document.title = "Page Weight | Site Analytics";

    const {
        domain,
        getLastDays, setLastDays,
        fromDate, setFromDate,
        toDate, setToDate,
        fromIso, toIso,
    } = useAnalyticsPageChrome();

    const { data, loading } = usePageWeightReport(domain, fromIso, toIso);
    const showData = data && !data.noData && !data.noPageWeightYet;

    const diagnostics = useMemo(() => {
        if (!showData) return [];
        return buildDiagnostics(data);
    }, [showData, data]);

    const weightSeverity = showData ? pageWeightSeverity(data.totals.avgPageWeight) : null;
    const weightColor = weightSeverity ? (weightSeverity === "good" ? "rgba(34,197,94,0.9)" : SEVERITY_COLOR[weightSeverity]) : "rgba(130,130,130,0.5)";

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Page Weight"
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
                        <p className="sa-notice">Select a domain to view page weight data.</p>
                    )}
                    {domain && loading && <p className="sa-notice">Loading&hellip;</p>}
                    {domain && !loading && data?.noData && (
                        <div className="sa-perf-empty">
                            <h3>No performance data yet</h3>
                            <p>The embed script collects page weight automatically once deployed. Data appears after visitors begin interacting with the site.</p>
                        </div>
                    )}
                    {domain && !loading && data?.noPageWeightYet && (
                        <div className="sa-perf-empty">
                            <h3>Page weight data is on its way</h3>
                            <p>This site is already sending Core Web Vitals, but page-weight tracking was added to the embed script more recently — existing cached embeds pick it up automatically, and rows appear here once fresh page loads report it.</p>
                        </div>
                    )}

                    {showData && (
                        <>
                            <div className="sa-perf-section-label">Overview</div>
                            <div className="sa-perf-cwv-row" style={{ gridTemplateColumns: "1fr" }}>
                                <div className="sa-perf-cwv-card" style={{ borderColor: weightColor }}>
                                    <div className="sa-perf-cwv-card__label">Avg. page weight</div>
                                    <div className="sa-perf-cwv-card__value" style={{ color: weightColor }}>
                                        {fmtBytes(data.totals.avgPageWeight)}
                                        <WeightDeltaChip current={data.totals.avgPageWeight} prev={data.prevTotals?.avgPageWeight} />
                                    </div>
                                    <div className="sa-perf-cwv-card__desc">
                                        P75: {fmtBytes(data.totals.p75PageWeight)} · based on {data.totals.sampleSize.toLocaleString("de-DE")} page loads.
                                        {data.prevPeriod && (
                                            <span className="sa-muted" style={{ display: "block", marginTop: 4, fontSize: 11 }}>
                                                Prev. period: {data.prevPeriod.from} – {data.prevPeriod.to}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="sa-perf-2col" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconDocument className="sa-icon" /> Page composition
                                    </h3>
                                    <p className="sa-panel__desc">
                                        Every tracked file, sized by average transfer bytes across page loads. Bigger tile = more bytes. Hover a tile for details.
                                    </p>
                                    <div className="sa-treemap-wrap">
                                        <Treemap topFiles={data.topFiles} byType={data.byType} />
                                    </div>
                                    <TreemapLegend byType={data.byType} />
                                </div>
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconAlertTriangle className="sa-icon" /> Diagnostics & recommendations
                                    </h3>
                                    <p className="sa-panel__desc">
                                        Rule-based checks against the measured totals for this range, ranked by impact.
                                    </p>
                                    <DiagnosticsPanel diagnostics={diagnostics} />
                                </div>
                            </div>

                            {data.topFiles?.length > 0 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconDocument className="sa-icon" /> Largest files
                                    </h3>
                                    <p className="sa-panel__desc">
                                        Every file behind the treemap above, ranked by average transfer size.
                                    </p>
                                    <TopFilesTable rows={data.topFiles} />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
