const { useState, useEffect } = React;
import { ScannerHost } from "../../API/host.js";
import {
    useAnalyticsPageChrome, authHeaders, KpiCard, MiniBar, formatPercent,
} from "./_shared.js";
import TrendLineChart from "./TrendLineChart.js";

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

function DateRangePicker({ getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate }) {
    function setPreset(days) {
        setLastDays(days);
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - days);
        setFromDate(from);
        setToDate(to);
    }
    return (
        <div className="sa-date-range">
            {[7, 14, 30, 90].map(d => (
                <button key={d}
                    className={"sa-date-range__btn" + (getLastDays === d ? " sa-date-range__btn--active" : "")}
                    onClick={() => setPreset(d)}>
                    {d}d
                </button>
            ))}
            <input type="date" className="sa-date-range__input"
                value={fromDate.toISOString().slice(0, 10)}
                onChange={e => { setLastDays(0); setFromDate(new Date(e.target.value)); }} />
            <span className="sa-date-range__sep">–</span>
            <input type="date" className="sa-date-range__input"
                value={toDate.toISOString().slice(0, 10)}
                onChange={e => { setLastDays(0); setToDate(new Date(e.target.value)); }} />
        </div>
    );
}

function FormsTable({ forms }) {
    if (!forms || !forms.length) {
        return <p className="sa-empty">No form submissions in this period.</p>;
    }
    const maxSubs = Math.max(...forms.map(f => f.submissions), 1);
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
                {forms.map(f => (
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
                        <td className="sa-table__num">
                            {f.completionRate != null ? formatPercent(f.completionRate, 1) : "—"}
                        </td>
                        <td className="sa-table__num">{f.pageCount}</td>
                        <td className="sa-table__page" title={f.topPage || ""}>
                            {f.topPage
                                ? (f.topPage.length > 50 ? "…" + f.topPage.slice(-47) : f.topPage)
                                : "—"}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function TopPagesTable({ pages }) {
    if (!pages || !pages.length) return null;
    const maxSubs = Math.max(...pages.map(p => p.submissions), 1);
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

    return (
        <div className="sa-page">
            <div className="sa-page__toolbar">
                <DateRangePicker
                    getLastDays={getLastDays} setLastDays={setLastDays}
                    fromDate={fromDate} setFromDate={setFromDate}
                    toDate={toDate} setToDate={setToDate}
                />
            </div>

            {loading && <p className="sa-loading">Loading…</p>}

            {!loading && data && (
                <>
                    <div className="sa-kpi-strip">
                        <KpiCard
                            icon="📋"
                            label="Form submissions"
                            value={(data.totals.submissions ?? 0).toLocaleString("de-DE")}
                        />
                        <KpiCard
                            icon="✏️"
                            label="Forms started"
                            value={data.totals.starters > 0
                                ? data.totals.starters.toLocaleString("de-DE")
                                : "—"}
                        />
                        <KpiCard
                            icon="✅"
                            label="Completion rate"
                            value={data.totals.completionRate != null
                                ? formatPercent(data.totals.completionRate, 1)
                                : "—"}
                            sub={data.totals.completionRate != null
                                ? "submits ÷ starters"
                                : "No form_started events yet"}
                        />
                        <KpiCard
                            icon="📄"
                            label="Unique forms"
                            value={(data.forms?.length ?? 0).toLocaleString("de-DE")}
                        />
                    </div>

                    {trendData.length > 0 && (
                        <div className="sa-section">
                            <h3 className="sa-section__title">Submissions over time</h3>
                            <TrendLineChart
                                data={trendData}
                                title="Form submissions"
                            />
                        </div>
                    )}

                    <div className="sa-section">
                        <h3 className="sa-section__title">Forms</h3>
                        <FormsTable forms={data.forms} />
                    </div>

                    {data.topPages?.length > 0 && (
                        <div className="sa-section">
                            <h3 className="sa-section__title">Top pages</h3>
                            <TopPagesTable pages={data.topPages} />
                        </div>
                    )}
                </>
            )}

            {!loading && !domain && (
                <p className="sa-empty">Select a domain to view form analytics.</p>
            )}
        </div>
    );
}
