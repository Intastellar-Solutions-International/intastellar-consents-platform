const { useState, useEffect, useMemo } = React;
const useParams = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, useAnalyticsPageChrome, useCompareRange, KpiCard, MiniBar, formatCount } from "./_shared.js";
import { analyticsConversionsPath } from "../../Functions/domainPathSegments.js";
import TrendLineChart from "./TrendLineChart.js";
import AnalyticsWorldMap from "./AnalyticsWorldMap.js";
import { countryName } from "./LiveVisitorDrawer.js";
import { PanelSkeleton } from "./components/Skeleton.js";
import "./Analytics.css";

const EVENT_DETAIL_URL = `${ScannerHost}/api/analytics-event-detail`;

const DEVICE_LABELS = {
    desktop: "Desktop", tablet: "Tablet", mobile: "Mobile", other: "Other",
};

function useEventDetail(domain, eventName, fromIso, toIso) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState(null);

    useEffect(() => {
        if (!domain || !eventName) { setData(null); return; }
        setLoading(true); setError(null);
        const qs = new URLSearchParams({ domain, event: eventName, from: fromIso, to: toIso }).toString();
        fetch(`${EVENT_DETAIL_URL}?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                setData(await r.json());
            })
            .catch(() => setError("Could not load event data."))
            .finally(() => setLoading(false));
    }, [domain, eventName, fromIso, toIso]);

    return { data, loading, error };
}

export default function EventDetail() {
    document.title = "Event | Site Analytics";

    const { eventName: rawEventName } = useParams();
    const eventName = decodeURIComponent(rawEventName || "");
    const history = useHistory();

    const { domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate, fromIso, toIso }
        = useAnalyticsPageChrome();

    const { data, loading, error } = useEventDetail(domain, eventName, fromIso, toIso);

    const compare = useCompareRange();

    const maxCountry = useMemo(
        () => Math.max(...(data?.countries || []).map(c => c.events), 1),
        [data]
    );
    const maxDevice = useMemo(
        () => Math.max(...(data?.devices || []).map(d => d.events), 1),
        [data]
    );

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                className="sa-sticky-header"
                title={data?.event?.label || eventName}
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
                previousPeriod={compare.previousPeriod}
                previousPeriod2={compare.previousPeriod2}
                compareRange={compare.compareRange}
                setCompareRange={compare.setCompareRange}
                setCompareWindowStart={compare.setCompareWindowStart}
                setCompareWindowEnd={compare.setCompareWindowEnd}
            />
            <div className="dashboard-content">
                <div className="sa-page">
                    <p className="sa-panel__sub" style={{ marginBottom: 14 }}>
                        <a href="#" onClick={e => { e.preventDefault(); history.push(analyticsConversionsPath(domain)); }}>
                            ← Back to Conversions
                        </a>
                    </p>

                    {!domain && (
                        <p className="sa-notice">Select a domain in the header to view event details.</p>
                    )}
                    {domain && error && <p className="sa-notice sa-notice--error">{error}</p>}
                    {domain && loading && <PanelSkeleton titleWidth={160} rows={5} />}
                    {domain && !loading && data?.noSiteKey && (
                        <p className="sa-notice">No analytics set up for this domain yet.</p>
                    )}

                    {domain && !loading && data && !data.noSiteKey && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                            <div className="sa-acq-kpis">
                                <KpiCard
                                    label="Total events"
                                    value={formatCount(data.total)}
                                />
                                <KpiCard
                                    label="Sessions"
                                    value={formatCount(data.sessions)}
                                    sub="distinct session IDs — this system has no persistent visitor ID"
                                />
                                <KpiCard
                                    label="Events / session"
                                    value={data.eventsPerSession != null ? data.eventsPerSession.toLocaleString("de-DE") : "—"}
                                />
                            </div>

                            <div className="sa-panel">
                                <h3 className="sa-panel__title">Events over time</h3>
                                <TrendLineChart
                                    data={data.daily}
                                    fromDate={fromDate}
                                    toDate={toDate}
                                    title="Events over time"
                                    showInsights
                                    height={260}
                                />
                            </div>

                            <div className="sa-panel">
                                <h3 className="sa-panel__title">Event count by country</h3>
                                {data.countries.length === 0 ? (
                                    <p className="sa-panel__sub">No country data for this period.</p>
                                ) : (
                                    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                                        <div style={{ flex: "1 1 320px", minWidth: 280 }}>
                                            <AnalyticsWorldMap
                                                countries={data.countries}
                                                metricLabel="Events"
                                                formatValue={n => n.toLocaleString("de-DE")}
                                            />
                                        </div>
                                        <div style={{ flex: "1 1 280px", minWidth: 240 }}>
                                            <table className="sa-table">
                                                <thead>
                                                    <tr>
                                                        <th>Country</th>
                                                        <th className="sa-table__num">Events</th>
                                                        <th className="sa-table__bar" />
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {data.countries.map(c => (
                                                        <tr key={c.code}>
                                                            <td>{countryName(c.code) || c.code}</td>
                                                            <td className="sa-table__num">{c.events.toLocaleString("de-DE")}</td>
                                                            <td className="sa-table__bar">
                                                                <MiniBar value={c.events} max={maxCountry} />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="sa-panel">
                                <h3 className="sa-panel__title">Event count by device</h3>
                                {data.devices.length === 0 ? (
                                    <p className="sa-panel__sub">No device data for this period.</p>
                                ) : (
                                    <table className="sa-table">
                                        <thead>
                                            <tr>
                                                <th>Device</th>
                                                <th className="sa-table__num">Events</th>
                                                <th className="sa-table__bar" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.devices.map(d => (
                                                <tr key={d.type}>
                                                    <td>{DEVICE_LABELS[d.type] || d.type}</td>
                                                    <td className="sa-table__num">{d.events.toLocaleString("de-DE")}</td>
                                                    <td className="sa-table__bar">
                                                        <MiniBar value={d.events} max={maxDevice} color="rgba(167,139,250,0.6)" />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
