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

/** Visible "jump to" search box, embedded directly in the header while in
 *  analytics mode — ⌘K / Ctrl+K also focuses it from anywhere. Indexes the
 *  same static page list the sidebar already builds (buildAnalyticsLinks —
 *  so it never drifts out of sync with what's actually in the nav) plus the
 *  domain's saved reports (fetched lazily, once per domain while open).
 *  Does NOT index event names or audiences in v1, and does not answer
 *  free-form questions about the data — it only jumps to pages/reports. */
export default function AnalyticsHeaderSearch() {
    const location = useLocation();
    const history = useHistory();
    const [globalDomain] = useContext(DomainContext);

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(0);
    const [reports, setReports] = useState([]);
    const inputRef = useRef(null);
    const wrapperRef = useRef(null);

    const inAnalytics = detectDashboardMode(location.pathname) === "analytics";

    useEffect(() => {
        function onKeyDown(e) {
            const meta = e.metaKey || e.ctrlKey;
            if (meta && e.key.toLowerCase() === "k" && inAnalytics) {
                e.preventDefault();
                inputRef.current?.focus();
                inputRef.current?.select();
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [inAnalytics]);

    useEffect(() => {
        function onClickOutside(e) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, []);

    useEffect(() => {
        if (!open || isCombinedOrClearDomain(globalDomain)) { setReports([]); return; }
        fetch(`${SAVED_REPORTS_URL}?domain=${encodeURIComponent(globalDomain)}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { reports: [] })
            .then(d => setReports(d.reports || []))
            .catch(() => setReports([]));
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
        setQuery("");
        inputRef.current?.blur();
        history.push(item.path);
    }

    function onKeyDownInput(e) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelected(i => Math.min(i + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelected(i => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            go(results[selected]);
        } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
        }
    }

    if (!inAnalytics) return null;

    let lastGroup = null;
    const showDropdown = open;

    return (
        <div ref={wrapperRef} style={{ position: "relative", minWidth: 220 }}>
            <input
                ref={inputRef}
                type="text"
                value={query}
                onFocus={() => setOpen(true)}
                onChange={e => { setQuery(e.target.value); setSelected(0); setOpen(true); }}
                onKeyDown={onKeyDownInput}
                placeholder="Search pages & reports… (⌘K)"
                style={{
                    width: "100%", padding: "7px 12px", fontSize: 13, borderRadius: 7,
                    border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)",
                    color: "rgba(230,230,230,0.95)", outline: "none",
                }}
            />
            {showDropdown && (
                <div style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
                    minWidth: 260, zIndex: 1000, maxHeight: "60vh", overflowY: "auto",
                    background: "#1b1b1f", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8, boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
                }}>
                    {results.length === 0 && (
                        <p style={{ padding: "12px 14px", fontSize: 13, color: "rgba(130,130,130,0.6)" }}>
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
                                        padding: "8px 14px 4px", fontSize: 11, fontWeight: 600,
                                        textTransform: "uppercase", letterSpacing: "0.04em",
                                        color: "rgba(130,130,130,0.6)",
                                    }}>
                                        {item.group}
                                    </div>
                                )}
                                <div
                                    onMouseEnter={() => setSelected(i)}
                                    onMouseDown={e => { e.preventDefault(); go(item); }}
                                    style={{
                                        padding: "9px 14px", cursor: "pointer", fontSize: 13,
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
            )}
        </div>
    );
}
