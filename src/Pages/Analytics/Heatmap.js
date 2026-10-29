const { useState, useEffect, useMemo, useRef } = React;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import heatmapLogo from "../../Components/Header/icons/heatmap.svg";
import { authHeaders, useAnalyticsPageChrome, elementLabel, useCompareRange } from "./_shared.js";
import { IconCursorClick, IconTarget, IconTrendingUp } from "./Icons.js";
import "./Analytics.css";

const HEATMAP_URL    = `${ScannerHost}/api/analytics-heatmap`;
const SCREENSHOT_URL = `${ScannerHost}/api/analytics-screenshot`;

const DEVICES = [
    { value: "",        label: "All devices" },
    { value: "desktop", label: "Desktop" },
    { value: "tablet",  label: "Tablet" },
    { value: "mobile",  label: "Mobile" },
];

// Cool-to-hot scale (blue → teal → yellow → red) instead of one beige tone
// at varying opacity — a single low-saturation colour at low alpha reads as
// "barely there" against light page backgrounds, and gives no way to read
// density at a glance without hovering every dot.
const HEAT_STOPS = [
    [59, 130, 246],   // blue   — fewest clicks
    [45, 212, 191],   // teal
    [250, 204, 21],   // yellow
    [239, 68, 68],    // red    — most clicks
];

function intensityColor(t) {
    t = Math.min(1, Math.max(0, t));
    const seg = t * (HEAT_STOPS.length - 1);
    const i = Math.min(HEAT_STOPS.length - 2, Math.floor(seg));
    const f = seg - i;
    const [r1, g1, b1] = HEAT_STOPS[i];
    const [r2, g2, b2] = HEAT_STOPS[i + 1];
    const r = Math.round(r1 + (r2 - r1) * f);
    const g = Math.round(g1 + (g2 - g1) * f);
    const b = Math.round(b1 + (b2 - b1) * f);
    // Floor of 0.45 so even the lowest-density dot stays visible on a light
    // background — pure opacity scaling let low-count dots fade to nothing.
    const alpha = 0.45 + t * 0.45;
    return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
}

function HeatmapLegend() {
    const gradient = `linear-gradient(90deg, ${HEAT_STOPS.map(([r, g, b]) => `rgb(${r},${g},${b})`).join(", ")})`;
    return (
        <div className="sa-heatmap__legend">
            <span className="sa-heatmap__legend-label">Fewer clicks</span>
            <div className="sa-heatmap__legend-bar" style={{ background: gradient }} />
            <span className="sa-heatmap__legend-label">More clicks</span>
        </div>
    );
}

function usePaths(domain, fromIso, toIso) {
    const [paths,     setPaths]     = useState([]);
    const [loading,   setLoading]   = useState(false);
    const [noSiteKey, setNoSiteKey] = useState(false);

    useEffect(() => {
        if (!domain) { setPaths([]); return; }
        setLoading(true);
        const qs = new URLSearchParams({ domain, from: fromIso, to: toIso }).toString();
        fetch(`${HEATMAP_URL}?${qs}`, { headers: authHeaders() })
            .then(async r => (r.ok ? r.json() : null))
            .then(d => { setNoSiteKey(!!d?.noSiteKey); setPaths(d?.paths || []); })
            .catch(() => setPaths([]))
            .finally(() => setLoading(false));
    }, [domain, fromIso, toIso]);

    return { paths, loading, noSiteKey };
}

function useHeatmapDetail(domain, pathname, host, device, fromIso, toIso) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState(null);

    useEffect(() => {
        if (!domain || !pathname) { setData(null); return; }
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({
            domain, pathname, from: fromIso, to: toIso,
            ...(host   ? { host }   : {}),
            ...(device ? { device } : {}),
        }).toString();
        fetch(`${HEATMAP_URL}?${qs}`, { headers: authHeaders() })
            .then(async r => { if (!r.ok) throw new Error(r.status); setData(await r.json()); })
            .catch(() => setError("Could not load heatmap data."))
            .finally(() => setLoading(false));
    }, [domain, pathname, host, device, fromIso, toIso]);

    return { data, loading, error };
}

function usePageScreenshot(domain, pathname, device) {
    const [screenshotUrl,     setScreenshotUrl]     = useState(null);
    const [screenshotLoading, setScreenshotLoading] = useState(false);

    useEffect(() => {
        if (!domain || !pathname) { setScreenshotUrl(null); return; }
        let objectUrl = null;
        setScreenshotLoading(true);
        // "All devices" (device === "") has no single matching viewport —
        // falls back to the endpoint's own default (1280×720) rather than
        // picking one device's size to represent a mix of all of them.
        const qs = new URLSearchParams({
            domain, path: pathname, fullPage: "1",
            ...(device ? { device } : {}),
        }).toString();
        fetch(`${SCREENSHOT_URL}?${qs}`, { headers: authHeaders() })
            .then(r => r.ok ? r.blob() : null)
            .then(blob => {
                if (!blob) return;
                objectUrl = URL.createObjectURL(blob);
                setScreenshotUrl(objectUrl);
            })
            .catch(() => {})
            .finally(() => setScreenshotLoading(false));

        return () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            setScreenshotUrl(null);
        };
    }, [domain, pathname, device]);

    return { screenshotUrl, screenshotLoading };
}

function ClickOverlay({ domain, pathname, device, clicks }) {
    const maxN    = useMemo(() => Math.max(...clicks.map(c => c.n), 1), [clicks]);
    const imgRef  = useRef(null);
    const wrapRef = useRef(null);
    const { screenshotUrl, screenshotLoading } = usePageScreenshot(domain, pathname, device);
    const [svgHeight,     setSvgHeight]     = useState(null);
    // naturalAspect = naturalHeight / naturalWidth — kept separate from svgHeight
    // because it doesn't change on window resize (only svgHeight does).
    const [naturalAspect, setNaturalAspect] = useState(1);
    // Custom tooltip instead of relying solely on the SVG <title> — a native
    // title tooltip has a long hover delay and no styling, easy to miss on
    // a 2-unit-radius dot that may be scaled down to just a few screen
    // pixels on a tall full-page screenshot.
    const [hover, setHover] = useState(null);

    function showTooltip(e, n) {
        const rect = wrapRef.current?.getBoundingClientRect();
        if (!rect) return;
        setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, n });
    }

    function calcDimensions(img) {
        if (!img?.naturalWidth || !img.offsetWidth) return;
        const aspect = img.naturalHeight / img.naturalWidth;
        setNaturalAspect(aspect);
        setSvgHeight(Math.round(img.offsetWidth * aspect));
    }

    useEffect(() => { setSvgHeight(null); setNaturalAspect(1); }, [screenshotUrl]);

    useEffect(() => {
        function onResize() {
            const img = imgRef.current;
            if (!img?.naturalWidth || !img.offsetWidth) return;
            setSvgHeight(Math.round(img.offsetWidth * (img.naturalHeight / img.naturalWidth)));
        }
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // The viewBox x-axis covers 0–100 (page-width %) and y-axis covers
    // 0–(100*naturalAspect) so that 1 SVG unit = the same number of screen
    // pixels in both axes → r=2 renders as a true circle, not an oval.
    const viewBox = `0 0 100 ${(100 * naturalAspect).toFixed(3)}`;

    return (
        <div className="sa-heatmap__frame-outer">
            <div className="sa-heatmap__frame-wrap" ref={wrapRef}>
                {screenshotLoading ? (
                    <div className="sa-heatmap__frame-fallback">Loading page preview&hellip;</div>
                ) : screenshotUrl ? (
                    <img
                        ref={imgRef}
                        className="sa-heatmap__frame-img"
                        src={screenshotUrl}
                        alt="Page preview"
                        draggable={false}
                        onLoad={e => calcDimensions(e.target)}
                    />
                ) : (
                    <div className="sa-heatmap__frame-fallback">Page preview unavailable.</div>
                )}
                {svgHeight !== null && (
                    <svg
                        className="sa-heatmap__overlay"
                        viewBox={viewBox}
                        preserveAspectRatio="none"
                        style={{ height: svgHeight }}
                    >
                        {clicks.map((c, i) => (
                            <circle
                                key={i}
                                cx={c.gx}
                                cy={c.gy * naturalAspect}
                                r={2}
                                fill={intensityColor(c.n / maxN)}
                                stroke="rgba(255,255,255,0.65)"
                                strokeWidth={0.3}
                                onMouseEnter={e => showTooltip(e, c.n)}
                                onMouseMove={e => showTooltip(e, c.n)}
                                onMouseLeave={() => setHover(null)}
                            >
                                <title>{c.n} click{c.n !== 1 ? "s" : ""}</title>
                            </circle>
                        ))}
                    </svg>
                )}
                {hover && (
                    <div
                        className="sa-heatmap__tooltip"
                        style={{ left: hover.x, top: hover.y }}
                    >
                        {hover.n} click{hover.n !== 1 ? "s" : ""}
                    </div>
                )}
            </div>
            <HeatmapLegend />
        </div>
    );
}

function ScrollFunnel({ scrollDepth }) {
    const total = scrollDepth.reduce((s, b) => s + b.n, 0);
    if (!total) return <p className="sa-notice">No scroll data for this page yet.</p>;

    const buckets  = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
    const byBucket = new Map(scrollDepth.map(b => [b.bucket, b.n]));
    let cumulative = 0;
    const rows = buckets.slice().reverse().map(b => {
        cumulative += byBucket.get(b) || 0;
        return { bucket: b, reached: cumulative };
    }).reverse();
    const maxReached = Math.max(...rows.map(r => r.reached), 1);

    return (
        <div className="sa-scroll-funnel">
            <p className="sa-heatmap__sample-size sa-heatmap__sample-size--inline">
                Based on {maxReached.toLocaleString("de-DE")} session{maxReached !== 1 ? "s" : ""}
            </p>
            {rows.map(r => (
                <div key={r.bucket} className="sa-consent-row">
                    <span className="sa-consent-row__label">{r.bucket}%+</span>
                    <div className="sa-bar">
                        <div className="sa-bar__seg"
                            style={{ width: Math.round((r.reached / maxReached) * 100) + "%", background: "rgba(192,159,83,0.55)" }}
                            title={`${r.reached} sessions reached ${r.bucket}%+`} />
                    </div>
                    <span className="sa-consent-row__pct">{r.reached}</span>
                </div>
            ))}
        </div>
    );
}

export default function AnalyticsHeatmap() {
    document.title = "Heatmap | Site Analytics";

    const {
        domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate, fromIso, toIso,
    } = useAnalyticsPageChrome();

    const { paths, loading: pathsLoading, noSiteKey } = usePaths(domain, fromIso, toIso);
    const [selected, setSelected] = useState(null);
    const [device,   setDevice]   = useState("");

    const pathKey   = p => `${p.host} ${p.pathname}`;
    const multiHost = useMemo(() => new Set(paths.map(p => p.host)).size > 1, [paths]);

    useEffect(() => {
        if (!selected && paths.length) setSelected({ pathname: paths[0].pathname, host: paths[0].host });
    }, [paths, selected]);

    const { data, loading, error } = useHeatmapDetail(
        domain, selected?.pathname, selected?.host, device, fromIso, toIso
    );

    // Compare-to-previous-period header wiring (Phase 3, docs/design-audit-plan.md).
    const compare = useCompareRange();

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                className="sa-sticky-header"
                title="Heatmap"
                titleLogo={heatmapLogo}
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
                    {!domain && (
                        <p className="sa-notice">Select a domain in the header to view the heatmap.</p>
                    )}
                    {domain && pathsLoading && <p className="sa-notice">Loading&hellip;</p>}
                    {domain && !pathsLoading && noSiteKey && (
                        <p className="sa-notice">No analytics set up for this domain yet.</p>
                    )}
                    {domain && !pathsLoading && !noSiteKey && !paths.length && (
                        <p className="sa-notice">No click data yet for the selected period. Clicks appear once visitors accept statistics cookies.</p>
                    )}

                    {domain && !!paths.length && (
                        <div className="sa-heatmap-grid">

                            {/* ── Controls ─────────────────────────────────── */}
                            <div className="sa-heatmap__controls">
                                <select
                                    className="sa-select sa-heatmap__path-select"
                                    value={selected ? pathKey(selected) : ""}
                                    onChange={e => {
                                        const match = paths.find(p => pathKey(p) === e.target.value);
                                        if (match) setSelected({ pathname: match.pathname, host: match.host });
                                    }}
                                >
                                    {paths.map(p => (
                                        <option key={pathKey(p)} value={pathKey(p)}>
                                            {multiHost ? `${p.host}${p.pathname}` : p.pathname} ({p.clicks.toLocaleString("de-DE")} clicks)
                                        </option>
                                    ))}
                                </select>
                                <div className="sa-heatmap__device-tabs">
                                    {DEVICES.map(d => (
                                        <button
                                            key={d.value || "all"}
                                            type="button"
                                            className={"sa-heatmap__device-tab" + (device === d.value ? " --active" : "")}
                                            onClick={() => setDevice(d.value)}
                                        >
                                            {d.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* ── Viewport hero ────────────────────────────── */}
                            <div className="sa-heatmap__viewport">
                                <div className="sa-heatmap__viewport-label">
                                    <IconCursorClick className="sa-icon" />
                                    <span>Click heatmap</span>
                                    {data && !loading && !data.noData && (
                                        <span className="sa-heatmap__sample-size">
                                            {data.totalClicks.toLocaleString("de-DE")} clicks · {data.totalSessions.toLocaleString("de-DE")} sessions
                                        </span>
                                    )}
                                </div>
                                {loading ? (
                                    <div className="sa-heatmap__frame-fallback">Loading heatmap&hellip;</div>
                                ) : error ? (
                                    <div className="sa-heatmap__frame-fallback --error">{error}</div>
                                ) : data?.noData ? (
                                    <div className="sa-heatmap__frame-fallback">No click data for this page/device combination.</div>
                                ) : data ? (
                                    <ClickOverlay domain={domain} pathname={data.pathname} device={device} clicks={data.clicks} />
                                ) : null}
                            </div>

                            {/* ── Sidebar ──────────────────────────────────── */}
                            <div className="sa-heatmap__sidecar">
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title"><IconTrendingUp className="sa-icon" /> Scroll depth</h3>
                                    {data && !loading
                                        ? <ScrollFunnel scrollDepth={data.scrollDepth || []} />
                                        : <p className="sa-notice" style={{ fontSize: "0.8rem" }}>—</p>}
                                </div>

                                <div className="sa-panel">
                                    <h3 className="sa-panel__title"><IconTarget className="sa-icon" /> Top clicked elements</h3>
                                    {data && !loading && !data.noData && (
                                        <p className="sa-heatmap__sample-size sa-heatmap__sample-size--inline">
                                            Based on {data.totalSessions.toLocaleString("de-DE")} session{data.totalSessions !== 1 ? "s" : ""}
                                        </p>
                                    )}
                                    <table className="sa-table">
                                        <thead>
                                            <tr>
                                                <th>Element</th>
                                                <th>Selector</th>
                                                <th className="sa-table__num">Clicks</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(data?.topElements || []).map((el, i) => {
                                                const rawSelector = (el.tag || "?")
                                                    + (el.id ? `#${el.id}` : "")
                                                    + (el.className ? `.${String(el.className).split(/\s+/).join(".")}` : "");
                                                return (
                                                    <tr key={i}>
                                                        <td title={el.text || ""}>{elementLabel(el)}</td>
                                                        <td className="sa-heatmap__raw-selector"><code>{rawSelector}</code></td>
                                                        <td className="sa-table__num">{el.n.toLocaleString("de-DE")}</td>
                                                    </tr>
                                                );
                                            })}
                                            {!data?.topElements?.length && (
                                                <tr><td colSpan={3} style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.8rem" }}>No clicks recorded</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
