const { useState, useEffect, useMemo } = React;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import {
    useAnalyticsPageChrome, authHeaders, KpiCard, MiniBar, formatPercent,
} from "./_shared.js";
import { IconFormFill, IconBarChart, IconTarget, IconScrollDepth } from "./Icons.js";
import TrendLineChart from "./TrendLineChart.js";
import "./Analytics.css";

function useFormsReport(domain, fromIso, toIso) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!domain) { setData(null); return; }
        let ignore = false;
        setLoading(true);
        const qs = new URLSearchParams({ domain, from: fromIso, to: toIso }).toString();
        fetch(`${ScannerHost}/api/analytics-forms?${qs}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (!ignore) setData(d); })
            .catch(() => { if (!ignore) setData(null); })
            .finally(() => { if (!ignore) setLoading(false); });
        return () => { ignore = true; };
    }, [domain, fromIso, toIso]);

    return { data, loading };
}

function FormsTable({ forms }) {
    const maxSubs = useMemo(() => Math.max(...(forms || []).map(f => f.submissions), 1), [forms]);

    if (!forms || !forms.length) {
        return <p className="sa-notice">No form submissions in this period.</p>;
    }
    return (
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Form</th>
                    <th className="sa-table__num">Submissions</th>
                    <th className="sa-table__num">Started</th>
                    <th className="sa-table__num">Completion</th>
                    <th className="sa-table__num">Pages</th>
                    <th>Top page</th>
                </tr>
            </thead>
            <tbody>
                {forms.map(f => {
                    const rate = f.completionRate;
                    const rateColor = rate == null ? undefined
                        : rate < 30 ? "rgba(239,68,68,0.9)"
                        : rate < 60 ? "rgba(234,179,8,0.9)"
                        : "rgba(34,197,94,0.9)";
                    return (
                        <tr key={f.formId}>
                            <td>
                                <span className="sa-form-id">{f.formId}</span>
                                {f.formAction && (
                                    <span className="sa-form-action" title={f.formAction}>
                                        {f.formAction.length > 40 ? f.formAction.slice(0, 40) + "…" : f.formAction}
                                    </span>
                                )}
                                <MiniBar value={f.submissions} max={maxSubs} color="rgba(99,102,241,0.5)" />
                            </td>
                            <td className="sa-table__num">{f.submissions.toLocaleString("de-DE")}</td>
                            <td className="sa-table__num">{f.starters > 0 ? f.starters.toLocaleString("de-DE") : "—"}</td>
                            <td className="sa-table__num" style={rateColor ? { color: rateColor, fontWeight: 600 } : {}}>
                                {rate != null ? formatPercent(rate, 1) : "—"}
                            </td>
                            <td className="sa-table__num">{f.pageCount}</td>
                            <td className="sa-table__page" title={f.topPage || ""}>
                                {f.topPage
                                    ? (f.topPage.length > 50 ? "…" + f.topPage.slice(-47) : f.topPage)
                                    : "—"}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

function TopPagesTable({ pages }) {
    const maxSubs = useMemo(() => Math.max(...(pages || []).map(p => p.submissions), 1), [pages]);
    if (!pages || !pages.length) return null;
    return (
        <table className="sa-table">
            <thead>
                <tr>
                    <th>Page</th>
                    <th className="sa-table__num">Submissions</th>
                </tr>
            </thead>
            <tbody>
                {pages.map(p => (
                    <tr key={p.page}>
                        <td>
                            <span title={p.page}>{p.page.length > 60 ? "…" + p.page.slice(-57) : p.page}</span>
                            <MiniBar value={p.submissions} max={maxSubs} color="rgba(192,159,83,0.5)" />
                        </td>
                        <td className="sa-table__num">{p.submissions.toLocaleString("de-DE")}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export default function AnalyticsForms() {
    const {
        domain,
        getLastDays, setLastDays,
        fromDate, setFromDate,
        toDate, setToDate,
        fromIso, toIso,
    } = useAnalyticsPageChrome();

    const { data, loading } = useFormsReport(domain, fromIso, toIso);

    const trendData = (data?.daily || []).map(d => ({
        label: d.day,
        num: d.submissions,
    }));

    const completionRateVariant = (() => {
        const r = data?.totals?.completionRate;
        if (r == null) return undefined;
        if (r < 30) return "warn";
        if (r >= 60) return "live";
        return undefined;
    })();

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Forms"
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
                        <p className="sa-notice">Select a domain to view form analytics.</p>
                    )}
                    {domain && loading && <p className="sa-notice">Loading&hellip;</p>}

                    {domain && !loading && data && (
                        <>
                            <div className="sa-kpi-strip sa-kpi-strip--4">
                                <KpiCard
                                    icon={<IconFormFill />}
                                    label="Form submissions"
                                    value={(data.totals.submissions ?? 0).toLocaleString("de-DE")}
                                />
                                <KpiCard
                                    icon={<IconTarget />}
                                    label="Forms started"
                                    value={data.totals.starters > 0
                                        ? data.totals.starters.toLocaleString("de-DE")
                                        : "—"}
                                />
                                <KpiCard
                                    icon={<IconBarChart />}
                                    label="Completion rate"
                                    value={data.totals.completionRate != null
                                        ? formatPercent(data.totals.completionRate, 1)
                                        : "—"}
                                    sub={data.totals.completionRate != null
                                        ? "submits ÷ starters"
                                        : "No form_started events yet"}
                                    variant={completionRateVariant}
                                />
                                <KpiCard
                                    icon={<IconScrollDepth />}
                                    label="Unique forms"
                                    value={(data.forms?.length ?? 0).toLocaleString("de-DE")}
                                />
                            </div>

                            {trendData.length > 0 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconBarChart className="sa-icon" /> Submissions over time
                                    </h3>
                                    <TrendLineChart
                                        data={trendData}
                                        title="Form submissions"
                                    />
                                </div>
                            )}

                            <div className="sa-panel">
                                <h3 className="sa-panel__title">
                                    <IconFormFill className="sa-icon" /> Forms
                                </h3>
                                <FormsTable forms={data.forms} />
                            </div>

                            {data.topPages?.length > 0 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        <IconScrollDepth className="sa-icon" /> Top pages
                                    </h3>
                                    <TopPagesTable pages={data.topPages} />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
