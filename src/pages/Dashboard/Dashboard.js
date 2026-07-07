import useFetch from "../../Functions/FetchHook";
import API from "../../API/api";
import { Loading, LoadingBar } from "../../Components/widget/Loading";

import "./Style.css";
import Map from "../../Components/Charts/WorldMap/WorldMap.js";
import { DomainContext, OrganisationContext, WorkspaceContext } from "../../App.js";
import {
    reportsPath,
    consentsDomainFromRoute,
    toDomainsApiHeader,
} from "../../Functions/domainPathSegments.js";
import {
    isDomainVerified,
    isVerificationExpired,
    getOrCreateVerificationRecord,
} from "../../Functions/domainVerification.js";
import { isJson } from "../../Functions/isJson.js";
import Crawler from "../../Components/Crawler";
import Line from "../../Components/Charts/Line"
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { defaultCompareWindowForPrimary } from "../../Components/Filter/filterDatePresets.js";
import { LiveView } from "../../components/LiveView/index.js";
import AuditSnapshotCard from "../../components/AuditSnapshotCard/AuditSnapshotCard.js";
import { PremiumTier, BasicTier, ProTier } from "../../Components/tiers/index.js";
import Pie from "../../Components/Charts/Pie/index.js";
import Widget from "../../Components/widget/widget.js";
import ErrorBoundary from "../../Components/Error/ErrorBoundary.js";
import Authentication from "../../Authentication/Auth";
import Select from "../../Components/SelectInput/Selector.js";
import punycode from "punycode";

const { useState, useEffect, useRef, useContext, useMemo, useCallback } = React;
const useParams = window.ReactRouterDOM.useParams;
const Link = window.ReactRouterDOM.Link;

export default function Dashboard(props) {
    document.title = "Home | Intastellar Consents | CMP";
    const [currentDomain, setCurrentDomain] = useContext(DomainContext);
    const [organisation, setOrganisation] = useContext(OrganisationContext);
    const [activeWorkspace] = useContext(WorkspaceContext);
    const subscriptionStatus = JSON.parse(localStorage.getItem("subscription"));
    const userProfile = JSON.parse(localStorage.getItem("globals")).user.avatar;

    const [demoMode, setDemoMode] = useState(Authentication.DemoMode);
    const [timeToDecision, setTimeToDecision] = useState("global");

    const { handle, id } = useParams();

    useEffect(() => {
        if (handle == null || handle === undefined) {
            setCurrentDomain("combined view");
            return;
        }
        if (handle === "combined view") {
            setCurrentDomain("combined view");
        } else {
            const decoded = decodeURIComponent(String(handle).replace(/%2E/gi, "."));
            setCurrentDomain(punycode.toUnicode(decoded));
        }
    }, [handle, id, setCurrentDomain]);

    const [activeData, setActiveData] = useState(null);
    const [activeDataCountry, setactiveDataCountry] = useState(null);
    const initialLastDays =
        localStorage.getItem("settings") != null ? JSON.parse(localStorage.getItem("settings")).dateRange : 30;
    const [getLastDays, setLastDays] = useState(initialLastDays);
    const today = new Date();
    const [fromDate, setFromDate] = useState(new Date(new Date().setDate(today.getDate() - initialLastDays)));
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)));
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
    const [observedCookies, setObservedCookies] = useState(null);

    const [loading, setLoading] = useState(false);
    const [loadingCountry, setLoadingCountry] = useState(false);

    const dashboardView = props.dashboardView;
    let url = API[id].getInteractions.url;
    let method = API[id].getInteractions.method;
    let header = API[id].getInteractions.headers;

    const workspaceId = activeWorkspace?.id ?? null;

    // Always pass the user-selected domain (or "combined view") as-is.
    // When a workspace is active, workspaceId is sent in the request body and
    // the backend resolves which domains belong to that workspace itself.
    const domainsForApi = useMemo(() => {
        return (handle ? handle : currentDomain) || "combined view";
    }, [handle, currentDomain]);
    API[id].getInteractions.headers.Domains = domainsForApi;
    API[id].getInteractionsByCountry.headers.Domains = domainsForApi;
    API[id].getInteractions.headers.FromDate = fromDate.toISOString().split("T")[0];
    API[id].getInteractions.headers.ToDate = toDate.toISOString().split("T")[0];

    API[id].getInteractionsByCountry.headers.FromDate = fromDate.toISOString().split("T")[0];
    API[id].getInteractionsByCountry.headers.ToDate = toDate.toISOString().split("T")[0];

    API[id].getInteractions.headers.CompareRange = compareRange;
    API[id].getInteractions.headers.PreviousPeriod = previousPeriod.toISOString().split("T")[0];
    API[id].getInteractions.headers.PreviousPeriod2 = previousPeriod2.toISOString().split("T")[0];
    API[id].getInteractions.headers["X-Compare-Start"] = previousPeriod.toISOString().split("T")[0];
    API[id].getInteractions.headers["X-Compare-End"] = previousPeriod2.toISOString().split("T")[0];
    API[id].getInteractions.headers["X-Compare-Range"] =
        compareRange === 0 || compareRange == null ? "" : String(compareRange);

    const APIUrl = API[id].getTotalNumber.url;
    const APIMethod = API[id].getTotalNumber.method;
    const APIHeader = API[id].getTotalNumber.headers;

    const StyleAPIUrl = API[id].getStyle.url;
    const StyleAPIMethod = API[id].getStyle.method;
    const StyleAPIHeader = API[id].getStyle.headers;

    const [styleLoading, styleData, styleError, styleUpdated] = useFetch(30, StyleAPIUrl, StyleAPIMethod, StyleAPIHeader);
    const [jsLoading, jsData, error, updated] = useFetch(30, APIUrl, APIMethod, APIHeader);

    const hasTimeToDecision =
        activeData != null &&
        activeData.timeToDecision != null &&
        typeof activeData.timeToDecision === "object";
    const timeToDecisionSlice = useMemo(() => {
        const root = activeData?.timeToDecision;
        if (root == null || typeof root !== "object") return null;
        const slice = root[timeToDecision];
        if (slice == null || typeof slice !== "object") return null;
        return slice;
    }, [activeData, timeToDecision]);

    const [liveViewData, setLiveViewData] = useState(null);
    const onLiveDataChange = useCallback((data) => {
        setLiveViewData(data);
    }, []);

    // Domain verification status check
    const verificationStatus = useMemo(() => {
        // Get organisation ID
        let orgId = null;
        try {
            const orgRaw = localStorage.getItem("organisation");
            if (orgRaw) {
                const org = JSON.parse(orgRaw);
                orgId = org?.id;
            }
        } catch {
            /* ignore */
        }

        // Determine which domain to check
        const domainToCheck = handle || currentDomain;

        // Skip for combined view or if no domain/org
        if (!orgId || !domainToCheck || domainToCheck === "combined view") {
            return { show: false };
        }

        const verified = isDomainVerified(domainToCheck, orgId);
        const expired = isVerificationExpired(domainToCheck, orgId);

        if (verified) {
            return { show: false };
        }

        return {
            show: true,
            domain: domainToCheck,
            orgId,
            isExpired: expired,
        };
    }, [handle, currentDomain]);

    useEffect(() => {
        const unsubscribe = Authentication.onDemoModeChange(setDemoMode);
        return unsubscribe; // Clean up on unmount
    }, []);

    useEffect(() => {

        function handleScrollEvent() {
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
                /* console.log("you're at the bottom of the page"); */
                // here add more items in the 'filteredData' state from the 'allData' state source.
            }

        }

        window.addEventListener('scroll', handleScrollEvent)

        return () => {
            window.removeEventListener('scroll', handleScrollEvent);
        }
    }, [])

    useEffect(() => {
        setLoading(true);
        setLoadingCountry(true);

        fetch(API[id].getInteractions.url, {
            method: API[id].getInteractions.method,
            headers: API[id].getInteractions.headers,
            body: JSON.stringify({ workspaceId }),
        }).then((res) => res.json()).then((data) => {
            if (data === "Err_Login_Expired") {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            setActiveData(data);
        }
        ).catch((err) => {
            console.error(err);
        }).finally(() => {
            setLoading(false);
        });

        API[id].observedCookies.headers.Domains = domainsForApi;
        API[id].observedCookies.headers.FromDate = fromDate.toISOString().split("T")[0];
        API[id].observedCookies.headers.ToDate = toDate.toISOString().split("T")[0];
        API[id].observedCookies.headers.CompareRange = compareRange;
        API[id].observedCookies.headers.PreviousPeriod = previousPeriod.toISOString().split("T")[0];
        API[id].observedCookies.headers.PreviousPeriod2 = previousPeriod2.toISOString().split("T")[0];
        API[id].observedCookies.headers["X-Compare-Start"] = previousPeriod.toISOString().split("T")[0];
        API[id].observedCookies.headers["X-Compare-End"] = previousPeriod2.toISOString().split("T")[0];
        API[id].observedCookies.headers["X-Compare-Range"] =
            compareRange === 0 || compareRange == null ? "" : String(compareRange);

        API[id].getInteractionsByCountry.headers.CompareRange = compareRange;
        API[id].getInteractionsByCountry.headers.PreviousPeriod = previousPeriod.toISOString().split("T")[0];
        API[id].getInteractionsByCountry.headers.PreviousPeriod2 = previousPeriod2.toISOString().split("T")[0];
        API[id].getInteractionsByCountry.headers["X-Compare-Start"] = previousPeriod.toISOString().split("T")[0];
        API[id].getInteractionsByCountry.headers["X-Compare-End"] = previousPeriod2.toISOString().split("T")[0];
        API[id].getInteractionsByCountry.headers["X-Compare-Range"] =
            compareRange === 0 || compareRange == null ? "" : String(compareRange);

        fetch(API[id].observedCookies.url, {
            method: API[id].observedCookies.method,
            headers: API[id].observedCookies.headers,
            body: JSON.stringify({ workspaceId }),
        }).then((res) => res.json()).then((cookiesData) => {
            if (cookiesData === "Err_Login_Expired") {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            setObservedCookies(cookiesData);
        }).catch((err) => {
            console.error(err);
        });

        fetch(API[id].getInteractionsByCountry.url, {
            method: API[id].getInteractionsByCountry.method,
            headers: API[id].getInteractionsByCountry.headers,
            body: JSON.stringify({ workspaceId }),
        }).then((res) => res.json()).then((country) => {
            if (country === "Err_Login_Expired") {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            setactiveDataCountry(country);
        }
        ).catch((err) => {
            console.error(err);
        }).finally(() => {
            setLoadingCountry(false);
        });

    }, [fromDate, toDate, handle, currentDomain, compareRange, previousPeriod, previousPeriod2, workspaceId]);

    document.querySelectorAll(".intInput").forEach((input) => {
        input.setAttribute("max", new Date().toISOString().split("T")[0]);
    })

    const compareOn = compareRange !== 0 && compareRange != null;

    return (
        <>
            <StickyPageTitle demoMode={demoMode} loadingUpdated={loading} finalLoaded={loadingCountry} title={handle ? `Dashboard: ${punycode.toUnicode(handle)}` : "Dashboard"} url={url} method={method} header={header} numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setActiveData} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} previousPeriod={previousPeriod} previousPeriod2={previousPeriod2} compareRange={compareRange} setCompareRange={setCompareRange} setCompareWindowStart={setPreviousPeriod} setCompareWindowEnd={setPreviousPeriod2} />
            <div className="dashboard-content">
                {/* Workspace banner */}
                {activeWorkspace && (
                    <div className="dashboard-workspace-banner">
                        <div className="dashboard-workspace-banner__left">
                            <span className="dashboard-workspace-banner__kicker">Workspace</span>
                            <span className="dashboard-workspace-banner__name">{activeWorkspace.name}</span>
                        </div>
                        {activeWorkspace.domains?.length > 0 && (
                            <div className="dashboard-workspace-banner__domains">
                                {activeWorkspace.domains.slice(0, 3).map((d) => (
                                    <span key={d.domain} className="dashboard-workspace-banner__domain-tag">
                                        {d.domain}
                                    </span>
                                ))}
                                {activeWorkspace.domains.length > 3 && (
                                    <span className="dashboard-workspace-banner__domain-tag dashboard-workspace-banner__domain-tag--more">
                                        +{activeWorkspace.domains.length - 3}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}
                {/* Domain Verification Warning Banner */}
                {verificationStatus.show && (
                    <div className={`dashboard-verification-warning ${verificationStatus.isExpired ? 'dashboard-verification-warning--expired' : ''}`}>
                        <span className="dashboard-verification-warning__icon">
                            {verificationStatus.isExpired ? "!" : "?"}
                        </span>
                        <div className="dashboard-verification-warning__content">
                            <strong>
                                {verificationStatus.isExpired
                                    ? "Domain verification expired"
                                    : "Domain not verified"}
                            </strong>
                            <p>
                                {verificationStatus.isExpired
                                    ? `The verification for ${verificationStatus.domain} has expired. Please re-verify to continue accessing consent data.`
                                    : `${verificationStatus.domain} has not been verified. Verify domain ownership to ensure data accuracy.`}
                            </p>
                        </div>
                        <Link
                            to="/settings/workspaces"
                            className="dashboard-verification-warning__action"
                        >
                            {verificationStatus.isExpired ? "Re-verify" : "Verify Domain"}
                        </Link>
                    </div>
                )}
                {/* <div className="profilePicture-container">
                    <img src={userProfile} className="profilePicture" />
                    <p className="profile-user">Welcome, {JSON.parse(localStorage.getItem("globals")).user.name.firstName}</p>
                    <p>This dashboard shows aggregated consent interactions for the selected period. <br />
                        Use it to monitor acceptance rates and category-level consent behavior.</p>

                </div> */}
                {/* Org-level platform stats (admin only) */}
                {organisation != null && JSON.parse(organisation).id == 1 && !demoMode && !handle && !workspaceId ?
                    <div className="grid-container topWidget" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "24px" }}>
                        {jsLoading ? <Loading /> : <ErrorBoundary><Widget styleType="small" totalNumber={jsData.Total?.toLocaleString("de-DE")} type="Websites" /></ErrorBoundary>}
                        {jsLoading ? <Loading /> : <ErrorBoundary><Widget styleType="small" totalNumber={jsData?.JS?.toLocaleString("de-DE") + "%"} type="JavaScript" /></ErrorBoundary>}
                        {jsLoading ? <Loading /> : <ErrorBoundary><Widget styleType="small" totalNumber={jsData?.WP?.toLocaleString("de-DE") + "%"} type="WordPress" /></ErrorBoundary>}
                    </div> : null
                }

                {/* ── 1. Primary consent KPIs ── */}
                {activeData != null ? (
                    <>
                        <div className="dashboard-hero-kpis">
                            <Widget
                                kpi={true}
                                styleType="small"
                                compareOn={compareOn}
                                comparisonDelta={activeData?.comaprison?.accepted ?? activeData?.comparison?.accepted}
                                comparisonRelative={activeData?.comaprison?.acceptedRelativeDrop ?? activeData?.comparison?.acceptedRelativeDrop}
                                change={{ change: activeData?.changeRate?.accepted }}
                                relativeDrop={{ relativeDrop: activeData?.relativeDrop?.accepted }}
                                totalNumber={(activeData?.Accepted != null ? activeData.Accepted.toLocaleString("de-DE") : "—") + "%"}
                                type="Consent acceptance"
                                fromDate={fromDate}
                                toDate={toDate}
                            />
                            <Widget
                                kpi={true}
                                styleType="small"
                                compareOn={compareOn}
                                comparisonDelta={activeData?.comaprison?.declined ?? activeData?.comparison?.declined}
                                comparisonRelative={activeData?.comaprison?.declinedRelativeDrop ?? activeData?.comparison?.declinedRelativeDrop}
                                change={{ change: activeData?.changeRate?.declined }}
                                relativeDrop={{ relativeDrop: activeData?.relativeDrop?.declined }}
                                explainer={{ exist: true, title: "Essential-only rate", content: "Share of users who declined analytics and marketing cookies, allowing only required cookies." }}
                                totalNumber={(activeData?.Declined != null ? activeData.Declined.toLocaleString("de-DE") : "—") + "%"}
                                type="Essential-only rate"
                                fromDate={fromDate}
                                toDate={toDate}
                            />
                        </div>

                    </>
                ) : (
                    <div className="dashboard-hero-kpis dashboard-hero-kpis--loading">
                        <Loading small={true} /><Loading small={true} />
                    </div>
                )}

                {/* ── 2. Geography & live (with EU/Non-EU context below) ── */}
                <div className="dashboard-section">
                    <div className="grid-container grid-2" style={{ gridTemplateColumns: "1fr .5fr", gap: "20px" }}>
                        {loadingCountry ? <Loading /> : <Map demoMode={demoMode} data={{ Countries: activeDataCountry?.data?.Countries, total: activeData?.Total }} />}
                        <div className="widget no-padding">
                            <LiveView currentDomain={handle ? handle : currentDomain} demoMode={demoMode} onLiveDataChange={onLiveDataChange} />
                        </div>
                    </div>
                    {activeData && (
                        <div className="dashboard-geo-stats">
                            <div className="dashboard-geo-stat">
                                <span className="dashboard-geo-stat__value">{activeData.euUsers != null ? activeData.euUsers.toLocaleString("de-DE") : "—"}</span>
                                <span className="dashboard-geo-stat__label">EU visitors</span>
                                {activeData.euAcceptedRate != null && <span className="dashboard-geo-stat__rate">{activeData.euAcceptedRate.toLocaleString("de-DE")}% accepted</span>}
                            </div>
                            <div className="dashboard-geo-stat__divider" aria-hidden />
                            <div className="dashboard-geo-stat">
                                <span className="dashboard-geo-stat__value">{activeData.noneEUUsers != null ? activeData.noneEUUsers.toLocaleString("de-DE") : "—"}</span>
                                <span className="dashboard-geo-stat__label">Non-EU visitors</span>
                                {activeData.noneEUAcceptedRate != null && <span className="dashboard-geo-stat__rate">{activeData.noneEUAcceptedRate.toLocaleString("de-DE")}% accepted</span>}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── 4. Decision behaviour ── */}
                {hasTimeToDecision && (
                    <div className="dashboard-section">
                        <h2 className="dashboard-section-label">Decision behaviour</h2>
                        <Select
                            type="timeToDecision"
                            items={["global", "eu", "noneEU"]}
                            labels={["Global", "EU", "Non-EU"]}
                            defaultValue={timeToDecision}
                            onChange={(e) => setTimeToDecision(e)}
                        />
                        {timeToDecisionSlice ? (
                            <>
                                <p style={{ margin: "12px 0 16px", fontSize: "0.8rem", color: "#666" }}>n = {timeToDecisionSlice.count.toLocaleString("de-DE")}</p>
                                <div className="grid-container topWidget grid-7">
                                    <Widget styleType="small" totalNumber={timeToDecisionSlice.median == 0 ? "N/A" : timeToDecisionSlice.median.toLocaleString("de-DE") + "s"} explainer={{ exist: true, title: "Median time to decision", content: "Median time taken by users to decide on consent." }} type="Median time to decision" fromDate={fromDate} toDate={toDate} details={{ avg: timeToDecisionSlice.avg.toLocaleString("de-DE") + "s", median: timeToDecisionSlice.median.toLocaleString("de-DE") + "s", p90: timeToDecisionSlice.p90.toLocaleString("de-DE") + "s", percentageOver10s: timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") + "%", percentageUnder1s: timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") + "%", count: timeToDecisionSlice.count.toLocaleString("de-DE"), countOver10s: timeToDecisionSlice.countOver10s.toLocaleString("de-DE"), countUnder1s: timeToDecisionSlice.countUnder1s.toLocaleString("de-DE"), deviceType: timeToDecisionSlice.deviceType }} />
                                    <Widget styleType="small" totalNumber={timeToDecisionSlice.p90 == 0 ? "N/A" : timeToDecisionSlice.p90.toLocaleString("de-DE") + "s"} explainer={{ exist: true, title: "90th percentile time to decision", content: "Time taken by 90% of users to decide on consent." }} type="P90 decision time" fromDate={fromDate} toDate={toDate} details={{ avg: timeToDecisionSlice.avg.toLocaleString("de-DE") + "s", median: timeToDecisionSlice.median.toLocaleString("de-DE") + "s", p90: timeToDecisionSlice.p90.toLocaleString("de-DE") + "s", percentageOver10s: timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") + "%", percentageUnder1s: timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") + "%", count: timeToDecisionSlice.count.toLocaleString("de-DE"), countOver10s: timeToDecisionSlice.countOver10s.toLocaleString("de-DE"), countUnder1s: timeToDecisionSlice.countUnder1s.toLocaleString("de-DE"), deviceType: timeToDecisionSlice.deviceType }} />
                                    <Widget styleType="small" totalNumber={timeToDecisionSlice.avg == 0 ? "N/A" : timeToDecisionSlice.avg.toLocaleString("de-DE") + "s"} explainer={{ exist: true, title: "Average time to decision", content: "Average time taken by users to decide on consent." }} type="Average time to decision" fromDate={fromDate} toDate={toDate} details={{ avg: timeToDecisionSlice.avg.toLocaleString("de-DE") + "s", median: timeToDecisionSlice.median.toLocaleString("de-DE") + "s", p90: timeToDecisionSlice.p90.toLocaleString("de-DE") + "s", percentageOver10s: timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") + "%", percentageUnder1s: timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") + "%", count: timeToDecisionSlice.count.toLocaleString("de-DE"), countOver10s: timeToDecisionSlice.countOver10s.toLocaleString("de-DE"), countUnder1s: timeToDecisionSlice.countUnder1s.toLocaleString("de-DE"), deviceType: timeToDecisionSlice.deviceType }} />
                                    <Widget styleType="small" totalNumber={timeToDecisionSlice.percentageOver10s == 0 ? "N/A" : timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") + "%"} explainer={{ exist: true, title: "Percentage of users who took more than 10 seconds to decide", content: "Percentage of users who took more than 10 seconds to decide on consent." }} type=">10s time to decision" fromDate={fromDate} toDate={toDate} details={{ percentageOver10s: timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") + "%", percentageUnder1s: timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") + "%", count: timeToDecisionSlice.count.toLocaleString("de-DE"), countOver10s: timeToDecisionSlice.countOver10s.toLocaleString("de-DE"), countUnder1s: timeToDecisionSlice.countUnder1s.toLocaleString("de-DE"), deviceType: timeToDecisionSlice.deviceType }} />
                                    <Widget styleType="small" totalNumber={timeToDecisionSlice.percentageUnder1s == 0 ? "N/A" : timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") + "%"} explainer={{ exist: true, title: "Percentage of users who took less than 1 second to decide", content: "Percentage of users who took less than 1 second to decide on consent." }} type="<1s time to decision" fromDate={fromDate} toDate={toDate} details={{ percentageOver10s: timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") + "%", percentageUnder1s: timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") + "%", count: timeToDecisionSlice.count.toLocaleString("de-DE"), countOver10s: timeToDecisionSlice.countOver10s.toLocaleString("de-DE"), countUnder1s: timeToDecisionSlice.countUnder1s.toLocaleString("de-DE"), deviceType: timeToDecisionSlice.deviceType }} />
                                </div>
                            </>
                        ) : (
                            <p style={{ marginTop: "12px", color: "#666", fontSize: "0.875rem" }}>No time-to-decision data for the selected region.</p>
                        )}
                    </div>
                )}

                {/* ── 5. Compliance audit ── */}
                {id && (
                    <div className="dashboard-section">
                        <h2 className="dashboard-section-label">Compliance audit</h2>
                        <AuditSnapshotCard
                            platformId={id}
                            handle={handle}
                            currentDomain={currentDomain}
                            fromDate={fromDate}
                            toDate={toDate}
                            activeData={activeData}
                            demoMode={demoMode}
                            liveData={liveViewData}
                            interactionsLoading={loading}
                            observedCookies={observedCookies}
                        />
                        <p className="dashboard-marketing-link">
                            See consent through a marketing lens —{" "}
                            <Link to={reportsPath(id, currentDomain, "/marketing")}>Open marketing dashboard</Link>
                        </p>
                    </div>
                )}

                <PremiumTier loading={loading} activeData={activeData} fromDate={fromDate} toDate={toDate} demoMode={demoMode} compareOn={compareOn} />
            </div>
        </>
    )
}