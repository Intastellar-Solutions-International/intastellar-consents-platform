const { useState, useContext, useMemo } = React;
const useParams = window.ReactRouterDOM.useParams;
import { DomainContext } from "../../App.js";
import { useSyncDomainFromRoute, isCombinedOrClearDomain } from "../../Functions/domainPathSegments.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { useAnalyticsReport, toIsoDate, KpiCard, ConsentBar, AnalyticsSubNav } from "./_shared.js";
import { IconShieldCheck, IconBarChart } from "./Icons.js";
import "./Analytics.css";

export default function AnalyticsConsent() {
    document.title = "Consent | Site Analytics";

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

    const showData = !loading && data && !data.noSiteKey && !data.noData;

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Consent"
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
                        <p className="sa-notice">Select a domain in the header to view consent data.</p>
                    )}
                    {domain && loading && <p className="sa-notice">Loading&hellip;</p>}
                    {domain && error && <p className="sa-notice sa-notice--error">{error}</p>}
                    {domain && !loading && data?.noSiteKey && (
                        <p className="sa-notice">No analytics set up for this domain yet.</p>
                    )}
                    {domain && !loading && data?.noData && (
                        <p className="sa-notice">No data for the selected period.</p>
                    )}

                    {showData && (() => {
                        const { stat, func, adv } = data.consent;
                        const total = data.totals.total;
                        const statRate = stat.yes + stat.no > 0
                            ? Math.round((stat.yes / (stat.yes + stat.no)) * 100)
                            : 0;
                        const funcRate = func.yes + func.no > 0
                            ? Math.round((func.yes / (func.yes + func.no)) * 100)
                            : 0;
                        const advRate = adv.yes + adv.no > 0
                            ? Math.round((adv.yes / (adv.yes + adv.no)) * 100)
                            : 0;
                        return (
                            <div className="sa-consent-page-grid">

                                <KpiCard className="sa-cg-kpi1"
                                    icon={<IconShieldCheck />}
                                    label="Statistics consent"
                                    value={statRate + "%"}
                                    sub={`${stat.yes.toLocaleString("de-DE")} yes · ${stat.no.toLocaleString("de-DE")} no`}
                                    variant={statRate < 20 ? "warn" : null}
                                />
                                <KpiCard className="sa-cg-kpi2"
                                    icon={<IconShieldCheck />}
                                    label="Functional consent"
                                    value={funcRate + "%"}
                                    sub={`${func.yes.toLocaleString("de-DE")} yes · ${func.no.toLocaleString("de-DE")} no`}
                                    variant={funcRate < 20 ? "warn" : null}
                                />
                                <KpiCard className="sa-cg-kpi3"
                                    icon={<IconShieldCheck />}
                                    label="Advertising consent"
                                    value={advRate + "%"}
                                    sub={`${adv.yes.toLocaleString("de-DE")} yes · ${adv.no.toLocaleString("de-DE")} no`}
                                    variant={advRate < 20 ? "warn" : null}
                                />
                                <KpiCard className="sa-cg-kpi4"
                                    icon={<IconBarChart />}
                                    label="Total events"
                                    value={total.toLocaleString("de-DE")}
                                    sub={`${data.totals.minimal.toLocaleString("de-DE")} minimal · ${data.totals.full.toLocaleString("de-DE")} full`}
                                />

                                <div className="sa-panel sa-cg-bars">
                                    <h3 className="sa-panel__title"><IconShieldCheck className="sa-icon" /> Consent rates</h3>
                                    <div className="sa-consent-list">
                                        <ConsentBar label="Statistics"  yes={stat.yes} no={stat.no} />
                                        <ConsentBar label="Functional"  yes={func.yes} no={func.no} />
                                        <ConsentBar label="Advertising" yes={adv.yes}  no={adv.no}  />
                                    </div>

                                    <div className="sa-panel__divider" />

                                    <h3 className="sa-panel__sub-title">Event breakdown</h3>
                                    <div className="sa-consent-list">
                                        <div className="sa-consent-row">
                                            <span className="sa-consent-row__label">With consent</span>
                                            <div className="sa-bar">
                                                <div className="sa-bar__seg"
                                                    style={{
                                                        width: total > 0 ? Math.round((data.totals.full / total) * 100) + "%" : "0%",
                                                        background: "rgba(74,222,128,0.75)",
                                                    }}
                                                    title={`Full: ${data.totals.full}`}
                                                />
                                            </div>
                                            <span className="sa-consent-row__pct">
                                                {total > 0 ? Math.round((data.totals.full / total) * 100) : 0}%
                                            </span>
                                        </div>
                                        <div className="sa-consent-row">
                                            <span className="sa-consent-row__label">Minimal only</span>
                                            <div className="sa-bar">
                                                <div className="sa-bar__seg"
                                                    style={{
                                                        width: total > 0 ? Math.round((data.totals.minimal / total) * 100) + "%" : "0%",
                                                        background: "rgba(192,159,83,0.55)",
                                                    }}
                                                    title={`Minimal: ${data.totals.minimal}`}
                                                />
                                            </div>
                                            <span className="sa-consent-row__pct">
                                                {total > 0 ? Math.round((data.totals.minimal / total) * 100) : 0}%
                                            </span>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
}
