const { useState, useEffect, useMemo } = React;
const useParams   = window.ReactRouterDOM.useParams;
const useHistory  = window.ReactRouterDOM.useHistory;
const useLocation = window.ReactRouterDOM.useLocation;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, useAnalyticsPageChrome, useAnalyticsReport, useAdSpendReport, KpiCard, formatPercent } from "./_shared.js";
import { analyticsReportsPath } from "../../Functions/domainPathSegments.js";
import { REPORT_TEMPLATES, CT_SVG, AD_METRICS } from "./reportTemplates.js";
import TrendLineChart from "./TrendLineChart.js";
import { IconTarget } from "./Icons.js";
import "./Analytics.css";

const REPORTS_URL = `${ScannerHost}/api/analytics-saved-reports`;

const PLATFORM_LABELS = {
    google_ads:    "Google Ads",
    meta_ads:      "Meta Ads",
    linkedin_ads:  "LinkedIn Ads",
    microsoft_ads: "Microsoft Ads",
};

const CURRENCY_SYMBOLS = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF ", DKK: "kr ", SEK: "kr ", NOK: "kr ", PLN: "zł " };

function formatMoney(n, currency) {
    const sym = CURRENCY_SYMBOLS[currency] || (currency ? currency + " " : "");
    return `${sym}${Number(n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function adCurrency(adData) { return adData?.spendByCurrency?.[0]?.currency || "EUR"; }
function adSpendTotal(adData) { return Number(adData?.spendByCurrency?.[0]?.amount || 0); }
function adClicksTotal(adData) { return Number(adData?.spendByCurrency?.[0]?.clicks || 0); }
function adImpressionsTotal(adData) { return Number(adData?.spendByCurrency?.[0]?.impressions || 0); }
function adCacTotal(adData) { return Number(adData?.blendedCac?.[0]?.cac || 0); }

// ── Metric definitions ────────────────────────────────────────────────────────

const METRIC_DEFS = {
    // Site analytics
    sessions:       { label: "Sessions",         group: "analytics", getTotal: (d, _ad) => d?.totals?.unique_sessions || 0,                                         isRate: false },
    pageViews:      { label: "Page views",        group: "analytics", getTotal: (d, _ad) => (d?.daily||[]).reduce((s,r) => s+(r.full_count||0)+(r.minimal||0), 0),  isRate: false },
    conversions:    { label: "Conversions",       group: "analytics", getTotal: (d, _ad) => (d?.conversions||[]).reduce((s,c) => s+(c.count||0), 0),                 isRate: false },
    conversionRate: { label: "Conversion rate",   group: "analytics", getTotal: (d, _ad) => d?.totals?.conversionRate || 0,                                          isRate: true  },
    consentRate:    { label: "Consent rate",      group: "analytics", getTotal: (d, _ad) => {
        const total = d?.totals?.total || 0;
        return total > 0 ? ((d?.totals?.full_count || 0) / total) * 100 : 0;
    }, isRate: true },
    newUsers:       { label: "New users",         group: "analytics", getTotal: (d, _ad) => {
        const row = (d?.newVsReturning || []).find(r => r.is_returning === false || r.is_returning === "false");
        return row?.sessions || 0;
    }, isRate: false },
    // Ad spend
    adSpend:        { label: "Ad spend",          group: "adspend",   getTotal: (_d, ad) => adSpendTotal(ad),       isRate: false, isMoney: true  },
    adClicks:       { label: "Ad clicks",         group: "adspend",   getTotal: (_d, ad) => adClicksTotal(ad),      isRate: false, isMoney: false },
    adImpressions:  { label: "Impressions",       group: "adspend",   getTotal: (_d, ad) => adImpressionsTotal(ad), isRate: false, isMoney: false },
    blendedCac:     { label: "Blended CAC",       group: "adspend",   getTotal: (_d, ad) => adCacTotal(ad),         isRate: false, isMoney: true  },
};

function adFieldForMetric(m) {
    if (m === "adClicks")      return "clicks";
    if (m === "adImpressions") return "impressions";
    return "spend";
}

const BREAKDOWN_DEFS = {
    date:       { label: "Date (daily)",  getSeries: (d, ad, prim) => {
        if (AD_METRICS.has(prim)) {
            const field = adFieldForMetric(prim);
            return (ad?.daily||[]).map(r => ({
                label: r.date,
                value: Object.values(r.byPlatform||{}).reduce((s, p) => s + (p[field]||0), 0),
            }));
        }
        return (d?.daily||[]).map(r => ({ label: r.date, value: (r.full_count||0)+(r.minimal||0) }));
    }},
    country:    { label: "Country",       getSeries: (d) => (d?.countries||[]).slice(0,10).map(r => ({ label: r.code||"?", value: r.events })) },
    device:     { label: "Device",        getSeries: (d) => (d?.devices||[]).map(r => ({ label: r.type||"Unknown", value: r.events })) },
    utmSource:  { label: "UTM source",    getSeries: (d) => (d?.utmSources||[]).slice(0,10).map(r => ({ label: r.source||"(none)", value: r.events })) },
    browser:    { label: "Browser",       getSeries: (d) => (d?.browsers||[]).slice(0,8).map(r => ({ label: r.name||"Unknown", value: r.events })) },
    channel:    { label: "Channel",       getSeries: (d) => (d?.conversionsByChannel||[]).map(r => ({ label: r.channel, value: r.sessions||r.count })) },
    none:       { label: "None (totals)", getSeries: () => [] },
    adPlatform: { label: "Ad platform",   getSeries: (_d, ad, prim) => {
        const field = prim === "adClicks" ? "clicks" : prim === "adImpressions" ? "impressions" : "amount";
        const byPlat = {};
        (ad?.platforms||[]).forEach(p => {
            byPlat[p.platform] = (byPlat[p.platform]||0) + Number(p[field] || p.amount || 0);
        });
        return Object.entries(byPlat)
            .map(([plat, val]) => ({ label: PLATFORM_LABELS[plat]||plat, value: val }))
            .sort((a, b) => b.value - a.value);
    }},
};

const FILTER_DIMENSIONS = [
    { value: "channel", label: "Channel" },
    { value: "device",  label: "Device" },
    { value: "consent", label: "Consent level" },
    { value: "country", label: "Country (2-letter code)" },
];
const FILTER_CHANNEL_OPTS = ["organic", "paid", "paid_social", "referral", "direct"];
const FILTER_DEVICE_OPTS  = ["desktop", "mobile", "tablet"];
const FILTER_CONSENT_OPTS = ["full", "minimal"];

const EMPTY_CONFIG = { name: "", chartType: "line", metrics: ["sessions"], breakdown: "date", filters: [], dateRangeDays: 30 };

// ── Visualisation sub-components ──────────────────────────────────────────────

function BarRows({ series, formatVal }) {
    if (!series?.length) return <p className="sa-notice" style={{ margin: 0 }}>No data available.</p>;
    const max = Math.max(...series.map(s => s.value), 1);
    return (
        <div className="sa-rb-bar-chart">
            {series.map((s, i) => (
                <div key={i} className="sa-rb-bar-row">
                    <span className="sa-rb-bar-label" title={s.label}>{s.label}</span>
                    <div className="sa-rb-bar-track">
                        <div className="sa-rb-bar-fill" style={{ width: `${(s.value/max)*100}%` }} />
                    </div>
                    <span className="sa-rb-bar-val">{formatVal ? formatVal(s.value) : s.value?.toLocaleString("de-DE") ?? "—"}</span>
                </div>
            ))}
        </div>
    );
}

function DataTable({ series, metricLabel, formatVal }) {
    if (!series?.length) return <p className="sa-notice" style={{ margin: 0 }}>No data available.</p>;
    const max = Math.max(...series.map(s => s.value), 1);
    return (
        <table className="sa-table">
            <thead><tr><th>Dimension</th><th>{metricLabel}</th><th>Share</th></tr></thead>
            <tbody>
                {series.map((s, i) => (
                    <tr key={i}>
                        <td>{s.label}</td>
                        <td>{formatVal ? formatVal(s.value) : s.value?.toLocaleString("de-DE") ?? "—"}</td>
                        <td>
                            <div className="sa-bar" style={{ minWidth: 80 }}>
                                <div className="sa-bar__seg" style={{ width: `${(s.value/max)*100}%`, background: "rgba(192,159,83,0.55)" }} />
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function DonutViz({ series, formatVal }) {
    if (!series?.length) return <p className="sa-notice" style={{ margin: 0 }}>No data available.</p>;
    const total = series.reduce((s,r) => s+r.value, 0);
    const top5  = series.slice(0, 5);
    const COLORS = ["rgba(192,159,83,0.9)","rgba(74,222,128,0.8)","rgba(99,179,237,0.8)","rgba(167,139,250,0.8)","rgba(251,146,60,0.8)"];
    const circumference = 2 * Math.PI * 52;
    let offset = 0;
    return (
        <div className="sa-rb-donut-wrap">
            <svg width="130" height="130" viewBox="0 0 130 130" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
                <circle cx="65" cy="65" r="52" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="18" />
                {top5.map((s, i) => {
                    const dash = circumference * (total > 0 ? s.value/total : 0);
                    const el = <circle key={i} cx="65" cy="65" r="52" fill="none" stroke={COLORS[i]} strokeWidth="18"
                        strokeDasharray={`${dash} ${circumference-dash}`} strokeDashoffset={-offset} />;
                    offset += dash;
                    return el;
                })}
            </svg>
            <div className="sa-rb-donut-legend">
                {top5.map((s,i) => (
                    <div key={i} className="sa-rb-donut-row">
                        <span className="sa-rb-donut-dot" style={{ background: COLORS[i] }} />
                        <span className="sa-rb-donut-label">{s.label}</span>
                        <span className="sa-rb-donut-count">{formatVal ? formatVal(s.value) : s.value.toLocaleString("de-DE")}</span>
                        <span className="sa-rb-donut-pct">{total > 0 ? formatPercent((s.value/total)*100, 0) : "—"}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Filter row ────────────────────────────────────────────────────────────────

function FilterRow({ filter, onChange, onRemove }) {
    const opts = filter.dimension === "channel" ? FILTER_CHANNEL_OPTS
               : filter.dimension === "device"  ? FILTER_DEVICE_OPTS
               : filter.dimension === "consent" ? FILTER_CONSENT_OPTS
               : null;
    return (
        <div className="sa-rb-filter-row">
            <select className="sa-form-select" style={{ flex: 1 }}
                value={filter.dimension}
                onChange={e => onChange({ ...filter, dimension: e.target.value, value: "" })}>
                {FILTER_DIMENSIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            {opts ? (
                <select className="sa-form-select" style={{ flex: 1 }}
                    value={filter.value}
                    onChange={e => onChange({ ...filter, value: e.target.value })}>
                    <option value="">Select…</option>
                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            ) : (
                <input className="sa-form-input" type="text" maxLength={2} placeholder="e.g. DE" style={{ flex: 1 }}
                    value={filter.value}
                    onChange={e => onChange({ ...filter, value: e.target.value.toUpperCase().slice(0,2) })} />
            )}
            <button className="sa-rb-filter-remove" onClick={onRemove}>×</button>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReportBuilder() {
    const { reportId } = useParams();
    const history      = useHistory();
    const location     = useLocation();
    const isNew        = !reportId || reportId === "new";

    const tplKey = new URLSearchParams(location.search).get("tpl");
    const tpl    = tplKey ? REPORT_TEMPLATES.find(t => t.key === tplKey) : null;

    const initialConfig = tpl
        ? { name: tpl.name, chartType: tpl.chartType, metrics: tpl.metrics,
            breakdown: tpl.breakdown, filters: tpl.filters, dateRangeDays: tpl.dateRangeDays }
        : EMPTY_CONFIG;

    document.title = tpl ? `${tpl.name} | Reports` : (isNew ? "New Report" : "Edit Report") + " | Site Analytics";

    const { domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate } = useAnalyticsPageChrome();

    const [config,  setConfig]  = useState(initialConfig);
    const [saving,  setSaving]  = useState(false);
    const [saveErr, setSaveErr] = useState(null);
    const [loadErr, setLoadErr] = useState(null);

    const reportFrom = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - (config.dateRangeDays || 30));
        return d.toISOString().slice(0,10);
    }, [config.dateRangeDays]);

    const reportTo = useMemo(() => new Date().toISOString().slice(0,10), []);

    const segment = useMemo(() => {
        const seg = { device: null, country: "", channel: null, consent: null };
        (config.filters || []).forEach(f => {
            if (!f.value) return;
            if (f.dimension === "channel") seg.channel = f.value;
            if (f.dimension === "device")  seg.device  = f.value;
            if (f.dimension === "consent") seg.consent = f.value;
            if (f.dimension === "country") seg.country = f.value;
        });
        return (seg.device || seg.country || seg.channel || seg.consent) ? seg : null;
    }, [config.filters]);

    const hasAdMetrics = config.metrics.some(m => AD_METRICS.has(m));

    const { data, loading: dataLoading }   = useAnalyticsReport(domain, reportFrom, reportTo, 0, segment);
    const { data: adData, loading: adLoading } = useAdSpendReport(domain, reportFrom, reportTo, hasAdMetrics);

    // Load existing report for edit mode
    useEffect(() => {
        if (isNew || !domain) return;
        fetch(`${REPORTS_URL}?domain=${encodeURIComponent(domain)}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                const json = await r.json();
                const found = (json.reports || []).find(r => String(r.id) === String(reportId));
                if (found) {
                    setConfig({ name: found.name, chartType: found.chart_type, metrics: found.metrics || ["sessions"],
                        breakdown: found.breakdown, filters: found.filters || [], dateRangeDays: found.date_range_days || 30 });
                } else {
                    setLoadErr("Report not found.");
                }
            })
            .catch(() => setLoadErr("Could not load report."));
    }, [isNew, reportId, domain]); // eslint-disable-line react-hooks/exhaustive-deps

    function toggleMetric(key) {
        setConfig(c => {
            const has = c.metrics.includes(key);
            if (has && c.metrics.length === 1) return c;
            return { ...c, metrics: has ? c.metrics.filter(m => m !== key) : [...c.metrics, key] };
        });
    }

    async function save() {
        if (!config.name.trim()) { setSaveErr("Give the report a name."); return; }
        if (!domain)             { setSaveErr("Select a domain first."); return; }
        setSaving(true); setSaveErr(null);
        const body = { name: config.name.trim(), chart_type: config.chartType, metrics: config.metrics,
            breakdown: config.breakdown, filters: config.filters.filter(f => f.value), date_range_days: config.dateRangeDays };
        const url    = `${REPORTS_URL}?domain=${encodeURIComponent(domain)}${isNew ? "" : `&id=${reportId}`}`;
        const method = isNew ? "POST" : "PUT";
        const r = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) }).catch(() => null);
        if (!r || !r.ok) { setSaveErr("Could not save. Try again."); setSaving(false); return; }
        history.push(analyticsReportsPath(domain));
    }

    // ── Derived preview data ──────────────────────────────────────────────────

    const primaryMetric  = config.metrics[0] || "sessions";
    const primaryMetDef  = METRIC_DEFS[primaryMetric] || METRIC_DEFS.sessions;
    const breakdownDef   = BREAKDOWN_DEFS[config.breakdown] || BREAKDOWN_DEFS.date;
    const currency       = adCurrency(adData);
    const moneyFmt       = v => formatMoney(v, currency);
    const isAdPrimary    = AD_METRICS.has(primaryMetric);

    const series = useMemo(() => {
        if (isAdPrimary && !adData) return [];
        if (!isAdPrimary && !data) return [];
        return breakdownDef.getSeries(data, adData, primaryMetric);
    }, [data, adData, config.breakdown, primaryMetric]); // eslint-disable-line react-hooks/exhaustive-deps

    const kpiValues = useMemo(() => {
        return Object.fromEntries(config.metrics.map(m => {
            const def = METRIC_DEFS[m] || METRIC_DEFS.sessions;
            return [m, def.getTotal(data, adData)];
        }));
    }, [data, adData, config.metrics]);

    const trendData = config.breakdown === "date"
        ? series.map(s => ({ date: s.label, num: s.value }))
        : [];

    const isLoading = dataLoading || adLoading;
    const hasData   = isAdPrimary ? !!adData : !!data;

    // Analytics metrics grouped for the picker
    const analyticsMetrics = Object.entries(METRIC_DEFS).filter(([, d]) => d.group === "analytics");
    const adMetricsList    = Object.entries(METRIC_DEFS).filter(([, d]) => d.group === "adspend");

    // Breakdowns: filter adPlatform out when no ad metrics selected
    const breakdownEntries = Object.entries(BREAKDOWN_DEFS).filter(([key]) =>
        key !== "adPlatform" || hasAdMetrics
    );

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title={
                    <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <button className="sa-rb-back" onClick={() => history.push(analyticsReportsPath(domain))}>
                            ← My Reports
                        </button>
                        <span style={{ color: "rgba(255,255,255,0.15)", fontWeight: 300 }}>/</span>
                        <input
                            className="sa-rb-name-input"
                            type="text"
                            placeholder="Report name…"
                            value={config.name}
                            onChange={e => setConfig(c => ({ ...c, name: e.target.value }))}
                        />
                    </span>
                }
            />

            <div className="dashboard-content">
                <div className="sa-page">
                    {loadErr && <p className="sa-notice sa-notice--error">{loadErr}</p>}

                    <div className="sa-rb-grid">
                        {/* ── LEFT: config ─────────────────────────────── */}
                        <div className="sa-rb-config-col">

                            {/* Chart type */}
                            <div className="sa-panel">
                                <h3 className="sa-panel__title">Chart type</h3>
                                <div className="sa-rb-chart-types">
                                    {["line","bar","table","kpi","donut"].map(key => (
                                        <button key={key}
                                            className={"sa-rb-ct-btn" + (config.chartType === key ? " sa-rb-ct-btn--active" : "")}
                                            onClick={() => setConfig(c => ({ ...c, chartType: key }))}>
                                            <span className="sa-rb-ct-icon">{CT_SVG[key]}</span>
                                            <span style={{ textTransform: "capitalize" }}>{key}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Metrics — grouped */}
                            <div className="sa-panel">
                                <h3 className="sa-panel__title">Metrics</h3>

                                <div className="sa-rb-metric-group-label">Site analytics</div>
                                <div className="sa-rb-metric-list">
                                    {analyticsMetrics.map(([key, def]) => (
                                        <div key={key} className="sa-rb-metric-item" onClick={() => toggleMetric(key)}>
                                            <div className={"sa-rb-check" + (config.metrics.includes(key) ? " sa-rb-check--on" : "")}>
                                                {config.metrics.includes(key) && "✓"}
                                            </div>
                                            <span className="sa-rb-metric-label">{def.label}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="sa-rb-metric-group-label" style={{ marginTop: 10 }}>
                                    <span>Ad spend</span>
                                    <span className="sa-rb-metric-group-badge">requires connection</span>
                                </div>
                                <div className="sa-rb-metric-list">
                                    {adMetricsList.map(([key, def]) => (
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
                            <div className="sa-panel">
                                <h3 className="sa-panel__title">Breakdown by</h3>
                                <div className="sa-rb-breakdown-list">
                                    {breakdownEntries.map(([key, def]) => (
                                        <div key={key} className="sa-rb-breakdown-item" onClick={() => setConfig(c => ({ ...c, breakdown: key }))}>
                                            <div className={"sa-rb-radio" + (config.breakdown === key ? " sa-rb-radio--sel" : "")} />
                                            <span className="sa-rb-metric-label">{def.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Filters */}
                            <div className="sa-panel">
                                <h3 className="sa-panel__title">Filters</h3>
                                <div className="sa-rb-filter-rows">
                                    {config.filters.map((f, i) => (
                                        <FilterRow key={i} filter={f}
                                            onChange={u => setConfig(c => { const fl=[...c.filters]; fl[i]=u; return {...c,filters:fl}; })}
                                            onRemove={() => setConfig(c => ({...c, filters: c.filters.filter((_,fi)=>fi!==i)}))} />
                                    ))}
                                </div>
                                <button className="sa-rb-add-filter"
                                    onClick={() => setConfig(c => ({...c, filters:[...c.filters,{dimension:"channel",value:""}]}))}>
                                    + Add filter
                                </button>
                            </div>

                            {/* Date range */}
                            <div className="sa-panel">
                                <h3 className="sa-panel__title">Date range</h3>
                                <select className="sa-form-select" style={{ width: "100%" }}
                                    value={config.dateRangeDays}
                                    onChange={e => setConfig(c => ({...c, dateRangeDays: parseInt(e.target.value)}))}>
                                    <option value={7}>Last 7 days</option>
                                    <option value={14}>Last 14 days</option>
                                    <option value={30}>Last 30 days</option>
                                    <option value={60}>Last 60 days</option>
                                    <option value={90}>Last 90 days</option>
                                </select>
                            </div>

                            {/* Save */}
                            <div className="sa-rb-actions">
                                {saveErr && <p className="sa-notice sa-notice--error" style={{ margin: 0, padding: "8px 14px" }}>{saveErr}</p>}
                                <button className="sa-btn sa-btn--primary" onClick={save} disabled={saving} style={{ width: "100%" }}>
                                    {saving ? "Saving…" : isNew ? "Save report" : "Update report"}
                                </button>
                                <button className="sa-btn" onClick={() => history.push(analyticsReportsPath(domain))} style={{ width: "100%" }}>
                                    Cancel
                                </button>
                            </div>
                        </div>

                        {/* ── RIGHT: live preview ───────────────────────── */}
                        <div className="sa-rb-preview-col">
                            {/* KPI summary row */}
                            {config.metrics.length > 0 && (
                                <div className="sa-rb-kpi-strip">
                                    {config.metrics.map(m => {
                                        const def = METRIC_DEFS[m] || METRIC_DEFS.sessions;
                                        const val = kpiValues[m] ?? 0;
                                        const fmt = def.isMoney ? moneyFmt(val)
                                                  : def.isRate  ? formatPercent(val)
                                                  : val.toLocaleString("de-DE");
                                        return (
                                            <div key={m} className="sa-rb-kpi">
                                                <div className="sa-rb-kpi__label">{def.label.toUpperCase()}</div>
                                                <div className="sa-rb-kpi__value">{isLoading ? "—" : fmt}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Ad spend not connected notice */}
                            {hasAdMetrics && !adLoading && !adData && domain && (
                                <div className="sa-rb-ad-notice">
                                    <strong>No ad connections found for {domain}.</strong>{" "}
                                    Connect Google Ads, Meta, or LinkedIn in the Ad Spend section to see data here.
                                </div>
                            )}

                            {/* Main chart panel */}
                            <div className="sa-panel">
                                <h3 className="sa-panel__title">
                                    {config.name || "Report preview"}
                                    <span className="sa-panel__sub-title" style={{ marginLeft: 8, fontWeight: 400, fontSize: 11, textTransform: "none", letterSpacing: 0 }}>
                                        {primaryMetDef.label} · {breakdownDef.label} · last {config.dateRangeDays}d
                                        {domain && <> · {domain}</>}
                                    </span>
                                </h3>

                                {isLoading && <p className="sa-notice" style={{ margin: 0 }}>Loading data…</p>}
                                {!isLoading && !hasData && <p className="sa-notice" style={{ margin: 0 }}>Select a domain in the header to preview live data.</p>}

                                {!isLoading && hasData && (
                                    <>
                                        {config.chartType === "kpi" && (
                                            <div className="sa-rb-kpi-grid">
                                                {config.metrics.map(m => {
                                                    const def = METRIC_DEFS[m] || METRIC_DEFS.sessions;
                                                    const val = kpiValues[m] ?? 0;
                                                    const fmt = def.isMoney ? moneyFmt(val)
                                                              : def.isRate  ? formatPercent(val)
                                                              : val.toLocaleString("de-DE");
                                                    return <KpiCard key={m} icon={<IconTarget />} label={def.label} value={fmt} />;
                                                })}
                                            </div>
                                        )}
                                        {config.chartType === "line" && config.breakdown === "date" && trendData.length > 0 && (
                                            <TrendLineChart data={trendData} title={primaryMetDef.label} showInsights height={240} />
                                        )}
                                        {config.chartType === "line" && config.breakdown !== "date" && (
                                            <BarRows series={series} formatVal={isAdPrimary && primaryMetDef.isMoney ? moneyFmt : null} />
                                        )}
                                        {config.chartType === "bar" && (
                                            <BarRows series={series} formatVal={isAdPrimary && primaryMetDef.isMoney ? moneyFmt : null} />
                                        )}
                                        {config.chartType === "table" && (
                                            <DataTable series={series} metricLabel={primaryMetDef.label}
                                                formatVal={isAdPrimary && primaryMetDef.isMoney ? moneyFmt : null} />
                                        )}
                                        {config.chartType === "donut" && (
                                            <DonutViz series={series} formatVal={isAdPrimary && primaryMetDef.isMoney ? moneyFmt : null} />
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
