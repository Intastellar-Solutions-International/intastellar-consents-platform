const { useState, useEffect, useMemo, useRef } = React;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, useAnalyticsPageChrome } from "./_shared.js";
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

function intensityColor(t) {
    const alpha = 0.08 + Math.min(1, Math.max(0, t)) * 0.72;
    return `rgba(192,159,83,${alpha.toFixed(2)})`;
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

function usePageScreenshot(domain, pathname) {
    const [screenshotUrl,     setScreenshotUrl]     = useState(null);
    const [screenshotLoading, setScreenshotLoading] = useState(false);

    useEffect(() => {
        if (!domain || !pathname) { setScreenshotUrl(null); return; }
        let objectUrl = null;
        setScreenshotLoading(true);
        const qs = new URLSearchParams({ domain, path: pathname, fullPage: "1" }).toString();
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
    }, [domain, pathname]);

    return { screenshotUrl, screenshotLoading };
}

function ClickOverlay({ domain, pathname, clicks }) {
    const maxN   = useMemo(() => Math.max(...clicks.map(c => c.n), 1), [clicks]);
    const imgRef = useRef(null);
    const { screenshotUrl, screenshotLoading } = usePageScreenshot(domain, pathname);
    const [svgHeight,     setSvgHeight]     = useState(null);
    // naturalAspect = naturalHeight / naturalWidth — kept separate from svgHeight
    // because it doesn't change on window resize (only svgHeight does).
    const [naturalAspect, setNaturalAspect] = useState(1);

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
            <div className="sa-heatmap__frame-wrap">
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
                            >
                                <title>{c.n} click{c.n !== 1 ? "s" : ""}</title>
                            </circle>
                        ))}
                    </svg>
                )}
            </div>
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

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Heatmap"
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
                                </div>
                                {loading ? (
                                    <div className="sa-heatmap__frame-fallback">Loading heatmap&hellip;</div>
                                ) : error ? (
                                    <div className="sa-heatmap__frame-fallback --error">{error}</div>
                                ) : data?.noData ? (
                                    <div className="sa-heatmap__frame-fallback">No click data for this page/device combination.</div>
                                ) : data ? (
                                    <ClickOverlay domain={domain} pathname={data.pathname} clicks={data.clicks} />
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
                                    <table className="sa-table">
                                        <thead>
                                            <tr>
                                                <th>Element</th>
                                                <th>Text</th>
                                                <th className="sa-table__num">Clicks</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(data?.topElements || []).map((el, i) => (
                                                <tr key={i}>
                                                    <td>
                                                        <code>
                                                            {el.tag || "?"}
                                                            {el.id ? `#${el.id}` : ""}
                                                            {el.className ? `.${String(el.className).split(/\s+/).join(".")}` : ""}
                                                        </code>
                                                    </td>
                                                    <td className="sa-table__path" title={el.text || ""}>{el.text || "—"}</td>
                                                    <td className="sa-table__num">{el.n.toLocaleString("de-DE")}</td>
                                                </tr>
                                            ))}
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
