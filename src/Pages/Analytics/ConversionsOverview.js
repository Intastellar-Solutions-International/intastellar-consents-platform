const { useState, useContext, useMemo } = React;
const useParams = window.ReactRouterDOM.useParams;
import { DomainContext } from "../../App.js";
import { useSyncDomainFromRoute, isCombinedOrClearDomain } from "../../Functions/domainPathSegments.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { useAnalyticsReport, toIsoDate, KpiCard } from "./_shared.js";
import { IconTarget, IconTrendingUp, IconGlobe } from "./Icons.js";
import AnalyticsWorldMap from "./AnalyticsWorldMap.js";
import ConversionsPanel from "./Conversions.js";
import TimeToConvert from "./TimeToConvert.js";
import ConversionChannels from "./ConversionChannels.js";
import ConversionCampaigns from "./ConversionCampaigns.js";
import ConversionFunnel from "./ConversionFunnel.js";
import Line from "../../Components/Charts/Line";
import "./Analytics.css";

// Countries with fewer total events than this are excluded from the rate
// view — otherwise a country with 1 visit + 1 conversion reads as a
// misleading 100% and can crowd out countries with a real sample size.
const MAP_RATE_MIN_SAMPLE = 5;

const SECTIONS = [
    { key: "overview", label: "Overview" },
    { key: "deepdive", label: "Funnel & Sources" },
    { key: "setup",    label: "Events & Tracking" },
];

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

    const [section, setSection] = useState("overview");

    const totalConversions = useMemo(
        () => (data?.conversions || []).reduce((s, c) => s + (c.count || 0), 0),
        [data]
    );

    const linkedConversions = useMemo(
        () => (data?.conversions || []).reduce((s, c) => s + (c.linkedCount || 0), 0),
        [data]
    );

    const trendData = useMemo(
        () => (data?.dailyConversions || []).map(d => ({ date: d.date, num: d.count })),
        [data]
    );

    const [mapMode, setMapMode] = useState("rate");

    const rateCountries = useMemo(() => {
        const totalByCode = new Map((data?.countries || []).map(c => [c.code, c.events]));
        const convByCode  = new Map((data?.conversionCountries || []).map(c => [c.code, c.events]));
        const out = [];
        totalByCode.forEach((total, code) => {
            if (total < MAP_RATE_MIN_SAMPLE) return;
            const conv = convByCode.get(code) || 0;
            out.push({ code, events: Math.round((conv / total) * 1000) / 10 });
        });
        return out;
    }, [data]);

    const mapCountries = mapMode === "rate" ? rateCountries : data?.conversionCountries;

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
                        <div className="sa-conv-layout">
                            <nav className="sa-conv-submenu" aria-label="Conversions view">
                                <ul className="sa-conv-submenu__list">
                                    {SECTIONS.map(s => (
                                        <li key={s.key} className="sa-conv-submenu__item">
                                            <button
                                                type="button"
                                                className={"sa-conv-submenu__link" + (section === s.key ? " --active" : "")}
                                                onClick={() => setSection(s.key)}
                                            >
                                                {s.label}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </nav>

                            <div className="sa-conv-submenu-content">
                            {section === "overview" && (
                                <div className="sa-conv-grid sa-conv-grid--overview">
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

                                    <div className="sa-panel sa-conv-trend">
                                        <h3 className="sa-panel__title"><IconTrendingUp className="sa-icon" /> Conversion trend</h3>
                                        <Line
                                            data={trendData}
                                            title="Conversions"
                                            fromDate={fromIso}
                                            toDate={toIso}
                                            showInsights
                                            height={260}
                                        />
                                    </div>

                                    <div className="sa-panel sa-conv-map">
                                        <h3 className="sa-panel__title">
                                            <IconGlobe className="sa-icon" /> Where conversions happen
                                            <span className="sa-map__mode-toggle" role="group" aria-label="Map weighting">
                                                <button
                                                    type="button"
                                                    className={mapMode === "rate" ? "is-active" : ""}
                                                    onClick={() => setMapMode("rate")}
                                                >
                                                    Rate
                                                </button>
                                                <button
                                                    type="button"
                                                    className={mapMode === "volume" ? "is-active" : ""}
                                                    onClick={() => setMapMode("volume")}
                                                >
                                                    Volume
                                                </button>
                                            </span>
                                        </h3>
                                        <AnalyticsWorldMap
                                            countries={mapCountries}
                                            metricLabel={mapMode === "rate" ? "Conversion rate" : "Conversions"}
                                            formatValue={mapMode === "rate" ? (v => v.toFixed(1) + "%") : undefined}
                                        />
                                    </div>
                                </div>
                            )}

                            {section === "deepdive" && (
                                <div className="sa-conv-grid sa-conv-grid--deepdive">
                                    <TimeToConvert
                                        timeToConvert={data.timeToConvert}
                                        totalConversions={totalConversions}
                                    />

                                    <ConversionChannels
                                        byChannel={data.conversionsByChannel}
                                        byDevice={data.conversionsByDevice}
                                    />

                                    <ConversionFunnel
                                        domain={domain}
                                        funnel={data.funnel}
                                        totalConversions={totalConversions}
                                        linkedConversions={linkedConversions}
                                    />

                                    <ConversionCampaigns
                                        domain={domain}
                                        fromIso={fromIso}
                                        toIso={toIso}
                                        byCampaign={data.conversionsByCampaign}
                                    />
                                </div>
                            )}

                            {section === "setup" && (
                                <ConversionsPanel
                                    domain={domain}
                                    conversions={data.conversions}
                                    onDefsChanged={() => setTick(t => t + 1)}
                                />
                            )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
