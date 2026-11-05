import { buildAnalyticsLinks } from "./SideNavLinks/index.js";
import { DomainContext } from "../../App.js";
import { detectDashboardMode, isCombinedOrClearDomain, analyticsReportViewPath } from "../../Functions/domainPathSegments.js";
import { authHeaders } from "../../Pages/Analytics/_shared.js";
import { ScannerHost } from "../../API/host.js";

const { useContext, useEffect, useMemo, useRef, useState } = React;
const useLocation = window.ReactRouterDOM.useLocation;
const useHistory  = window.ReactRouterDOM.useHistory;

const SAVED_REPORTS_URL = `${ScannerHost}/api/analytics-saved-reports`;
const MAX_RESULTS = 8;

/** Global "jump to" search for the Analytics section — ⌘K / Ctrl+K opens
 *  it from anywhere while in analytics mode. Indexes the same static page
 *  list the sidebar already builds (buildAnalyticsLinks — so it never
 *  drifts out of sync with what's actually in the nav) plus the domain's
 *  saved reports (fetched lazily, only while the palette is open). Does
 *  NOT index event names or audiences in v1 — scoped to "any Analytics
 *  sub-page, saved report, or setting" per the brief; adding more sources
 *  later just means pushing another group into `results` below. */
export default function AnalyticsCommandPalette() {
    const location = useLocation();
    const history = useHistory();
    const [globalDomain] = useContext(DomainContext);

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(0);
    const [reports, setReports] = useState([]);
    const inputRef = useRef(null);

    const inAnalytics = detectDashboardMode(location.pathname) === "analytics";

    useEffect(() => {
        function onKeyDown(e) {
            const meta = e.metaKey || e.ctrlKey;
            if (meta && e.key.toLowerCase() === "k") {
                if (!inAnalytics) return;
                e.preventDefault();
                setOpen(o => !o);
            } else if (e.key === "Escape" && open) {
                setOpen(false);
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [inAnalytics, open]);

    useEffect(() => {
        if (!open) return;
        setQuery(""); setSelected(0);
        setTimeout(() => inputRef.current?.focus(), 0);

        if (!isCombinedOrClearDomain(globalDomain)) {
            fetch(`${SAVED_REPORTS_URL}?domain=${encodeURIComponent(globalDomain)}`, { headers: authHeaders() })
                .then(r => r.ok ? r.json() : { reports: [] })
                .then(d => setReports(d.reports || []))
                .catch(() => setReports([]));
        } else {
            setReports([]);
        }
    }, [open, globalDomain]);

    const pageItems = useMemo(() => {
        return buildAnalyticsLinks(globalDomain)
            .filter(l => !l.divider && l.name && l.path)
            .map(l => ({ group: "Pages", name: l.name, path: l.path }));
    }, [globalDomain]);

    const reportItems = useMemo(() => {
        return reports.map(r => ({
            group: "Reports",
            name: r.name || "Untitled report",
            path: analyticsReportViewPath(globalDomain, r.id),
        }));
    }, [reports, globalDomain]);

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        const all = [...pageItems, ...reportItems];
        const matched = q ? all.filter(i => i.name.toLowerCase().includes(q)) : all;
        return matched.slice(0, MAX_RESULTS);
    }, [query, pageItems, reportItems]);

    function go(item) {
        if (!item) return;
        setOpen(false);
        history.push(item.path);
    }

    function onInputKeyDown(e) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelected(i => Math.min(i + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelected(i => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            go(results[selected]);
        }
    }

    if (!inAnalytics || !open) return null;

    let lastGroup = null;

    return (
        <div
            style={{
                position: "fixed", inset: 0, zIndex: 2000,
                background: "rgba(0,0,0,0.5)",
                display: "flex", alignItems: "flex-start", justifyContent: "center",
                paddingTop: "12vh",
            }}
            onClick={() => setOpen(false)}
        >
            <div
                style={{
                    width: "min(560px, 92vw)", maxHeight: "60vh", overflow: "hidden",
                    background: "#1b1b1f", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 10, boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
                    display: "flex", flexDirection: "column",
                }}
                onClick={e => e.stopPropagation()}
            >
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setSelected(0); }}
                    onKeyDown={onInputKeyDown}
                    placeholder="Search Analytics pages and reports…"
                    style={{
                        padding: "14px 16px", fontSize: 15, border: "none",
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        background: "transparent", color: "rgba(230,230,230,0.95)", outline: "none",
                    }}
                />
                <div style={{ overflowY: "auto" }}>
                    {results.length === 0 && (
                        <p style={{ padding: "16px", fontSize: 13, color: "rgba(130,130,130,0.6)" }}>
                            No matches.
                        </p>
                    )}
                    {results.map((item, i) => {
                        const showGroupLabel = item.group !== lastGroup;
                        lastGroup = item.group;
                        return (
                            <div key={`${item.group}:${item.path}:${i}`}>
                                {showGroupLabel && (
                                    <div style={{
                                        padding: "8px 16px 4px", fontSize: 11, fontWeight: 600,
                                        textTransform: "uppercase", letterSpacing: "0.04em",
                                        color: "rgba(130,130,130,0.6)",
                                    }}>
                                        {item.group}
                                    </div>
                                )}
                                <div
                                    onMouseEnter={() => setSelected(i)}
                                    onClick={() => go(item)}
                                    style={{
                                        padding: "10px 16px", cursor: "pointer", fontSize: 14,
                                        color: i === selected ? "rgba(192,159,83,0.95)" : "rgba(210,210,210,0.9)",
                                        background: i === selected ? "rgba(192,159,83,0.08)" : "transparent",
                                    }}
                                >
                                    {item.name}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div style={{
                    padding: "8px 16px", fontSize: 11, color: "rgba(130,130,130,0.5)",
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                }}>
                    ↑↓ to navigate · Enter to open · Esc to close
                </div>
            </div>
        </div>
    );
}
