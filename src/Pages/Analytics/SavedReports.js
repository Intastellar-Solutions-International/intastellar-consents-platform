const { useState, useEffect, useCallback } = React;
const useHistory = window.ReactRouterDOM.useHistory;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, useAnalyticsPageChrome } from "./_shared.js";
import { analyticsReportBuilderPath } from "../../Functions/domainPathSegments.js";
import "./Analytics.css";

const REPORTS_URL = `${ScannerHost}/api/analytics-saved-reports`;

const CHART_TYPE_LABELS = { line: "Line chart", bar: "Bar chart", table: "Table", kpi: "KPI cards", donut: "Donut chart" };
const CHART_TYPE_ICONS  = { line: "📈", bar: "📊", table: "📋", kpi: "⬛", donut: "🍩" };

const BREAKDOWN_LABELS = {
    date: "by date", country: "by country", device: "by device",
    utmSource: "by UTM source", browser: "by browser", channel: "by channel", none: "totals only",
};

const METRIC_LABELS = {
    sessions: "Sessions", pageViews: "Page views", conversions: "Conversions",
    conversionRate: "Conversion rate", consentRate: "Consent rate", newUsers: "New users",
};

function fmtDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function MiniBarPreview({ report }) {
    const heights = [55, 70, 48, 85, 62, 90, 58, 75, 68, 82];
    const colors = { line: "rgba(192,159,83,0.85)", bar: "rgba(192,159,83,0.85)", table: "rgba(130,130,130,0.5)", kpi: "rgba(192,159,83,0.85)", donut: "rgba(192,159,83,0.85)" };
    const color = colors[report.chart_type] || "rgba(192,159,83,0.85)";

    if (report.chart_type === "kpi") {
        return (
            <div className="sa-report-card__preview" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {(report.metrics || ["sessions"]).slice(0, 3).map(m => (
                    <div key={m} style={{ flex: 1, background: "rgba(196,163,90,.12)", borderRadius: 4, padding: "4px 6px" }}>
                        <div style={{ fontSize: 9, color: "rgba(130,130,130,0.55)" }}>{(METRIC_LABELS[m] || m).toUpperCase()}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(210,210,210,0.88)" }}>—</div>
                    </div>
                ))}
            </div>
        );
    }

    if (report.chart_type === "donut") {
        const r = 20, circumference = 2 * Math.PI * r;
        const pct = 0.62;
        return (
            <div className="sa-report-card__preview" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="48" height="48" viewBox="0 0 48 48" style={{ transform: "rotate(-90deg)" }}>
                    <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
                    <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="8"
                        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct)} strokeLinecap="butt" />
                </svg>
            </div>
        );
    }

    if (report.chart_type === "table") {
        return (
            <div className="sa-report-card__preview" style={{ flexDirection: "column", gap: 3, padding: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(130,130,130,0.55)", paddingBottom: 3, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <span>{BREAKDOWN_LABELS[report.breakdown] || "DIM"}</span>
                    <span>{(METRIC_LABELS[report.metrics?.[0]] || "VALUE").toUpperCase()}</span>
                </div>
                {["—", "—", "—"].map((_, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(160,160,160,0.65)" }}>
                        <span style={{ width: 60, background: "rgba(255,255,255,0.07)", borderRadius: 2, height: 8, marginTop: 2 }} />
                        <span style={{ width: 28, background: "rgba(255,255,255,0.07)", borderRadius: 2, height: 8, marginTop: 2 }} />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="sa-report-card__preview" style={{ alignItems: "flex-end", gap: 2, padding: "8px 8px 0" }}>
            {heights.map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: "2px 2px 0 0", background: `${color}90` }} />
            ))}
        </div>
    );
}

function ReportCard({ report, onDelete }) {
    const history = useHistory();
    const [deleting, setDeleting] = useState(false);

    async function handleDelete(e) {
        e.stopPropagation();
        if (!confirm(`Delete "${report.name}"?`)) return;
        setDeleting(true);
        const qs = new URLSearchParams({ domain: report.domain, id: report.id }).toString();
        await fetch(`${REPORTS_URL}?${qs}`, { method: "DELETE", headers: authHeaders() }).catch(() => {});
        onDelete(report.id);
    }

    const metrics = report.metrics || ["sessions"];
    const metricSummary = metrics.map(m => METRIC_LABELS[m] || m).join(", ");

    return (
        <div className="sa-report-card" onClick={() => history.push(analyticsReportBuilderPath(null, report.id) + `?domain=${encodeURIComponent(report._domain || "")}`)}>
            <div className="sa-report-card__type">
                <span>{CHART_TYPE_ICONS[report.chart_type] || "📊"}</span>
                <span>{CHART_TYPE_LABELS[report.chart_type] || report.chart_type}</span>
            </div>
            <div className="sa-report-card__name">{report.name}</div>
            <div className="sa-report-card__meta">{metricSummary} · {BREAKDOWN_LABELS[report.breakdown] || report.breakdown} · last {report.date_range_days}d</div>
            <MiniBarPreview report={report} />
            <div className="sa-report-card__footer">
                <span className="sa-report-card__date">Updated {fmtDate(report.updated_at)}</span>
                <div className="sa-report-card__actions" onClick={e => e.stopPropagation()}>
                    <button className="sa-report-card__action-btn"
                        onClick={() => history.push(analyticsReportBuilderPath(null, report.id) + `?domain=${encodeURIComponent(report._domain || "")}`)}>
                        Edit
                    </button>
                    <button className="sa-report-card__action-btn sa-report-card__action-btn--del"
                        onClick={handleDelete} disabled={deleting}>
                        {deleting ? "…" : "Delete"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function SavedReports() {
    document.title = "My Reports | Site Analytics";

    const { domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate } = useAnalyticsPageChrome();
    const history = useHistory();

    const [reports, setReports]   = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error,   setError]     = useState(null);

    const reload = useCallback(() => {
        if (!domain) { setReports([]); return; }
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({ domain }).toString();
        fetch(`${REPORTS_URL}?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                const json = await r.json();
                // Attach domain to each row so ReportCard can link back
                setReports((json.reports || []).map(r => ({ ...r, _domain: domain })));
            })
            .catch(() => setError("Could not load saved reports."))
            .finally(() => setLoading(false));
    }, [domain]);

    useEffect(() => { reload(); }, [reload]);

    function handleDelete(id) {
        setReports(prev => prev.filter(r => r.id !== id));
    }

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
                    {!domain && <p className="sa-notice">Select a domain in the header to view saved reports.</p>}

                    {domain && (
                        <>
                            <div className="sa-reports-header">
                                <div>
                                    <p className="sa-notice" style={{ margin: 0, color: "rgba(160,160,160,0.65)" }}>
                                        Custom reports are saved per domain and rebuild from live data each time you open them.
                                    </p>
                                </div>
                                <button
                                    className="sa-btn sa-btn--primary"
                                    onClick={() => history.push(analyticsReportBuilderPath(domain))}
                                >
                                    + New report
                                </button>
                            </div>

                            {loading && <p className="sa-notice">Loading&hellip;</p>}
                            {error   && <p className="sa-notice sa-notice--error">{error}</p>}

                            {!loading && !error && reports.length === 0 && (
                                <div className="sa-reports-empty">
                                    <div className="sa-reports-empty__icon">📊</div>
                                    <div className="sa-reports-empty__title">No saved reports yet</div>
                                    <div className="sa-reports-empty__sub">Build a custom view from any combination of metrics, breakdowns and filters.</div>
                                    <button
                                        className="sa-btn sa-btn--primary"
                                        style={{ marginTop: 16 }}
                                        onClick={() => history.push(analyticsReportBuilderPath(domain))}
                                    >
                                        Create your first report
                                    </button>
                                </div>
                            )}

                            {!loading && reports.length > 0 && (
                                <div className="sa-reports-grid">
                                    {reports.map(r => (
                                        <ReportCard key={r.id} report={r} onDelete={handleDelete} />
                                    ))}
                                    <div
                                        className="sa-report-card sa-report-card--new"
                                        onClick={() => history.push(analyticsReportBuilderPath(domain))}
                                    >
                                        <div className="sa-report-card--new__plus">+</div>
                                        <div className="sa-report-card--new__label">New report</div>
                                        <div className="sa-report-card__meta">Build a custom view</div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
