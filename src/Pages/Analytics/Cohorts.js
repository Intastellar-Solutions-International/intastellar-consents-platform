const { useState, useEffect, useMemo } = React;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, useAnalyticsPageChrome } from "./_shared.js";
import "./Analytics.css";

const COHORTS_URL = `${ScannerHost}/api/analytics-cohorts`;

function useCohortData(domain, fromIso, toIso) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState(null);

    useEffect(() => {
        if (!domain) { setData(null); return; }
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({ domain, from: fromIso, to: toIso }).toString();
        fetch(`${COHORTS_URL}?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                setData(await r.json());
            })
            .catch(() => setError("Could not load cohort data."))
            .finally(() => setLoading(false));
    }, [domain, fromIso, toIso]);

    return { data, loading, error };
}

function retentionPct(sessions, cohortSize) {
    if (!cohortSize) return null;
    return Math.round((sessions / cohortSize) * 100);
}

function pctColor(pct) {
    if (pct == null) return "transparent";
    if (pct >= 80) return "rgba(74,222,128,0.65)";
    if (pct >= 50) return "rgba(74,222,128,0.35)";
    if (pct >= 25) return "rgba(192,159,83,0.45)";
    if (pct >= 10) return "rgba(192,159,83,0.25)";
    return "rgba(239,68,68,0.2)";
}

function fmtWeek(isoDate) {
    const d = new Date(isoDate);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function AnalyticsCohorts() {
    document.title = "Retention Cohorts | Site Analytics";

    const {
        domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate, fromIso, toIso,
    } = useAnalyticsPageChrome();

    const { data, loading, error } = useCohortData(domain, fromIso, toIso);

    const maxOffset = useMemo(() => {
        if (!data?.cohorts?.length) return 0;
        return Math.max(...data.cohorts.flatMap(c => c.weeks.map(w => w.offset)));
    }, [data]);

    const offsets = useMemo(() => Array.from({ length: maxOffset + 1 }, (_, i) => i), [maxOffset]);

    const hasCohorts = data?.cohorts?.length > 0;

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Retention Cohorts"
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
                        <p className="sa-notice">Select a domain in the header to view cohort retention.</p>
                    )}
                    {domain && loading && <p className="sa-notice">Loading&hellip;</p>}
                    {domain && error && <p className="sa-notice sa-notice--error">{error}</p>}
                    {domain && !loading && data?.noSiteKey && (
                        <p className="sa-notice">No analytics set up for this domain yet.</p>
                    )}
                    {domain && !loading && data && !data.noSiteKey && !hasCohorts && (
                        <p className="sa-notice">No session data with full consent in this period. Cohort retention requires full-consent sessions.</p>
                    )}

                    {domain && hasCohorts && (
                        <div className="sa-cohorts-wrap">
                            <div className="sa-panel" style={{ overflowX: "auto" }}>
                                <h3 className="sa-panel__title">Weekly Retention Matrix</h3>
                                <p className="sa-panel__sub">
                                    Each row is a cohort of users by their first visit week. Columns show what % returned in subsequent weeks.
                                    Only full-consent sessions are included.
                                </p>
                                <table className="sa-cohort-table">
                                    <thead>
                                        <tr>
                                            <th className="sa-cohort-table__week">Cohort week</th>
                                            <th className="sa-cohort-table__size">Users</th>
                                            {offsets.map(o => (
                                                <th key={o} className="sa-cohort-table__cell">
                                                    {o === 0 ? "Week 0" : `+${o}w`}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.cohorts.map(cohort => {
                                            const weekMap = new Map(cohort.weeks.map(w => [w.offset, w.sessions]));
                                            return (
                                                <tr key={cohort.cohortWeek}>
                                                    <td className="sa-cohort-table__week">{fmtWeek(cohort.cohortWeek)}</td>
                                                    <td className="sa-cohort-table__size">{cohort.cohortSize.toLocaleString("de-DE")}</td>
                                                    {offsets.map(o => {
                                                        const sessions = weekMap.get(o);
                                                        const pct = sessions != null ? retentionPct(sessions, cohort.cohortSize) : null;
                                                        return (
                                                            <td key={o}
                                                                className="sa-cohort-table__cell"
                                                                style={{ background: pctColor(pct) }}
                                                                title={sessions != null ? `${sessions.toLocaleString("de-DE")} sessions` : "No data"}>
                                                                {pct != null ? `${pct}%` : "—"}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                <p className="sa-cohort-legend">
                                    <span style={{ background: "rgba(74,222,128,0.65)", display: "inline-block", width: 12, height: 12, borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />≥80%&ensp;
                                    <span style={{ background: "rgba(74,222,128,0.35)", display: "inline-block", width: 12, height: 12, borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />50–79%&ensp;
                                    <span style={{ background: "rgba(192,159,83,0.45)", display: "inline-block", width: 12, height: 12, borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />25–49%&ensp;
                                    <span style={{ background: "rgba(192,159,83,0.25)", display: "inline-block", width: 12, height: 12, borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />10–24%&ensp;
                                    <span style={{ background: "rgba(239,68,68,0.2)",   display: "inline-block", width: 12, height: 12, borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />&lt;10%
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
