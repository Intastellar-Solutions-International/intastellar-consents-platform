const { useState, useEffect, useMemo } = React;
const useParams  = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, useAnalyticsPageChrome, useAnalyticsReport, useAdSpendReport, KpiCard, formatPercent } from "./_shared.js";
import { analyticsReportsPath, analyticsReportBuilderPath } from "../../Functions/domainPathSegments.js";
import { METRIC_LABELS, AD_METRICS } from "./reportTemplates.js";
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

function adCurrency(adData)      { return adData?.spendByCurrency?.[0]?.currency || "EUR"; }
function adSpendTotal(adData)    { return Number(adData?.spendByCurrency?.[0]?.amount || 0); }
function adClicksTotal(adData)   { return Number(adData?.spendByCurrency?.[0]?.clicks || 0); }
function adImprTotal(adData)     { return Number(adData?.spendByCurrency?.[0]?.impressions || 0); }
function adCacTotal(adData)      { return Number(adData?.blendedCac?.[0]?.cac || 0); }
function adFieldForMetric(m)     { return m === "adClicks" ? "clicks" : m === "adImpressions" ? "impressions" : "spend"; }

const BREAKDOWN_LABELS = {
    date: "Date (daily)", country: "Country", device: "Device",
    utmSource: "UTM source", browser: "Browser", channel: "Channel",
    none: "Totals", adPlatform: "Ad platform",
};

const BREAKDOWN_DEFS = {
    date:       d => (d?.daily||[]).map(r => ({ label: r.date, value: (r.full_count||0)+(r.minimal||0) })),
    country:    d => (d?.countries||[]).slice(0,10).map(r => ({ label: r.code||"?", value: r.events })),
    device:     d => (d?.devices||[]).map(r => ({ label: r.type||"Unknown", value: r.events })),
    utmSource:  d => (d?.utmSources||[]).slice(0,10).map(r => ({ label: r.source||"(none)", value: r.events })),
    browser:    d => (d?.browsers||[]).slice(0,8).map(r => ({ label: r.name||"Unknown", value: r.events })),
    channel:    d => (d?.conversionsByChannel||[]).map(r => ({ label: r.channel, value: r.sessions||r.count })),
    none:       () => [],
};

const METRIC_DEFS = {
    sessions:       { getTotal: (d, _ad) => d?.totals?.unique_sessions || 0,                                        isRate: false },
    pageViews:      { getTotal: (d, _ad) => (d?.daily||[]).reduce((s,r) => s+(r.full_count||0)+(r.minimal||0), 0), isRate: false },
    conversions:    { getTotal: (d, _ad) => (d?.conversions||[]).reduce((s,c) => s+(c.count||0), 0),                isRate: false },
    conversionRate: { getTotal: (d, _ad) => d?.totals?.conversionRate || 0,                                         isRate: true  },
    consentRate:    { getTotal: (d, _ad) => { const t = d?.totals?.total||0; return t > 0 ? ((d?.totals?.full_count||0)/t)*100 : 0; }, isRate: true },
    newUsers:       { getTotal: (d, _ad) => { const r=(d?.newVsReturning||[]).find(r=>r.is_returning===false||r.is_returning==="false"); return r?.sessions||0; }, isRate: false },
    adSpend:        { getTotal: (_d, ad) => adSpendTotal(ad),   isRate: false, isMoney: true  },
    adClicks:       { getTotal: (_d, ad) => adClicksTotal(ad),  isRate: false, isMoney: false },
    adImpressions:  { getTotal: (_d, ad) => adImprTotal(ad),    isRate: false, isMoney: false },
    blendedCac:     { getTotal: (_d, ad) => adCacTotal(ad),     isRate: false, isMoney: true  },
};

const COLORS = ["rgba(192,159,83,0.9)","rgba(74,222,128,0.8)","rgba(99,179,237,0.8)","rgba(167,139,250,0.8)","rgba(251,146,60,0.8)"];

// ── Chart renders ─────────────────────────────────────────────────────────────

function BarRows({ series, formatVal }) {
    if (!series?.length) return <p className="sa-notice" style={{ margin: 0 }}>No data.</p>;
    const max = Math.max(...series.map(s => s.value), 1);
    return (
        <div className="sa-rv-bar-chart">
            {series.map((s, i) => (
                <div key={i} className="sa-rv-bar-row">
                    <span className="sa-rv-bar-label" title={s.label}>{s.label}</span>
                    <div className="sa-rv-bar-track">
                        <div className="sa-rv-bar-fill" style={{ width: `${(s.value/max)*100}%` }} />
                    </div>
                    <span className="sa-rv-bar-val">{formatVal ? formatVal(s.value) : s.value?.toLocaleString("de-DE") ?? "—"}</span>
                </div>
            ))}
        </div>
    );
}

function DataTable({ series, metricLabel, formatVal }) {
    if (!series?.length) return <p className="sa-notice" style={{ margin: 0 }}>No data.</p>;
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
                            <div className="sa-bar" style={{ minWidth: 100 }}>
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
    if (!series?.length) return <p className="sa-notice" style={{ margin: 0 }}>No data.</p>;
    const total = series.reduce((s,r) => s+r.value, 0);
    const top5  = series.slice(0, 5);
    const circumference = 2 * Math.PI * 52;
    let offset = 0;
    return (
        <div className="sa-rb-donut-wrap">
            <svg width="160" height="160" viewBox="0 0 130 130" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportView() {
    const { reportId } = useParams();
    const history      = useHistory();
    const { domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate } = useAnalyticsPageChrome();

    const [report,      setReport]     = useState(null);
    const [loadErr,     setLoadErr]    = useState(null);
    const [dupLoading,  setDupLoading] = useState(false);

    useEffect(() => {
        if (!domain) return;
        fetch(`${REPORTS_URL}?domain=${encodeURIComponent(domain)}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                const json = await r.json();
                const found = (json.reports || []).find(r => String(r.id) === String(reportId));
                if (found) { setReport(found); document.title = `${found.name} | Site Analytics`; }
                else setLoadErr("Report not found.");
            })
            .catch(() => setLoadErr("Could not load report."));
    }, [reportId, domain]); // eslint-disable-line react-hooks/exhaustive-deps

    const reportFrom = useMemo(() => {
        const days = report?.date_range_days || 30;
        const d = new Date(); d.setDate(d.getDate() - days);
        return d.toISOString().slice(0,10);
    }, [report?.date_range_days]);

    const reportTo = useMemo(() => new Date().toISOString().slice(0,10), []);

    const segment = useMemo(() => {
        const filters = report?.filters || [];
        const seg = { device: null, country: "", channel: null, consent: null };
        filters.forEach(f => {
            if (!f.value) return;
            if (f.dimension === "channel") seg.channel = f.value;
            if (f.dimension === "device")  seg.device  = f.value;
            if (f.dimension === "consent") seg.consent = f.value;
            if (f.dimension === "country") seg.country = f.value;
        });
        return (seg.device || seg.country || seg.channel || seg.consent) ? seg : null;
    }, [report?.filters]);

    const metrics   = report?.metrics   || ["sessions"];
    const breakdown = report?.breakdown || "date";
    const chartType = report?.chart_type || "line";

    const hasAdMetrics = metrics.some(m => AD_METRICS.has(m));
    const primaryMetric = metrics[0] || "sessions";
    const isAdPrimary   = AD_METRICS.has(primaryMetric);

    const { data, loading: dataLoading } = useAnalyticsReport(domain, reportFrom, reportTo, 0, segment);
    const { data: adData, loading: adLoading } = useAdSpendReport(domain, reportFrom, reportTo, hasAdMetrics);

    const currency = adCurrency(adData);
    const moneyFmt = v => formatMoney(v, currency);
    const primaryMetDef = METRIC_DEFS[primaryMetric] || METRIC_DEFS.sessions;

    const series = useMemo(() => {
        if (breakdown === "adPlatform") {
            const field = adFieldForMetric(primaryMetric);
            const byPlat = {};
            (adData?.platforms||[]).forEach(p => {
                byPlat[p.platform] = (byPlat[p.platform]||0) + Number(p[field] || p.amount || 0);
            });
            return Object.entries(byPlat)
                .map(([plat, val]) => ({ label: PLATFORM_LABELS[plat]||plat, value: val }))
                .sort((a, b) => b.value - a.value);
        }
        if (breakdown === "date" && isAdPrimary) {
            const field = adFieldForMetric(primaryMetric);
            return (adData?.daily||[]).map(r => ({
                label: r.date,
                value: Object.values(r.byPlatform||{}).reduce((s, p) => s + (p[field]||0), 0),
            }));
        }
        if (!BREAKDOWN_DEFS[breakdown] || !data) return [];
        return BREAKDOWN_DEFS[breakdown](data);
    }, [data, adData, breakdown, primaryMetric]); // eslint-disable-line react-hooks/exhaustive-deps

    const kpiValues = useMemo(() => {
        if (!data && !adData) return {};
        return Object.fromEntries(metrics.map(m => [m, (METRIC_DEFS[m]||METRIC_DEFS.sessions).getTotal(data, adData)]));
    }, [data, adData, metrics]); // eslint-disable-line react-hooks/exhaustive-deps

    const trendData = breakdown === "date"
        ? series.map(s => ({ date: s.label, num: s.value }))
        : [];

    const isLoading = dataLoading || adLoading;
    const hasData   = isAdPrimary ? !!adData : !!data;

    async function duplicate() {
        if (!report || !domain) return;
        setDupLoading(true);
        const body = {
            name:            `${report.name} (copy)`,
            chart_type:      report.chart_type,
            metrics:         report.metrics,
            breakdown:       report.breakdown,
            filters:         report.filters || [],
            date_range_days: report.date_range_days,
        };
        const r = await fetch(`${REPORTS_URL}?domain=${encodeURIComponent(domain)}`,
            { method: "POST", headers: authHeaders(), body: JSON.stringify(body) }).catch(() => null);
        setDupLoading(false);
        if (r?.ok) {
            const created = await r.json();
            history.push(analyticsReportBuilderPath(domain, created.id));
        }
    }

    function fmtDate(iso) {
        if (!iso) return "";
        return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title={
                    <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <button className="sa-rb-back" onClick={() => history.push(analyticsReportsPath(domain))}>
                            ← My Reports
                        </button>
                        <span style={{ color: "rgba(255,255,255,0.15)", fontWeight: 300 }}>/</span>
                        <span style={{ fontWeight: 600, color: "rgba(210,210,210,0.92)", fontSize: "0.95rem" }}>
                            {report?.name || "Report"}
                        </span>
                    </span>
                }
            />

            <div className="dashboard-content">
                <div className="sa-page">
                    {loadErr && <p className="sa-notice sa-notice--error">{loadErr}</p>}

                    {report && (
                        <>
                            {/* ── Header row ─────────────────────────────────── */}
                            <div className="sa-rv-header">
                                <div className="sa-rv-meta">
                                    <div className="sa-rv-meta__chips">
                                        {metrics.map(m => (
                                            <span key={m} className="sa-rv-chip">{METRIC_LABELS[m] || m}</span>
                                        ))}
                                        <span className="sa-rv-chip sa-rv-chip--dim">{BREAKDOWN_LABELS[breakdown] || breakdown}</span>
                                        <span className="sa-rv-chip sa-rv-chip--dim">Last {report.date_range_days}d</span>
                                        {(report.filters||[]).filter(f=>f.value).map((f,i) => (
                                            <span key={i} className="sa-rv-chip sa-rv-chip--filter">{f.dimension}: {f.value}</span>
                                        ))}
                                    </div>
                                    <div className="sa-rv-meta__updated">Updated {fmtDate(report.updated_at)}</div>
                                </div>
                                <div className="sa-rv-actions">
                                    <button className="sa-btn" onClick={duplicate} disabled={dupLoading}>
                                        {dupLoading ? "Duplicating…" : "Duplicate"}
                                    </button>
                                    <button className="sa-btn sa-btn--primary"
                                        onClick={() => history.push(analyticsReportBuilderPath(domain, report.id))}>
                                        Edit report
                                    </button>
                                </div>
                            </div>

                            {/* ── KPI strip ──────────────────────────────────── */}
                            {metrics.length > 0 && (
                                <div className="sa-rv-kpi-strip">
                                    {metrics.map(m => {
                                        const def = METRIC_DEFS[m] || METRIC_DEFS.sessions;
                                        const val = kpiValues[m] ?? 0;
                                        const fmt = def.isMoney ? moneyFmt(val)
                                                  : def.isRate  ? formatPercent(val)
                                                  : val.toLocaleString("de-DE");
                                        return (
                                            <div key={m} className="sa-rv-kpi">
                                                <div className="sa-rv-kpi__label">{(METRIC_LABELS[m]||m).toUpperCase()}</div>
                                                <div className="sa-rv-kpi__value">{isLoading ? "—" : fmt}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Ad not connected notice */}
                            {hasAdMetrics && !adLoading && !adData && domain && (
                                <div className="sa-rb-ad-notice">
                                    <strong>No ad connections for {domain}.</strong>{" "}
                                    Connect an ad platform in the Ad Spend section to see this data.
                                </div>
                            )}

                            {/* ── Main visualisation ─────────────────────────── */}
                            <div className="sa-panel">
                                <h3 className="sa-panel__title">
                                    {report.name}
                                    {domain && <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 8, fontSize: 11, color: "rgba(130,130,130,0.6)" }}>{domain}</span>}
                                </h3>

                                {isLoading && <p className="sa-notice" style={{ margin: 0 }}>Loading data…</p>}
                                {!isLoading && !hasData && <p className="sa-notice" style={{ margin: 0 }}>Select a domain to view this report.</p>}

                                {!isLoading && hasData && (
                                    <>
                                        {chartType === "kpi" && (
                                            <div className="sa-rb-kpi-grid">
                                                {metrics.map(m => {
                                                    const def = METRIC_DEFS[m] || METRIC_DEFS.sessions;
                                                    const val = kpiValues[m] ?? 0;
                                                    const fmt = def.isMoney ? moneyFmt(val)
                                                              : def.isRate  ? formatPercent(val)
                                                              : val.toLocaleString("de-DE");
                                                    return <KpiCard key={m} icon={<IconTarget />} label={METRIC_LABELS[m]||m} value={fmt} />;
                                                })}
                                            </div>
                                        )}
                                        {chartType === "line" && breakdown === "date" && trendData.length > 0 && (
                                            <TrendLineChart data={trendData} title={METRIC_LABELS[metrics[0]]||metrics[0]} showInsights height={280} />
                                        )}
                                        {chartType === "line" && breakdown !== "date" && (
                                            <BarRows series={series} formatVal={isAdPrimary && primaryMetDef.isMoney ? moneyFmt : null} />
                                        )}
                                        {chartType === "bar" && (
                                            <BarRows series={series} formatVal={isAdPrimary && primaryMetDef.isMoney ? moneyFmt : null} />
                                        )}
                                        {chartType === "table" && (
                                            <DataTable series={series} metricLabel={METRIC_LABELS[metrics[0]]||metrics[0]}
                                                formatVal={isAdPrimary && primaryMetDef.isMoney ? moneyFmt : null} />
                                        )}
                                        {chartType === "donut" && (
                                            <DonutViz series={series} formatVal={isAdPrimary && primaryMetDef.isMoney ? moneyFmt : null} />
                                        )}
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
