const { useState, useEffect, useContext, useMemo } = React;
const useParams = window.ReactRouterDOM.useParams;
import { DomainContext } from "../../App.js";
import { useSyncDomainFromRoute, isCombinedOrClearDomain } from "../../Functions/domainPathSegments.js";
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, toIsoDate } from "./_shared.js";
import { IconCursorClick, IconTarget, IconTrendingUp } from "./Icons.js";
import "./Analytics.css";

const HEATMAP_URL = `${ScannerHost}/api/analytics-heatmap`;
const DEVICES = [
    { value: "",        label: "All devices" },
    { value: "desktop",  label: "Desktop" },
    { value: "tablet",   label: "Tablet" },
    { value: "mobile",   label: "Mobile" },
];

// Sequential single-hue intensity ramp (light -> dark) — same amber accent used
// elsewhere in this dashboard (e.g. DailyChart's "full" bars) rather than a
// rainbow scale, so density reads as magnitude, not identity.
function intensityColor(t) {
    const alpha = 0.08 + Math.min(1, Math.max(0, t)) * 0.72;
    return `rgba(192,159,83,${alpha.toFixed(2)})`;
}

function usePaths(domain, fromIso, toIso) {
    const [paths,   setPaths]   = useState([]);
    const [loading, setLoading] = useState(false);
    const [noSiteKey, setNoSiteKey] = useState(false);

    useEffect(() => {
        if (!domain) { setPaths([]); return; }
        setLoading(true);
        const qs = new URLSearchParams({ domain, from: fromIso, to: toIso }).toString();
        fetch(`${HEATMAP_URL}?${qs}`, { headers: authHeaders() })
            .then(async r => (r.ok ? r.json() : null))
            .then(d => {
                setNoSiteKey(!!d?.noSiteKey);
                setPaths(d?.paths || []);
            })
            .catch(() => setPaths([]))
            .finally(() => setLoading(false));
    }, [domain, fromIso, toIso]);

    return { paths, loading, noSiteKey };
}

function useHeatmapDetail(domain, pathname, device, fromIso, toIso) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState(null);

    useEffect(() => {
        if (!domain || !pathname) { setData(null); return; }
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({
            domain, pathname, from: fromIso, to: toIso,
            ...(device ? { device } : {}),
        }).toString();
        fetch(`${HEATMAP_URL}?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                setData(await r.json());
            })
            .catch(() => setError("Could not load heatmap data."))
            .finally(() => setLoading(false));
    }, [domain, pathname, device, fromIso, toIso]);

    return { data, loading, error };
}

function ClickOverlay({ domain, pathname, clicks }) {
    const maxN = useMemo(() => Math.max(...clicks.map(c => c.n), 1), [clicks]);
    const src  = pathname ? `https://${domain}${pathname}` : null;
    const [frameFailed, setFrameFailed] = useState(false);

    useEffect(() => setFrameFailed(false), [src]);

    return (
        <div className="sa-heatmap__frame-wrap">
            {src && !frameFailed && (
                <iframe
                    className="sa-heatmap__frame"
                    src={src}
                    title="Page preview"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    sandbox="allow-same-origin"
                    onError={() => setFrameFailed(true)}
                />
            )}
            {(!src || frameFailed) && (
                <div className="sa-heatmap__frame-fallback">
                    Preview unavailable — the page may block embedding, or hasn't loaded yet.
                </div>
            )}
            <svg className="sa-heatmap__overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
                {clicks.map((c, i) => (
                    <circle
                        key={i}
                        cx={c.gx}
                        cy={c.gy}
                        r={2.2}
                        fill={intensityColor(c.n / maxN)}
                    >
                        <title>{c.n} click{c.n !== 1 ? "s" : ""}</title>
                    </circle>
                ))}
            </svg>
        </div>
    );
}

function ScrollFunnel({ scrollDepth }) {
    const total = scrollDepth.reduce((s, b) => s + b.n, 0);
    if (!total) return <p className="sa-notice">No scroll data for this page yet.</p>;

    // Convert per-bucket counts into "reached at least this depth" (cumulative from the bottom).
    const buckets = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
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

    const { handle } = useParams();
    const [globalDomain, setGlobalDomain] = useContext(DomainContext);
    useSyncDomainFromRoute(handle, setGlobalDomain);

    const domain = useMemo(() => {
        if (isCombinedOrClearDomain(globalDomain)) return null;
        return String(globalDomain || "").trim().toLowerCase();
    }, [globalDomain]);

    const [getLastDays, setLastDays] = useState(30);
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 30); return d;
    });
    const [toDate, setToDate] = useState(() => new Date());
    const fromIso = useMemo(() => toIsoDate(fromDate), [fromDate]);
    const toIso   = useMemo(() => toIsoDate(toDate),   [toDate]);

    const { paths, loading: pathsLoading, noSiteKey } = usePaths(domain, fromIso, toIso);
    const [selectedPath, setSelectedPath] = useState(null);
    const [device, setDevice] = useState("");

    useEffect(() => {
        if (!selectedPath && paths.length) setSelectedPath(paths[0].pathname);
    }, [paths, selectedPath]);

    const { data, loading, error } = useHeatmapDetail(domain, selectedPath, device, fromIso, toIso);

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

                            <div className="sa-heatmap__controls">
                                <select
                                    className="sa-select"
                                    value={selectedPath || ""}
                                    onChange={e => setSelectedPath(e.target.value)}
                                >
                                    {paths.map(p => (
                                        <option key={p.pathname} value={p.pathname}>
                                            {p.pathname} ({p.clicks.toLocaleString("de-DE")} clicks)
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

                            {loading && <p className="sa-notice">Loading heatmap&hellip;</p>}
                            {error && <p className="sa-notice sa-notice--error">{error}</p>}

                            {data && !loading && (
                                <>
                                    <div className="sa-panel sa-heatmap__viewport">
                                        <h3 className="sa-panel__title"><IconCursorClick className="sa-icon" /> Click heatmap</h3>
                                        {data.noData ? (
                                            <p className="sa-notice">No click data for this page/device combination.</p>
                                        ) : (
                                            <ClickOverlay domain={domain} pathname={selectedPath} clicks={data.clicks} />
                                        )}
                                    </div>

                                    <div className="sa-panel sa-heatmap__scroll">
                                        <h3 className="sa-panel__title"><IconTrendingUp className="sa-icon" /> Scroll depth</h3>
                                        <ScrollFunnel scrollDepth={data.scrollDepth || []} />
                                    </div>

                                    <div className="sa-panel sa-heatmap__elements">
                                        <h3 className="sa-panel__title"><IconTarget className="sa-icon" /> Top clicked elements</h3>
                                        <table className="sa-table">
                                            <thead>
                                                <tr>
                                                    <th>Element</th>
                                                    <th className="sa-table__num">Clicks</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(data.topElements || []).map((el, i) => (
                                                    <tr key={i}>
                                                        <td>
                                                            <code>
                                                                {el.tag || "?"}
                                                                {el.id ? `#${el.id}` : ""}
                                                                {el.className ? `.${String(el.className).split(/\s+/).join(".")}` : ""}
                                                            </code>
                                                        </td>
                                                        <td className="sa-table__num">{el.n.toLocaleString("de-DE")}</td>
                                                    </tr>
                                                ))}
                                                {!data.topElements?.length && (
                                                    <tr><td colSpan={2} style={{color:"rgba(130,130,130,0.55)",fontSize:"0.8rem"}}>No clicks recorded</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
