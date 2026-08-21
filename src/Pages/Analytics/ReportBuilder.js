const { useState, useEffect, useMemo, useCallback } = React;
const useParams  = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;
import { ScannerHost } from "../../API/host.js";
import { authHeaders, useAnalyticsPageChrome, useAnalyticsReport, KpiCard, formatPercent, formatDuration } from "./_shared.js";
import { analyticsReportsPath } from "../../Functions/domainPathSegments.js";
import TrendLineChart from "./TrendLineChart.js";
import { IconTarget, IconTrendingUp } from "./Icons.js";
import "./Analytics.css";

const REPORTS_URL = `${ScannerHost}/api/analytics-saved-reports`;

// ── Metric definitions ────────────────────────────────────────────────────────

const METRIC_DEFS = {
    sessions:       { label: "Sessions",         getTotal: d => d?.totals?.unique_sessions || 0,                                         isRate: false },
    pageViews:      { label: "Page views",        getTotal: d => (d?.daily||[]).reduce((s,r) => s + (r.full_count||0) + (r.minimal||0), 0), isRate: false },
    conversions:    { label: "Conversions",       getTotal: d => (d?.conversions||[]).reduce((s,c) => s + (c.count||0), 0),              isRate: false },
    conversionRate: { label: "Conversion rate",   getTotal: d => d?.totals?.conversionRate || 0,                                         isRate: true  },
    consentRate:    { label: "Consent rate",      getTotal: d => {
        const total = d?.totals?.total || 0;
        return total > 0 ? ((d?.totals?.full_count || 0) / total) * 100 : 0;
    }, isRate: true },
    newUsers:       { label: "New users",         getTotal: d => {
        const row = (d?.newVsReturning || []).find(r => r.is_returning === false || r.is_returning === "false");
        return row?.sessions || 0;
    }, isRate: false },
};

// ── Breakdown definitions ─────────────────────────────────────────────────────

const BREAKDOWN_DEFS = {
    date:      { label: "Date (daily)",   getSeries: d => (d?.daily||[]).map(r => ({ label: r.date,                     value: (r.full_count||0) + (r.minimal||0) })) },
    country:   { label: "Country",        getSeries: d => (d?.countries||[]).slice(0, 10).map(r => ({ label: r.code || r.country_code || "?", value: r.events })) },
    device:    { label: "Device",         getSeries: d => (d?.devices||[]).map(r => ({ label: r.device_type,             value: r.events })) },
    utmSource: { label: "UTM source",     getSeries: d => (d?.utm||[]).slice(0, 10).map(r => ({ label: r.utm_source || "(none)", value: r.events })) },
    browser:   { label: "Browser",        getSeries: d => (d?.browsers||[]).slice(0, 8).map(r => ({ label: r.browser_family,       value: r.events })) },
    channel:   { label: "Channel",        getSeries: d => (d?.conversionsByChannel||[]).map(r => ({ label: r.channel,              value: r.sessions || r.count })) },
    none:      { label: "None (totals)",  getSeries: () => [] },
};

const FILTER_DIMENSIONS = [
    { value: "channel", label: "Channel" },
    { value: "device",  label: "Device"  },
    { value: "consent", label: "Consent level" },
    { value: "country", label: "Country (2-letter code)" },
];

const FILTER_CHANNEL_OPTS  = ["organic", "paid", "paid_social", "referral", "direct"];
const FILTER_DEVICE_OPTS   = ["desktop", "mobile", "tablet"];
const FILTER_CONSENT_OPTS  = ["full", "minimal"];

const EMPTY_CONFIG = {
    name:           "",
    chartType:      "line",
    metrics:        ["sessions"],
    breakdown:      "date",
    filters:        [],
    dateRangeDays:  30,
};

// ── Small renderers ───────────────────────────────────────────────────────────

function BarChart({ series }) {
    if (!series?.length) return <div className="sa-rb-no-data">No data</div>;
    const max = Math.max(...series.map(s => s.value), 1);
    return (
        <div className="sa-rb-bar-chart">
            {series.map((s, i) => (
                <div key={i} className="sa-rb-bar-row">
                    <span className="sa-rb-bar-label" title={s.label}>{s.label}</span>
                    <div className="sa-rb-bar-track">
                        <div className="sa-rb-bar-fill" style={{ width: `${(s.value / max) * 100}%` }} />
                    </div>
                    <span className="sa-rb-bar-val">{s.value?.toLocaleString("de-DE") ?? "—"}</span>
                </div>
            ))}
        </div>
    );
}

function DataTable({ series, metricLabel }) {
    if (!series?.length) return <div className="sa-rb-no-data">No data</div>;
    const max = Math.max(...series.map(s => s.value), 1);
    return (
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Dimension</th>
                    <th>{metricLabel}</th>
                    <th>Share</th>
                </tr>
            </thead>
            <tbody>
                {series.map((s, i) => (
                    <tr key={i}>
                        <td>{s.label}</td>
                        <td>{s.value?.toLocaleString("de-DE") ?? "—"}</td>
                        <td>
                            <div className="sa-bar" style={{ minWidth: 80 }}>
                                <div className="sa-bar__seg" style={{ width: `${(s.value / max) * 100}%`, background: "rgba(59,135,232,0.55)" }} />
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function DonutChart({ series }) {
    if (!series?.length) return <div className="sa-rb-no-data">No data</div>;
    const total = series.reduce((s, r) => s + r.value, 0);
    const top5  = series.slice(0, 5);
    const COLORS = ["#3B87E8", "#4ADE80", "#C4A35A", "#A78BFA", "#FB923C"];
    let offset = 0;
    const circumference = 2 * Math.PI * 52;

    return (
        <div className="sa-rb-donut-wrap">
            <svg width="130" height="130" viewBox="0 0 130 130" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
                <circle cx="65" cy="65" r="52" fill="none" stroke="var(--sa-track)" strokeWidth="18" />
                {top5.map((s, i) => {
                    const pct = total > 0 ? s.value / total : 0;
                    const dash = circumference * pct;
                    const el = (
                        <circle key={i} cx="65" cy="65" r="52" fill="none"
                            stroke={COLORS[i]} strokeWidth="18"
                            strokeDasharray={`${dash} ${circumference - dash}`}
                            strokeDashoffset={-offset}
                        />
                    );
                    offset += dash;
                    return el;
                })}
            </svg>
            <div className="sa-rb-donut-legend">
                {top5.map((s, i) => (
                    <div key={i} className="sa-rb-donut-row">
                        <span className="sa-rb-donut-dot" style={{ background: COLORS[i] }} />
                        <span className="sa-rb-donut-label">{s.label}</span>
                        <span className="sa-rb-donut-pct">
                            {total > 0 ? formatPercent((s.value / total) * 100, 0) : "—"}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Main preview renderer ─────────────────────────────────────────────────────

function ReportPreview({ config, data, loading }) {
    const { chartType, metrics, breakdown } = config;
    const primaryMetric = metrics[0] || "sessions";
    const metricDef     = METRIC_DEFS[primaryMetric] || METRIC_DEFS.sessions;
    const breakdownDef  = BREAKDOWN_DEFS[breakdown]  || BREAKDOWN_DEFS.date;

    const series = useMemo(() => {
        if (!data) return [];
        return breakdownDef.getSeries(data);
    }, [data, breakdown]); // eslint-disable-line react-hooks/exhaustive-deps

    const kpiValues = useMemo(() => {
        if (!data) return {};
        return Object.fromEntries(metrics.map(m => [m, (METRIC_DEFS[m] || METRIC_DEFS.sessions).getTotal(data)]));
    }, [data, metrics]);

    if (loading) return <div className="sa-rb-preview-body"><p className="sa-notice">Loading data&hellip;</p></div>;
    if (!data)   return <div className="sa-rb-preview-body"><p className="sa-notice">Select a domain to preview the report.</p></div>;

    const trendData = breakdown === "date"
        ? series.map(s => ({ date: s.label, num: s.value }))
        : [];

    return (
        <div className="sa-rb-preview-body">
            {/* KPI summary strip */}
            <div className="sa-rb-kpi-strip">
                {metrics.map(m => {
                    const def = METRIC_DEFS[m] || METRIC_DEFS.sessions;
                    const val = kpiValues[m] ?? 0;
                    const formatted = def.isRate ? formatPercent(val) : val.toLocaleString("de-DE");
                    return (
                        <div key={m} className="sa-rb-kpi">
                            <div className="sa-rb-kpi__label">{def.label.toUpperCase()}</div>
                            <div className="sa-rb-kpi__value">{formatted}</div>
                        </div>
                    );
                })}
            </div>

            {/* Main visualisation */}
            <div className="sa-panel">
                <h3 className="sa-panel__title">
                    {config.name || "Report preview"}
                    <span className="sa-panel__sub-title" style={{ marginLeft: 10, fontWeight: 400, fontSize: 12, color: "var(--sa-txt-sec)" }}>
                        {metricDef.label} · {breakdownDef.label} · last {config.dateRangeDays}d
                    </span>
                </h3>

                {chartType === "kpi" && (
                    <div className="sa-rb-kpi-grid">
                        {metrics.map(m => {
                            const def = METRIC_DEFS[m] || METRIC_DEFS.sessions;
                            const val = kpiValues[m] ?? 0;
                            return (
                                <KpiCard key={m}
                                    icon={<IconTarget />}
                                    label={def.label}
                                    value={def.isRate ? formatPercent(val) : val.toLocaleString("de-DE")}
                                />
                            );
                        })}
                    </div>
                )}

                {(chartType === "line") && breakdown === "date" && trendData.length > 0 && (
                    <TrendLineChart data={trendData} title={metricDef.label} showInsights height={220} />
                )}
                {(chartType === "line") && breakdown !== "date" && (
                    <BarChart series={series} />
                )}

                {chartType === "bar" && <BarChart series={series} />}

                {chartType === "table" && <DataTable series={series} metricLabel={metricDef.label} />}

                {chartType === "donut" && <DonutChart series={series} />}
            </div>
        </div>
    );
}

// ── Filter row ────────────────────────────────────────────────────────────────

function FilterRow({ filter, onChange, onRemove }) {
    function valueOptions() {
        if (filter.dimension === "channel")  return FILTER_CHANNEL_OPTS;
        if (filter.dimension === "device")   return FILTER_DEVICE_OPTS;
        if (filter.dimension === "consent")  return FILTER_CONSENT_OPTS;
        return null;
    }
    const opts = valueOptions();

    return (
        <div className="sa-rb-filter-row">
            <select className="sa-seg-filter__select"
                value={filter.dimension}
                onChange={e => onChange({ ...filter, dimension: e.target.value, value: "" })}>
                {FILTER_DIMENSIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <span style={{ color: "var(--sa-txt-muted)", fontSize: 12 }}>is</span>
            {opts ? (
                <select className="sa-seg-filter__select"
                    value={filter.value}
                    onChange={e => onChange({ ...filter, value: e.target.value })}>
                    <option value="">Select…</option>
                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            ) : (
                <input className="sa-seg-filter__country"
                    type="text" maxLength={2} placeholder="e.g. DE"
                    value={filter.value}
                    onChange={e => onChange({ ...filter, value: e.target.value.toUpperCase().slice(0, 2) })}
                />
            )}
            <button className="sa-rb-filter-remove" onClick={onRemove}>×</button>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReportBuilder() {
    const { reportId } = useParams();
    const history      = useHistory();
    const isNew        = !reportId || reportId === "new";

    document.title = (isNew ? "New Report" : "Edit Report") + " | Site Analytics";

    const { domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate, fromIso, toIso } = useAnalyticsPageChrome();

    const [config,   setConfig]   = useState(EMPTY_CONFIG);
    const [saving,   setSaving]   = useState(false);
    const [saveErr,  setSaveErr]  = useState(null);
    const [loadErr,  setLoadErr]  = useState(null);

    // Date range derived from config.dateRangeDays — drives useAnalyticsReport below
    const reportFrom = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - (config.dateRangeDays || 30));
        return d.toISOString().slice(0, 10);
    }, [config.dateRangeDays]);

    const reportTo = useMemo(() => new Date().toISOString().slice(0, 10), []);

    // Convert the filter array to a segment object understood by useAnalyticsReport
    const segment = useMemo(() => {
        const seg = { device: null, country: "", channel: null, consent: null };
        (config.filters || []).forEach(f => {
            if (f.value) {
                if (f.dimension === "channel") seg.channel = f.value;
                if (f.dimension === "device")  seg.device  = f.value;
                if (f.dimension === "consent") seg.consent = f.value;
                if (f.dimension === "country") seg.country = f.value;
            }
        });
        const hasAny = seg.device || seg.country || seg.channel || seg.consent;
        return hasAny ? seg : null;
    }, [config.filters]);

    const { data, loading } = useAnalyticsReport(domain, reportFrom, reportTo, 0, segment);

    // Load existing report when editing
    useEffect(() => {
        if (isNew || !domain) return;
        const qs = new URLSearchParams({ domain }).toString();
        fetch(`${REPORTS_URL}?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                const json = await r.json();
                const found = (json.reports || []).find(r => String(r.id) === String(reportId));
                if (found) {
                    setConfig({
                        name:          found.name,
                        chartType:     found.chart_type,
                        metrics:       found.metrics || ["sessions"],
                        breakdown:     found.breakdown,
                        filters:       found.filters || [],
                        dateRangeDays: found.date_range_days || 30,
                    });
                } else {
                    setLoadErr("Report not found.");
                }
            })
            .catch(() => setLoadErr("Could not load report."));
    }, [isNew, reportId, domain]);

    function toggleMetric(key) {
        setConfig(c => {
            const has = c.metrics.includes(key);
            if (has && c.metrics.length === 1) return c; // keep at least one
            return { ...c, metrics: has ? c.metrics.filter(m => m !== key) : [...c.metrics, key] };
        });
    }

    function addFilter() {
        setConfig(c => ({ ...c, filters: [...c.filters, { dimension: "channel", value: "" }] }));
    }

    function updateFilter(i, updated) {
        setConfig(c => {
            const f = [...c.filters];
            f[i] = updated;
            return { ...c, filters: f };
        });
    }

    function removeFilter(i) {
        setConfig(c => ({ ...c, filters: c.filters.filter((_, fi) => fi !== i) }));
    }

    async function save() {
        if (!config.name.trim()) { setSaveErr("Give the report a name."); return; }
        if (!domain)             { setSaveErr("Select a domain first.");   return; }
        setSaving(true);
        setSaveErr(null);

        const body = {
            name:           config.name.trim(),
            chart_type:     config.chartType,
            metrics:        config.metrics,
            breakdown:      config.breakdown,
            filters:        config.filters.filter(f => f.value),
            date_range_days: config.dateRangeDays,
        };

        const url  = isNew ? `${REPORTS_URL}?domain=${encodeURIComponent(domain)}`
                           : `${REPORTS_URL}?domain=${encodeURIComponent(domain)}&id=${reportId}`;
        const method = isNew ? "POST" : "PUT";

        const r = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) }).catch(() => null);
        if (!r || !r.ok) {
            setSaveErr("Could not save report. Try again.");
            setSaving(false);
            return;
        }
        history.push(analyticsReportsPath(domain));
    }

    return (
        <div style={{ flex: "1", minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Sticky header */}
            <div className="sa-rb-topbar">
                <div className="sa-rb-topbar__left">
                    <button className="sa-rb-back" onClick={() => history.push(analyticsReportsPath(domain))}>
                        ← My Reports
                    </button>
                    <input
                        className="sa-rb-name-input"
                        type="text"
                        placeholder="Report name…"
                        value={config.name}
                        onChange={e => setConfig(c => ({ ...c, name: e.target.value }))}
                    />
                </div>
                <div className="sa-rb-topbar__right">
                    {saveErr && <span className="sa-rb-save-err">{saveErr}</span>}
                    <button className="sa-btn" onClick={() => history.push(analyticsReportsPath(domain))}>
                        Cancel
                    </button>
                    <button className="sa-btn sa-btn--primary" onClick={save} disabled={saving}>
                        {saving ? "Saving…" : isNew ? "Save report" : "Update report"}
                    </button>
                </div>
            </div>

            {loadErr && <p className="sa-notice sa-notice--error" style={{ margin: "16px 24px" }}>{loadErr}</p>}

            <div className="sa-rb-layout">
                {/* ── Config panel ── */}
                <div className="sa-rb-config">
                    {/* Chart type */}
                    <div className="sa-rb-section">
                        <div className="sa-rb-section__label">CHART TYPE</div>
                        <div className="sa-rb-chart-types">
                            {[
                                { key: "line",  icon: "📈", label: "Line"  },
                                { key: "bar",   icon: "📊", label: "Bar"   },
                                { key: "table", icon: "📋", label: "Table" },
                                { key: "kpi",   icon: "⬛", label: "KPI"   },
                                { key: "donut", icon: "🍩", label: "Donut" },
                            ].map(ct => (
                                <button key={ct.key}
                                    className={"sa-rb-ct-btn" + (config.chartType === ct.key ? " sa-rb-ct-btn--active" : "")}
                                    onClick={() => setConfig(c => ({ ...c, chartType: ct.key }))}>
                                    <span className="sa-rb-ct-icon">{ct.icon}</span>
                                    <span>{ct.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Metrics */}
                    <div className="sa-rb-section">
                        <div className="sa-rb-section__label">METRICS</div>
                        <div className="sa-rb-metric-list">
                            {Object.entries(METRIC_DEFS).map(([key, def]) => (
                                <div key={key} className="sa-rb-metric-item" onClick={() => toggleMetric(key)}>
                                    <div className={"sa-rb-check" + (config.metrics.includes(key) ? " sa-rb-check--on" : "")}>
                                        {config.metrics.includes(key) && "✓"}
                                    </div>
                                    <span className="sa-rb-metric-label">{def.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Breakdown */}
                    <div className="sa-rb-section">
                        <div className="sa-rb-section__label">BREAKDOWN BY</div>
                        <div className="sa-rb-breakdown-list">
                            {Object.entries(BREAKDOWN_DEFS).map(([key, def]) => (
                                <div key={key} className="sa-rb-breakdown-item" onClick={() => setConfig(c => ({ ...c, breakdown: key }))}>
                                    <div className={"sa-rb-radio" + (config.breakdown === key ? " sa-rb-radio--sel" : "")} />
                                    <span className="sa-rb-metric-label">{def.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="sa-rb-section">
                        <div className="sa-rb-section__label">FILTERS</div>
                        <div className="sa-rb-filter-rows">
                            {config.filters.map((f, i) => (
                                <FilterRow key={i} filter={f}
                                    onChange={updated => updateFilter(i, updated)}
                                    onRemove={() => removeFilter(i)} />
                            ))}
                        </div>
                        <button className="sa-rb-add-filter" onClick={addFilter}>+ Add filter</button>
                    </div>

                    {/* Date range */}
                    <div className="sa-rb-section">
                        <div className="sa-rb-section__label">DATE RANGE</div>
                        <select className="sa-seg-filter__select" style={{ width: "100%" }}
                            value={config.dateRangeDays}
                            onChange={e => setConfig(c => ({ ...c, dateRangeDays: parseInt(e.target.value) }))}>
                            <option value={7}>Last 7 days</option>
                            <option value={14}>Last 14 days</option>
                            <option value={30}>Last 30 days</option>
                            <option value={60}>Last 60 days</option>
                            <option value={90}>Last 90 days</option>
                        </select>
                    </div>
                </div>

                {/* ── Live preview ── */}
                <div className="sa-rb-preview">
                    <div className="sa-rb-preview-header">
                        <div>
                            <div className="sa-rb-preview-title">{config.name || "Untitled report"}</div>
                            <div className="sa-rb-preview-sub">
                                {(config.metrics.map(m => METRIC_DEFS[m]?.label || m)).join(", ")}
                                {" · "}{BREAKDOWN_DEFS[config.breakdown]?.label || config.breakdown}
                                {" · last "}{config.dateRangeDays}{" days"}
                                {domain && <> · <strong>{domain}</strong></>}
                            </div>
                        </div>
                        <span className="sa-kpi__trend sa-kpi__trend--up" style={{ fontSize: 12 }}>Live preview</span>
                    </div>
                    <ReportPreview config={config} data={data} loading={loading} />
                </div>
            </div>
        </div>
    );
}
