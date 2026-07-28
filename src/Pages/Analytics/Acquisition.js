const { useState, useContext, useMemo } = React;
const useParams = window.ReactRouterDOM.useParams;
import { DomainContext } from "../../App.js";
import { useSyncDomainFromRoute, isCombinedOrClearDomain } from "../../Functions/domainPathSegments.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { useAnalyticsReport, toIsoDate, MiniBar, AnalyticsSubNav } from "./_shared.js";
import { IconMegaphone, IconTrendingUp } from "./Icons.js";
import "./Analytics.css";

export default function AnalyticsAcquisition() {
    document.title = "Acquisition | Site Analytics";

    const { handle } = useParams();
    const [globalDomain, setGlobalDomain] = useContext(DomainContext);
    useSyncDomainFromRoute(handle, setGlobalDomain);

    const domain = useMemo(() => {
        if (isCombinedOrClearDomain(globalDomain)) return null;
        return String(globalDomain || "").trim().toLowerCase();
    }, [globalDomain]);

    const [getLastDays, setLastDays] = useState(30);
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 30); return d;
    });
    const [toDate, setToDate] = useState(() => new Date());

    const fromIso = useMemo(() => toIsoDate(fromDate), [fromDate]);
    const toIso   = useMemo(() => toIsoDate(toDate),   [toDate]);

    const { data, loading, error } = useAnalyticsReport(domain, fromIso, toIso);

    const maxUtm     = useMemo(() => Math.max(...(data?.utmSources || []).map(u => u.events), 1), [data]);
    const maxPages   = useMemo(() => Math.max(...(data?.topPages   || []).map(p => p.views),  1), [data]);

    const showData = !loading && data && !data.noSiteKey && !data.noData;

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Acquisition"
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
            />
            <div className="dashboard-content">
                <div className="sa-page">
                    {data && !data.noSiteKey && <AnalyticsSubNav handle={handle} />}

                    {!domain && (
                        <p className="sa-notice">Select a domain in the header to view acquisition data.</p>
                    )}
                    {domain && loading && <p className="sa-notice">Loading&hellip;</p>}
                    {domain && error && <p className="sa-notice sa-notice--error">{error}</p>}
                    {domain && !loading && data?.noSiteKey && (
                        <p className="sa-notice">No analytics set up for this domain yet.</p>
                    )}
                    {domain && !loading && data?.noData && (
                        <p className="sa-notice">No data for the selected period.</p>
                    )}

                    {showData && (
                        <div className="sa-acq-grid">

                            {/* Top pages */}
                            <div className="sa-panel sa-acq-pages">
                                <h3 className="sa-panel__title"><IconTrendingUp className="sa-icon" /> Top pages</h3>
                                <table className="sa-table">
                                    <thead>
                                        <tr>
                                            <th>Page</th>
                                            <th className="sa-table__num">Views</th>
                                            <th className="sa-table__num">Sessions</th>
                                            <th className="sa-table__bar" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.topPages.map(p => (
                                            <tr key={p.pathname}>
                                                <td className="sa-table__path" title={p.pathname}>{p.pathname}</td>
                                                <td className="sa-table__num">{p.views.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__num">{p.sessions.toLocaleString("de-DE")}</td>
                                                <td className="sa-table__bar">
                                                    <MiniBar value={p.views} max={maxPages} color="rgba(192,159,83,0.6)" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* UTM sources */}
                            {data.utmSources.length > 0 ? (
                                <div className="sa-panel sa-acq-utm">
                                    <h3 className="sa-panel__title">
                                        <IconMegaphone className="sa-icon" /> UTM sources
                                        <span className="sa-panel__consent-note">full events only</span>
                                    </h3>
                                    <table className="sa-table">
                                        <thead>
                                            <tr>
                                                <th>Source</th>
                                                <th>Medium</th>
                                                <th className="sa-table__num">Events</th>
                                                <th className="sa-table__bar" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.utmSources.map((u, i) => (
                                                <tr key={i}>
                                                    <td>{u.source || "—"}</td>
                                                    <td>{u.medium || "—"}</td>
                                                    <td className="sa-table__num">{u.events.toLocaleString("de-DE")}</td>
                                                    <td className="sa-table__bar">
                                                        <MiniBar value={u.events} max={maxUtm} color="rgba(251,146,60,0.6)" />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="sa-panel sa-acq-utm">
                                    <h3 className="sa-panel__title">
                                        <IconMegaphone className="sa-icon" /> UTM sources
                                        <span className="sa-panel__consent-note">full events only</span>
                                    </h3>
                                    <p style={{ color: "rgba(130,130,130,0.55)", fontSize: "0.82rem", margin: 0 }}>
                                        No UTM-tagged traffic in this period. Add <code>?utm_source=</code> parameters to your campaign links to see data here.
                                    </p>
                                </div>
                            )}

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
