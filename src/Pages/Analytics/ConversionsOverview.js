const { useState, useContext, useMemo } = React;
const useParams = window.ReactRouterDOM.useParams;
import { DomainContext } from "../../App.js";
import { useSyncDomainFromRoute, isCombinedOrClearDomain } from "../../Functions/domainPathSegments.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { useAnalyticsReport, toIsoDate, KpiCard } from "./_shared.js";
import { IconTarget, IconTrendingUp, IconGlobe } from "./Icons.js";
import AnalyticsWorldMap from "./AnalyticsWorldMap.js";
import ConversionsPanel from "./Conversions.js";
import "./Analytics.css";

export default function AnalyticsConversionsOverview() {
    document.title = "Conversions | Site Analytics";

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

    const [tick, setTick] = useState(0);
    const { data, loading, error } = useAnalyticsReport(domain, fromIso, toIso, tick);

    const totalConversions = useMemo(
        () => (data?.conversions || []).reduce((s, c) => s + (c.count || 0), 0),
        [data]
    );

    const showData = !loading && data && !data.noSiteKey && !data.noData;

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Conversions"
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
                        <p className="sa-notice">Select a domain in the header to view conversions.</p>
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
                        <div className="sa-conv-grid">
                            <KpiCard className="sa-conv-kpi1"
                                icon={<IconTarget />}
                                label="Total conversions"
                                value={totalConversions.toLocaleString("de-DE")}
                                sub={`across ${data.conversions.length} registered event${data.conversions.length !== 1 ? "s" : ""}`}
                            />
                            <KpiCard className="sa-conv-kpi2"
                                icon={<IconTrendingUp />}
                                label="Conversion rate"
                                value={data.totals.conversionRate + "%"}
                                sub={`${data.totals.convertedSessions.toLocaleString("de-DE")} of ${data.totals.uniqueSessions.toLocaleString("de-DE")} sessions`}
                            />

                            <div className="sa-panel sa-conv-map">
                                <h3 className="sa-panel__title"><IconGlobe className="sa-icon" /> Where conversions happen</h3>
                                <AnalyticsWorldMap countries={data.conversionCountries} metricLabel="Conversions" />
                            </div>

                            <div className="sa-conv-list">
                                <ConversionsPanel
                                    domain={domain}
                                    conversions={data.conversions}
                                    onDefsChanged={() => setTick(t => t + 1)}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
