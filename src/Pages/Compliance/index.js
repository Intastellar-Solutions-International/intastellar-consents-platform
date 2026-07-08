const { useState, useEffect, useContext, useMemo } = React;
import StickyPageTitle from "../../Components/Header/Sticky";
import AuditSnapshotCard from "../../components/AuditSnapshotCard/AuditSnapshotCard.js";
import Map from "../../Components/Charts/WorldMap/WorldMap.js";
import { defaultCompareWindowForPrimary } from "../../Components/Filter/filterDatePresets.js";
import { DomainContext, WorkspaceContext } from "../../App.js";
import API from "../../API/api";
import {
    reportsPath,
    useSyncDomainFromRoute,
} from "../../Functions/domainPathSegments.js";
import Authentication from "../../Authentication/Auth";
import "../Dashboard/Style.css";
import "./Style.css";

const Link = window.ReactRouterDOM.Link;
const useParams = window.ReactRouterDOM.useParams;

const EU_EEA_COUNTRIES = new Set([
    "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic",
    "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary",
    "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta",
    "Netherlands", "Poland", "Portugal", "Romania", "Slovakia", "Slovenia",
    "Spain", "Sweden",
    // EEA non-EU
    "Iceland", "Liechtenstein", "Norway",
]);

export default function CompliancePage() {
    const { id, handle } = useParams();
    const [currentDomain, setCurrentDomain] = useContext(DomainContext);
    const [activeWorkspace] = useContext(WorkspaceContext);
    const [demoMode, setDemoMode] = useState(Authentication.DemoMode);

    useSyncDomainFromRoute(handle, setCurrentDomain);

    const workspaceId = activeWorkspace?.id ?? null;

    const initialLastDays = localStorage.getItem("settings") != null
        ? JSON.parse(localStorage.getItem("settings")).dateRange
        : 30;
    const [getLastDays, setLastDays] = useState(initialLastDays);
    const today = new Date();
    const [fromDate, setFromDate] = useState(
        new Date(new Date().setDate(today.getDate() - initialLastDays))
    );
    const [toDate, setToDate] = useState(
        new Date(new Date().setDate(today.getDate() - 1))
    );
    const [compareRange, setCompareRange] = useState(0);
    const [previousPeriod, setPreviousPeriod] = useState(() =>
        defaultCompareWindowForPrimary(
            new Date(new Date().setDate(new Date().getDate() - initialLastDays)),
            new Date(new Date().setDate(new Date().getDate() - 1))
        ).start
    );
    const [previousPeriod2, setPreviousPeriod2] = useState(() =>
        defaultCompareWindowForPrimary(
            new Date(new Date().setDate(new Date().getDate() - initialLastDays)),
            new Date(new Date().setDate(new Date().getDate() - 1))
        ).end
    );
    const [, setActiveDataDummy] = useState(null);

    const [activeData, setActiveData] = useState(null);
    const [activeDataCountry, setActiveDataCountry] = useState(null);
    const [observedCookies, setObservedCookies] = useState(null);
    const [loading, setLoading] = useState(false);

    const domainsForApi = useMemo(
        () => (handle ? handle : currentDomain) || "combined view",
        [handle, currentDomain]
    );

    const transferStats = useMemo(() => {
        const countries = activeDataCountry?.data?.Countries;
        if (!countries?.length) return null;
        let euTotal = 0;
        let nonEuTotal = 0;
        const nonEuMap = [];
        for (const c of countries) {
            if (c.country === "Unknown") continue;
            const count = c.num?.total ?? 0;
            if (EU_EEA_COUNTRIES.has(c.country)) {
                euTotal += count;
            } else {
                nonEuTotal += count;
                nonEuMap.push({ name: c.country, count });
            }
        }
        const total = euTotal + nonEuTotal;
        const euPct = total > 0 ? Math.round((euTotal / total) * 100) : 0;
        const topNonEu = nonEuMap.sort((a, b) => b.count - a.count).slice(0, 6);
        return { euTotal, nonEuTotal, euPct, nonEuPct: 100 - euPct, topNonEu, total };
    }, [activeDataCountry]);

    useEffect(() => {
        const unsubscribe = Authentication.onDemoModeChange(setDemoMode);
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!id || !API[id]) return;
        setLoading(true);

        const fd = fromDate.toISOString().split("T")[0];
        const td = toDate.toISOString().split("T")[0];
        const pp = previousPeriod.toISOString().split("T")[0];
        const pp2 = previousPeriod2.toISOString().split("T")[0];
        const cr = compareRange === 0 || compareRange == null ? "" : String(compareRange);
        const sharedHeaders = {
            Domains: domainsForApi,
            FromDate: fd,
            ToDate: td,
            CompareRange: compareRange,
            PreviousPeriod: pp,
            PreviousPeriod2: pp2,
            "X-Compare-Start": pp,
            "X-Compare-End": pp2,
            "X-Compare-Range": cr,
        };

        fetch(API[id].getInteractions.url, {
            method: API[id].getInteractions.method,
            headers: { ...API[id].getInteractions.headers, ...sharedHeaders },
            body: JSON.stringify({ workspaceId }),
        })
            .then((r) => r.json())
            .then((data) => {
                if (data === "Err_Login_Expired") {
                    localStorage.removeItem("globals");
                    window.location.href = "/login";
                    return;
                }
                setActiveData(data);
            })
            .catch(console.error)
            .finally(() => setLoading(false));

        fetch(API[id].getInteractionsByCountry.url, {
            method: API[id].getInteractionsByCountry.method,
            headers: { ...API[id].getInteractionsByCountry.headers, ...sharedHeaders },
            body: JSON.stringify({ workspaceId }),
        })
            .then((r) => r.json())
            .then((data) => {
                if (data === "Err_Login_Expired") {
                    localStorage.removeItem("globals");
                    window.location.href = "/login";
                    return;
                }
                setActiveDataCountry(data);
            })
            .catch(console.error);

        fetch(API[id].observedCookies.url, {
            method: API[id].observedCookies.method,
            headers: { ...API[id].observedCookies.headers, ...sharedHeaders },
            body: JSON.stringify({ workspaceId }),
        })
            .then((r) => r.json())
            .then((data) => {
                if (data === "Err_Login_Expired") {
                    localStorage.removeItem("globals");
                    window.location.href = "/login";
                    return;
                }
                setObservedCookies(data);
            })
            .catch(console.error);
    }, [id, domainsForApi, fromDate, toDate, compareRange, previousPeriod, previousPeriod2, workspaceId]);

    if (!id || !API[id]) return null;

    const preCount = observedCookies?.preConsent?.count;
    const postCount = observedCookies?.consent?.count;
    const auditLogPath = reportsPath(id, currentDomain, "/user-consents");

    return (
        <>
            <StickyPageTitle
                loadingUpdated={loading}
                finalLoaded={loading}
                title={handle ? `Compliance: ${handle}` : "Compliance overview"}
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                setActiveData={setActiveDataDummy}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
                previousPeriod={previousPeriod}
                previousPeriod2={previousPeriod2}
                compareRange={compareRange}
                setCompareRange={setCompareRange}
                setCompareWindowStart={setPreviousPeriod}
                setCompareWindowEnd={setPreviousPeriod2}
                demoMode={demoMode}
            />

            {/* ── Hero map — full-width, outside dashboard-content padding ── */}
            <div className="compliance-hero">
                <Map
                    demoMode={demoMode}
                    data={{
                        Countries: activeDataCountry?.data?.Countries,
                        total: activeData?.Total,
                    }}
                />
                {/* Cookie scan strip overlaid at the bottom of the hero */}
                {observedCookies && (
                    <div className="compliance-hero__stats">
                        <div className="compliance-hero__stat">
                            <span className="compliance-hero__stat-value">
                                {preCount > 0 ? preCount.toLocaleString("de-DE") : "—"}
                            </span>
                            <span className="compliance-hero__stat-label">Pre-consent cookies</span>
                        </div>
                        <div className="compliance-hero__stat-divider" aria-hidden />
                        <div className="compliance-hero__stat">
                            <span className="compliance-hero__stat-value">
                                {postCount > 0 ? postCount.toLocaleString("de-DE") : "—"}
                            </span>
                            <span className="compliance-hero__stat-label">Post-consent cookies</span>
                        </div>
                        <div className="compliance-hero__stat-divider" aria-hidden />
                        <div className="compliance-hero__stat">
                            <span className="compliance-hero__stat-value">
                                {activeData?.Total != null ? Number(activeData.Total).toLocaleString("de-DE") : "—"}
                            </span>
                            <span className="compliance-hero__stat-label">Consent interactions</span>
                        </div>
                        <Link to={auditLogPath} className="compliance-hero__audit-btn">
                            Open audit log
                        </Link>
                    </div>
                )}
            </div>

            {/* ── Content ── */}
            <div className="dashboard-content compliance-page">

                {/* ── Data transfer section ── */}
                {transferStats && (
                    <div className="dashboard-section compliance-transfers">
                        <h2 className="dashboard-section-label">Data transfers</h2>
                        <div className="compliance-transfers__card">
                            <div className="compliance-transfers__cols">
                                <div className="compliance-transfers__col compliance-transfers__col--eu">
                                    <span className="compliance-transfers__pct">{transferStats.euPct}%</span>
                                    <span className="compliance-transfers__count">
                                        {transferStats.euTotal.toLocaleString("de-DE")} interactions
                                    </span>
                                    <span className="compliance-transfers__region">EU / EEA</span>
                                    <span className="compliance-transfers__note">
                                        Within the European Economic Area — processed under GDPR
                                    </span>
                                </div>
                                <div className="compliance-transfers__col compliance-transfers__col--third">
                                    <span className="compliance-transfers__pct">{transferStats.nonEuPct}%</span>
                                    <span className="compliance-transfers__count">
                                        {transferStats.nonEuTotal.toLocaleString("de-DE")} interactions
                                    </span>
                                    <span className="compliance-transfers__region">Third countries</span>
                                    <span className="compliance-transfers__note">
                                        Outside EEA — may require SCCs or adequacy decision
                                    </span>
                                </div>
                            </div>

                            {/* Split bar */}
                            <div className="compliance-transfers__bar-track" aria-hidden>
                                <div
                                    className="compliance-transfers__bar-eu"
                                    style={{ width: `${transferStats.euPct}%` }}
                                />
                                <div
                                    className="compliance-transfers__bar-third"
                                    style={{ width: `${transferStats.nonEuPct}%` }}
                                />
                            </div>

                            {/* Top third-country origins */}
                            {transferStats.topNonEu.length > 0 && (
                                <div className="compliance-transfers__origins">
                                    <span className="compliance-transfers__origins-label">
                                        Top third-country origins
                                    </span>
                                    <div className="compliance-transfers__origin-tags">
                                        {transferStats.topNonEu.map((c) => (
                                            <span key={c.name} className="compliance-transfers__tag">
                                                {c.name}
                                                <span className="compliance-transfers__tag-count">
                                                    {c.count.toLocaleString("de-DE")}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Audit card ── */}
                <div className="compliance-page__audit">
                    <AuditSnapshotCard
                        platformId={id}
                        handle={handle}
                        currentDomain={currentDomain}
                        fromDate={fromDate}
                        toDate={toDate}
                        activeData={activeData}
                        demoMode={demoMode}
                        interactionsLoading={loading}
                        observedCookies={observedCookies}
                    />
                </div>
            </div>
        </>
    );
}
