const { useState, useEffect, useCallback } = React;
const useHistory = window.ReactRouterDOM.useHistory;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, useAnalyticsPageChrome } from "./_shared.js";
import { analyticsReportBuilderPath, analyticsReportViewPath } from "../../Functions/domainPathSegments.js";
import { REPORT_TEMPLATES, CATEGORY_ORDER, CT_SVG, METRIC_LABELS, CATEGORY_COLOR } from "./reportTemplates.js";
import "./Analytics.css";

const REPORTS_URL = `${ScannerHost}/api/analytics-saved-reports`;

const CHART_TYPE_LABELS = { line: "Line", bar: "Bar", table: "Table", kpi: "KPI", donut: "Donut" };
const BREAKDOWN_LABELS  = {
    date: "by date", country: "by country", device: "by device",
    utmSource: "by UTM source", browser: "by browser", channel: "by channel", none: "totals only",
};

function fmtDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({ tpl, domain }) {
    const history  = useHistory();
    const catColor = CATEGORY_COLOR[tpl.category] || "rgba(192,159,83,0.7)";
    return (
        <div className="sa-tpl-card" onClick={() => history.push(analyticsReportBuilderPath(domain) + `?tpl=${tpl.key}`)}>
            <div className="sa-tpl-card__header">
                <span className="sa-tpl-card__icon" style={{ color: catColor }}>{CT_SVG[tpl.chartType]}</span>
                <span className="sa-tpl-card__cat" style={{ color: catColor }}>{tpl.category}</span>
            </div>
            <div className="sa-tpl-card__name">{tpl.name}</div>
            <div className="sa-tpl-card__desc">{tpl.description}</div>
            <div className="sa-tpl-card__meta">{tpl.metrics.map(m => METRIC_LABELS[m]||m).join(", ")} · {CHART_TYPE_LABELS[tpl.chartType]}</div>
            <div className="sa-tpl-card__use">Use template →</div>
        </div>
    );
}

// ── Mini preview thumbnail ────────────────────────────────────────────────────

function MiniPreview({ report }) {
    const heights = [55, 70, 48, 85, 62, 90, 58, 75, 68, 82];

    if (report.chart_type === "kpi") {
        return (
            <div className="sa-report-card__preview" style={{ display: "flex", gap: 6, alignItems: "center", padding: 8 }}>
                {(report.metrics || ["sessions"]).slice(0, 3).map(m => (
                    <div key={m} style={{ flex: 1, background: "rgba(192,159,83,0.08)", borderRadius: 4, padding: "4px 6px" }}>
                        <div style={{ fontSize: 9, color: "rgba(130,130,130,0.55)" }}>{(METRIC_LABELS[m]||m).toUpperCase()}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(210,210,210,0.88)" }}>—</div>
                    </div>
                ))}
            </div>
        );
    }
    if (report.chart_type === "donut") {
        const r = 20, circ = 2 * Math.PI * r;
        return (
            <div className="sa-report-card__preview" style={{ alignItems: "center", justifyContent: "center" }}>
                <svg width="48" height="48" viewBox="0 0 48 48" style={{ transform: "rotate(-90deg)" }}>
                    <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
                    <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(192,159,83,0.85)" strokeWidth="8"
                        strokeDasharray={circ} strokeDashoffset={circ * 0.38} />
                </svg>
            </div>
        );
    }
    if (report.chart_type === "table") {
        return (
            <div className="sa-report-card__preview" style={{ flexDirection: "column", gap: 3, padding: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(130,130,130,0.55)", paddingBottom: 3, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <span>{BREAKDOWN_LABELS[report.breakdown]||"DIM"}</span>
                    <span>{(METRIC_LABELS[report.metrics?.[0]]||"VALUE").toUpperCase()}</span>
                </div>
                {[0,1,2].map(i => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ width: 60, background: "rgba(255,255,255,0.07)", borderRadius: 2, height: 7, marginTop: 3, display: "block" }} />
                        <span style={{ width: 28, background: "rgba(255,255,255,0.07)", borderRadius: 2, height: 7, marginTop: 3, display: "block" }} />
                    </div>
                ))}
            </div>
        );
    }
    return (
        <div className="sa-report-card__preview" style={{ alignItems: "flex-end", gap: 2, padding: "8px 8px 0" }}>
            {heights.map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: "2px 2px 0 0",
                    background: `rgba(192,159,83,${0.3 + (h/90)*0.55})` }} />
            ))}
        </div>
    );
}

// ── Saved report card ─────────────────────────────────────────────────────────

function ReportCard({ report, onDelete, onDuplicate }) {
    const history  = useHistory();
    const [del,    setDel]    = useState(false);
    const [dup,    setDup]    = useState(false);

    async function handleDelete(e) {
        e.stopPropagation();
        if (!confirm(`Delete "${report.name}"?`)) return;
        setDel(true);
        await fetch(`${REPORTS_URL}?domain=${encodeURIComponent(report._domain)}&id=${report.id}`,
            { method: "DELETE", headers: authHeaders() }).catch(() => {});
        onDelete(report.id);
    }

    async function handleDuplicate(e) {
        e.stopPropagation();
        setDup(true);
        const body = {
            name:            `${report.name} (copy)`,
            chart_type:      report.chart_type,
            metrics:         report.metrics,
            breakdown:       report.breakdown,
            filters:         report.filters || [],
            date_range_days: report.date_range_days,
        };
        const r = await fetch(`${REPORTS_URL}?domain=${encodeURIComponent(report._domain)}`,
            { method: "POST", headers: authHeaders(), body: JSON.stringify(body) }).catch(() => null);
        setDup(false);
        if (r?.ok) {
            const created = await r.json();
            onDuplicate({ ...created, _domain: report._domain });
        }
    }

    const metricSummary = (report.metrics||["sessions"]).map(m => METRIC_LABELS[m]||m).join(", ");

    return (
        <div className="sa-report-card"
            onClick={() => history.push(analyticsReportViewPath(null, report.id) + `?domain=${encodeURIComponent(report._domain||"")}`)}>
            <div className="sa-report-card__type">
                <span style={{ opacity: 0.7 }}>{CT_SVG[report.chart_type]}</span>
                <span>{CHART_TYPE_LABELS[report.chart_type]||report.chart_type}</span>
            </div>
            <div className="sa-report-card__name">{report.name}</div>
            <div className="sa-report-card__meta">{metricSummary} · {BREAKDOWN_LABELS[report.breakdown]||report.breakdown} · last {report.date_range_days}d</div>
            <MiniPreview report={report} />
            <div className="sa-report-card__footer">
                <span className="sa-report-card__date">Updated {fmtDate(report.updated_at)}</span>
                <div className="sa-report-card__actions" onClick={e => e.stopPropagation()}>
                    <button className="sa-report-card__action-btn"
                        onClick={e => { e.stopPropagation(); history.push(analyticsReportBuilderPath(null, report.id) + `?domain=${encodeURIComponent(report._domain||"")}`); }}>
                        Edit
                    </button>
                    <button className="sa-report-card__action-btn" onClick={handleDuplicate} disabled={dup}>
                        {dup ? "…" : "Duplicate"}
                    </button>
                    <button className="sa-report-card__action-btn sa-report-card__action-btn--del" onClick={handleDelete} disabled={del}>
                        {del ? "…" : "Delete"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SavedReports() {
    document.title = "My Reports | Site Analytics";

    const { domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate } = useAnalyticsPageChrome();
    const history = useHistory();

    const [reports,  setReports]  = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState(null);
    const [tplOpen,  setTplOpen]  = useState(true);
    const [tplCat,   setTplCat]   = useState("All");
    const [tplSearch,setTplSearch]= useState("");

    const reload = useCallback(() => {
        if (!domain) { setReports([]); return; }
        setLoading(true); setError(null);
        fetch(`${REPORTS_URL}?domain=${encodeURIComponent(domain)}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                const json = await r.json();
                setReports((json.reports||[]).map(r => ({ ...r, _domain: domain })));
            })
            .catch(() => setError("Could not load saved reports."))
            .finally(() => setLoading(false));
    }, [domain]);

    useEffect(() => { reload(); }, [reload]);

    // Filter templates
    const q = tplSearch.toLowerCase().trim();
    const filteredTemplates = REPORT_TEMPLATES.filter(t =>
        (tplCat === "All" || t.category === tplCat) &&
        (!q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
    );

    const allCats = ["All", ...CATEGORY_ORDER];

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="My Reports"
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
            />
            <div className="dashboard-content">
                <div className="sa-page">

                    {/* ── Template library ─────────────────────────── */}
                    <div className="sa-panel">
                        {/* Collapsible header */}
                        <div className="sa-tpl-header" onClick={() => setTplOpen(o => !o)} style={{ cursor: "pointer" }}>
                            <h3 className="sa-panel__title" style={{ margin: 0 }}>
                                Template library
                                <span style={{ fontSize: 11, fontWeight: 400, color: "rgba(130,130,130,0.6)", textTransform: "none", letterSpacing: 0, marginLeft: 8 }}>
                                    {filteredTemplates.length} of {REPORT_TEMPLATES.length}
                                </span>
                            </h3>
                            <span style={{ color: "rgba(130,130,130,0.6)", fontSize: 12, userSelect: "none" }}>{tplOpen ? "▲" : "▼"}</span>
                        </div>

                        {tplOpen && (
                            <div className="sa-tpl-body">
                                {/* Search + category tabs */}
                                <div className="sa-tpl-controls" onClick={e => e.stopPropagation()}>
                                    <div className="sa-tpl-tabs">
                                        {allCats.map(cat => (
                                            <button key={cat}
                                                className={"sa-tpl-tab" + (tplCat === cat ? " sa-tpl-tab--active" : "")}
                                                onClick={() => setTplCat(cat)}>
                                                {cat}
                                                {cat !== "All" && (
                                                    <span className="sa-tpl-tab__count">
                                                        {REPORT_TEMPLATES.filter(t => t.category === cat).length}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                    <input
                                        className="sa-tpl-search"
                                        type="text"
                                        placeholder="Search templates…"
                                        value={tplSearch}
                                        onChange={e => setTplSearch(e.target.value)}
                                    />
                                </div>

                                {/* Template grid */}
                                {filteredTemplates.length === 0 ? (
                                    <p className="sa-notice" style={{ margin: 0 }}>No templates match your search.</p>
                                ) : (
                                    <div className="sa-tpl-grid">
                                        {filteredTemplates.map(tpl => (
                                            <TemplateCard key={tpl.key} tpl={tpl} domain={domain} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Saved reports ────────────────────────────── */}
                    <div>
                        <div className="sa-reports-header">
                            <h3 className="sa-panel__title" style={{ margin: 0 }}>Saved reports</h3>
                            <button className="sa-btn sa-btn--primary"
                                onClick={() => history.push(analyticsReportBuilderPath(domain))}>
                                + New report
                            </button>
                        </div>

                        {!domain  && <p className="sa-notice">Select a domain in the header to view saved reports.</p>}
                        {domain && loading && <p className="sa-notice">Loading…</p>}
                        {domain && error   && <p className="sa-notice sa-notice--error">{error}</p>}

                        {domain && !loading && !error && reports.length === 0 && (
                            <div className="sa-reports-empty">
                                <div className="sa-reports-empty__icon">📊</div>
                                <div className="sa-reports-empty__title">No saved reports yet</div>
                                <div className="sa-reports-empty__sub">Pick a template above or build a custom report from scratch.</div>
                            </div>
                        )}

                        {domain && !loading && reports.length > 0 && (
                            <div className="sa-reports-grid">
                                {reports.map(r => (
                                    <ReportCard key={r.id} report={r}
                                        onDelete={id => setReports(p => p.filter(r => r.id !== id))}
                                        onDuplicate={created => setReports(p => [created, ...p])}
                                    />
                                ))}
                                <div className="sa-report-card sa-report-card--new"
                                    onClick={() => history.push(analyticsReportBuilderPath(domain))}>
                                    <div className="sa-report-card--new__plus">+</div>
                                    <div className="sa-report-card--new__label">New report</div>
                                    <div className="sa-report-card__meta">Build a custom view</div>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
