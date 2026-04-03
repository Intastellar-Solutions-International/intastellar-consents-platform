const { useState, useEffect, useRef, useContext, useMemo, useCallback } = React;
import useFetch from "../../Functions/FetchHook";
import API from "../../API/api";
import { Loading, LoadingBar } from "../../Components/widget/Loading";

import "./Style.css";
import Map from "../../Components/Charts/WorldMap/WorldMap.js";
import { DomainContext, OrganisationContext } from "../../App.js";
import {
    reportsPath,
    consentsDomainFromRoute,
    toDomainsApiHeader,
} from "../../Functions/domainPathSegments.js";
import { isJson } from "../../Functions/isJson.js";
const useParams = window.ReactRouterDOM.useParams;
const Link = window.ReactRouterDOM.Link;
import Crawler from "../../Components/Crawler";
import Line from "../../Components/Charts/Line"
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { LiveView } from "../../components/LiveView/index.js";
import AuditSnapshotCard from "../../components/AuditSnapshotCard/AuditSnapshotCard.js";
import { PremiumTier, BasicTier, ProTier } from "../../Components/tiers/index.js";
import Pie from "../../Components/Charts/Pie/index.js";
import Widget from "../../Components/widget/widget.js";
import ErrorBoundary from "../../Components/Error/ErrorBoundary.js";
import Authentication from "../../Authentication/Auth";
import Select from "../../Components/SelectInput/Selector.js";
const punycode = require("punycode");

export default function Dashboard(props) {
    document.title = "Home | Intastellar Consents | CMP";
    const [currentDomain, setCurrentDomain] = useContext(DomainContext);
    const [organisation, setOrganisation] = useContext(OrganisationContext);
    const previousPeriod = new Date(new Date().setDate(new Date().getDate() - 30));
    const previousPeriod2 = new Date(new Date().setDate(new Date().getDate() - 60));

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
    const [getLastDays, setLastDays] = useState((localStorage.getItem("settings") != null) ? JSON.parse(localStorage.getItem("settings")).dateRange : 30);
    const today = new Date();
    const [fromDate, setFromDate] = useState(new Date(new Date().setDate(today.getDate() - getLastDays)));
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)));
    const [observedCookies, setObservedCookies] = useState(null);

    const [loading, setLoading] = useState(false);
    const [loadingCountry, setLoadingCountry] = useState(false);

    const dashboardView = props.dashboardView;
    let url = API[id].getInteractions.url;
    let method = API[id].getInteractions.method;
    let header = API[id].getInteractions.headers;

    API[id].getInteractions.headers.Domains = handle ? handle : currentDomain;
    API[id].getInteractionsByCountry.headers.Domains = handle ? handle : currentDomain;
    API[id].getInteractions.headers.FromDate = fromDate.toISOString().split("T")[0];
    API[id].getInteractions.headers.ToDate = toDate.toISOString().split("T")[0];

    API[id].getInteractionsByCountry.headers.FromDate = fromDate.toISOString().split("T")[0];
    API[id].getInteractionsByCountry.headers.ToDate = toDate.toISOString().split("T")[0];

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

        API[id].observedCookies.headers.Domains = currentDomain;
        API[id].observedCookies.headers.FromDate = fromDate.toISOString().split("T")[0];
        API[id].observedCookies.headers.ToDate = toDate.toISOString().split("T")[0];

        fetch(API[id].observedCookies.url, {
            method: API[id].observedCookies.method,
            headers: API[id].observedCookies.headers,
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

    }, [fromDate, toDate, handle]);

    document.querySelectorAll(".intInput").forEach((input) => {
        input.setAttribute("max", new Date().toISOString().split("T")[0]);
    })

    if(activeData != null) {
        fetch(
            "https://apis.intastellarsolutions.com/cmp/ai.php",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    prompt: `Provide a brief summary of the user consent data for the period from ${fromDate.toISOString().split("T")[0]} to ${toDate.toISOString().split("T")[0]}. The summary should include key metrics such as total consent interactions, acceptance rates, and any notable trends or patterns observed during this timeframe. Format the response in JSON with keys: totalInteractions, acceptanceRate, notableTrends.`,
                    consentData: activeData,
                    max_tokens: 500,
                    temperature: 0.7,
                }),
            }
        ).then((e) => e.json()).then((data) => {
            console.log(data);
        }).catch((err) => {
            console.error(err);
        });
    }

    return (
        <>
            <StickyPageTitle demoMode={demoMode} loadingUpdated={loading} finalLoaded={loadingCountry} title={handle ? `Dashboard: ${punycode.toUnicode(handle)}` : "Dashboard"} url={url} method={method} header={header} numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setActiveData} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} previousPeriod={previousPeriod} previousPeriod2={previousPeriod2} />
            <div className="dashboard-content">
                {/* <div className="profilePicture-container">
                    <img src={userProfile} className="profilePicture" />
                    <p className="profile-user">Welcome, {JSON.parse(localStorage.getItem("globals")).user.name.firstName}</p>
                    <p>This dashboard shows aggregated consent interactions for the selected period. <br />
                        Use it to monitor acceptance rates and category-level consent behavior.</p>
                    
                </div> */}
                {/* Top key data views */}
                {
                    organisation != null && JSON.parse(organisation).id == 1 && !demoMode && !handle ?
                        <div className="grid-container topWidget" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "20px", }}>
                            {(jsLoading) ? <Loading /> : <ErrorBoundary>
                                <Widget styleType="small" totalNumber={jsData.Total?.toLocaleString("de-DE")} type="Websites" />
                            </ErrorBoundary>
                            }
                            {(jsLoading) ? <Loading /> : <ErrorBoundary><Widget styleType="small" totalNumber={jsData?.JS?.toLocaleString("de-DE") + "%"} type="JavaScript" /></ErrorBoundary>}
                            {(jsLoading) ? <Loading /> : <ErrorBoundary><Widget styleType="small" totalNumber={jsData?.WP?.toLocaleString("de-DE") + "%"} type="WordPress" /></ErrorBoundary>}
                        </div> : null
                }
                {id ? (
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
                    />
                ) : null}
                {
                    activeData != null ?
                        <>
                        <div className={`grid-container grid-7 topWidget`} style={{ gap: "10px", marginBottom: "20px" }}>

                            <Widget styleType="small" totalNumber={activeData} activeUsers={activeData?.activeUsers?.toLocaleString("de-DE")} type="Stored consent decisions" fromDate={fromDate} toDate={toDate} />
                            <Widget kpi={true} styleType="small" change={{
                                change: activeData?.changeRate?.accepted,
                            }} relativeDrop={{
                                relativeDrop: activeData?.relativeDrop?.accepted,
                            }} totalNumber={(activeData?.Accepted != null ? activeData.Accepted.toLocaleString("de-DE") : "—") + "%"} type="Consent acceptance" fromDate={fromDate} toDate={toDate} />
                            <Widget kpi={true} change={{
                                change: activeData?.changeRate?.declined,
                            }} relativeDrop={{
                                relativeDrop: activeData?.relativeDrop?.declined,
                            }} explainer={{
                                exist: true,
                                title: "Essential-only rate",
                                content: "Share of users who declined analytics and marketing cookies, allowing only required cookies..",
                            }} styleType="small" totalNumber={(activeData?.Declined != null ? activeData.Declined.toLocaleString("de-DE") : "—") + "%"} type="Essential-only rate" fromDate={fromDate} toDate={toDate} />
                            <Widget explainer={{
                                exist: true,
                                title: "EU based users",
                                    content: "Visitors detected from EU-based IP locations.",
                            }} styleType="small" totalNumber={activeData?.euUsers != null ? activeData.euUsers.toLocaleString("de-DE") : "—"} percentage={activeData?.euAcceptedRate != null ? activeData.euAcceptedRate.toLocaleString("de-DE") : null} type="EU-based users" fromDate={fromDate} toDate={toDate} />
                            <Widget explainer={{
                                exist: true,
                                title: "Non-EU based users",
                                content: "Visitors detected from non-EU-based IP locations.",
                            }}  styleType="small" totalNumber={activeData?.noneEUUsers != null ? activeData.noneEUUsers.toLocaleString("de-DE") : "—"} percentage={activeData?.noneEUAcceptedRate != null ? activeData.noneEUAcceptedRate.toLocaleString("de-DE") : null} type="Non-EU-based users" fromDate={fromDate} toDate={toDate} />
                            <Widget explainer={{
                                exist: true,
                                title: "Detected (pre-consent) cookies",
                                content: "Number of cookies detected before user consent was given. Useful for identifying compliance risks.",
                            }} styleType="small" totalNumber={observedCookies?.preConsent?.count == null ? "N/A" : observedCookies.preConsent.count.toLocaleString("de-DE") == 0 ? "N/A" : observedCookies.preConsent.count.toLocaleString("de-DE")} type="Detected (pre-consent)" fromDate={fromDate} toDate={toDate} />
                            <Widget styleType="small" explainer={{
                                exist: true,
                                title: "Detected (post-consent) cookies",
                                    content: "Number of cookies detected after user consent was given. Used to verify correct consent enforcement.",
                            }} totalNumber={observedCookies?.consent?.count == null ? "N/A" : observedCookies.consent.count.toLocaleString("de-DE") == 0 ? "N/A" : observedCookies.consent.count.toLocaleString("de-DE")} type="Detected (post-consent)" fromDate={fromDate} toDate={toDate} />
                        </div>
                        {hasTimeToDecision ? (
                        <>
                        <Select type="timeToDecision"
                            items={["global", "eu", "noneEU"]}
                            labels={["Global", "EU", "Non-EU"]}
                            defaultValue={timeToDecision}
                            onChange={(e) => {
                                setTimeToDecision(e);
                            }}
                        />
                        {timeToDecisionSlice ? (
                        <>
                        <p>n= {timeToDecisionSlice.count.toLocaleString("de-DE")}</p>
                        <div className="grid-container topWidget grid-7" style={{ marginTop: "20px" }}>
                            <Widget styleType="small" totalNumber={timeToDecisionSlice.median.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.median.toLocaleString("de-DE") + "s"} explainer={{
                                exist: true,
                                title: "Median time to decision",
                                content: "Median time taken by users to decide on consent.",
                            }} type="Median time to decision" fromDate={fromDate} toDate={toDate} details={
                                {
                                    "avg": timeToDecisionSlice.avg.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.avg.toLocaleString("de-DE") + "s",
                                    "median": timeToDecisionSlice.median.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.median.toLocaleString("de-DE") + "s",
                                    "p90": timeToDecisionSlice.p90.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.p90.toLocaleString("de-DE") + "s",
                                    "percentageOver10s": timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") + "%",
                                    "percentageUnder1s": timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") + "%",
                                    "count": timeToDecisionSlice.count.toLocaleString("de-DE"),
                                    "countOver10s": timeToDecisionSlice.countOver10s.toLocaleString("de-DE"),
                                    "countUnder1s": timeToDecisionSlice.countUnder1s.toLocaleString("de-DE"),
                                    "percentageOver10s": timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") + "%",
                                    "percentageUnder1s": timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") + "%",
                                    "deviceType": timeToDecisionSlice.deviceType,
                                }
                            } />
                            <Widget styleType="small" totalNumber={timeToDecisionSlice.p90.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.p90.toLocaleString("de-DE") + "s" } explainer={{
                                exist: true,
                                title: "90th percentile time to decision",
                                content: "Time taken by 90% of users to decide on consent.",
                                }} type="P90 decision time" fromDate={fromDate} toDate={toDate} details={
                                    {
                                        "avg": timeToDecisionSlice.avg.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.avg.toLocaleString("de-DE") + "s",
                                        "median": timeToDecisionSlice.median.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.median.toLocaleString("de-DE") + "s",
                                        "p90": timeToDecisionSlice.p90.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.p90.toLocaleString("de-DE") + "s",
                                        "percentageOver10s": timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") + "%",
                                        "percentageUnder1s": timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") + "%",
                                        "count": timeToDecisionSlice.count.toLocaleString("de-DE"),
                                        "countOver10s": timeToDecisionSlice.countOver10s.toLocaleString("de-DE"),
                                        "countUnder1s": timeToDecisionSlice.countUnder1s.toLocaleString("de-DE"),
                                        "percentageOver10s": timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") + "%",
                                        "percentageUnder1s": timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") + "%",
                                        "deviceType": timeToDecisionSlice.deviceType,
                                    }
                                } />
                            <Widget styleType="small" totalNumber={timeToDecisionSlice.avg.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.avg.toLocaleString("de-DE") + "s"} explainer={{
                                exist: true,
                                title: "Average time to decision",
                                content: "Average time taken by users to decide on consent.",
                            }} type="Average time to decision" fromDate={fromDate} toDate={toDate} details={
                                {
                                    "avg": timeToDecisionSlice.avg.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.avg.toLocaleString("de-DE") + "s",
                                    "median": timeToDecisionSlice.median.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.median.toLocaleString("de-DE") + "s",
                                    "p90": timeToDecisionSlice.p90.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.p90.toLocaleString("de-DE") + "s",
                                    "percentageOver10s": timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") + "%",
                                    "percentageUnder1s": timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") + "%",
                                    "count": timeToDecisionSlice.count.toLocaleString("de-DE"),
                                    "countOver10s": timeToDecisionSlice.countOver10s.toLocaleString("de-DE"),
                                    "countUnder1s": timeToDecisionSlice.countUnder1s.toLocaleString("de-DE"),
                                    "percentageOver10s": timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") + "%",
                                    "percentageUnder1s": timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") + "%",
                                    "deviceType": timeToDecisionSlice.deviceType,
                                }
                            } />
                            <Widget styleType="small" totalNumber={timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") + "%"} explainer={{
                                exist: true,
                                title: "Percentage of users who took more than 10 seconds to decide",
                                content: "Percentage of users who took more than 10 seconds to decide on consent.",
                            }} type=">10s time to decision" fromDate={fromDate} toDate={toDate} details={
                                {
                                    "percentageOver10s": timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") + "%",
                                    "percentageUnder1s": timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") + "%",
                                    "count": timeToDecisionSlice.count.toLocaleString("de-DE"),
                                    "countOver10s": timeToDecisionSlice.countOver10s.toLocaleString("de-DE"),
                                    "countUnder1s": timeToDecisionSlice.countUnder1s.toLocaleString("de-DE"),
                                    "deviceType": timeToDecisionSlice.deviceType,
                                }
                            } />
                            <Widget styleType="small" totalNumber={timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") + "%"} explainer={{
                                exist: true,
                                title: "Percentage of users who took less than 1 second to decide",
                                content: "Percentage of users who took less than 1 second to decide on consent.",
                            }} type="<1s time to decision" fromDate={fromDate} toDate={toDate} details={
                                {
                                    "percentageOver10s": timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageOver10s.toLocaleString("de-DE") + "%",
                                    "percentageUnder1s": timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : timeToDecisionSlice.percentageUnder1s.toLocaleString("de-DE") + "%",
                                    "count": timeToDecisionSlice.count.toLocaleString("de-DE"),
                                    "countOver10s": timeToDecisionSlice.countOver10s.toLocaleString("de-DE"),
                                    "countUnder1s": timeToDecisionSlice.countUnder1s.toLocaleString("de-DE"),
                                    "deviceType": timeToDecisionSlice.deviceType,
                                }
                            } />
                        </div>
                        </>
                        ) : (
                        <p style={{ marginTop: "12px", color: "#666" }}>No time-to-decision data for the selected region filter.</p>
                        )}
                        </>
                        ) : (
                        <p style={{ marginTop: "12px", color: "#666" }}>Time-to-decision metrics are not available for this domain or date range.</p>
                        )}
                        </> : <>
                            <div className="grid-container grid-5 topWidget" style={{ gap: "20px", marginBottom: "20px" }}>
                                <Loading small={true} />
                                <Loading small={true} />
                                <Loading small={true} />
                                <Loading small={true} />
                                <Loading small={true} />
                                <Loading small={true} />
                            </div>
                            <div className="grid-container grid-5 topWidget" style={{ gap: "20px", marginBottom: "20px" }}>
                                <Loading small={true} />
                                <Loading small={true} />
                                <Loading small={true} />
                                <Loading small={true} />
                                <Loading small={true} />
                                <Loading small={true} />
                            </div>
                        </>

                }
                {/* {
                    (id === "gdpr" && organisation != null && JSON.parse(organisation).id == 1) ? <TopWidgets dashboardView={dashboardView} API={{
                        url: API[id].getTotalNumber.url,
                        method: API[id].getTotalNumber.method,
                        header: API[id].getTotalNumber.headers
                    }} /> : null
                }
                {
                    (id === "gdpr" && organisation != null && JSON.parse(organisation).id == 1) ? <StyleWidget dashboardView={dashboardView} API={{
                        url: API[id].getStyle.url,
                        method: API[id].getStyle.method,
                        header: API[id].getStyle.headers
                    }} /> : null
                } */}
                {/* <div className="crawler">
                    <Crawler />
                </div> */}
                <div className="" style={{ paddingTop: "40px" }}>
                    <div className="grid-container grid-2" style={{ gridTemplateColumns: "1fr .5fr", gap: "20px" }}>
                        {(loadingCountry) ? <>

                            <Loading />
                        </> : <Map demoMode={demoMode} data={{

                            Countries: activeDataCountry?.data?.Countries,
                            total: activeData?.Total,
                        }} /* renderCountryPanelExtras={(c) =>
                                        c.device_type ? (
                                            <DeviceTypeInteractions
                                                title="Device mix in this country"
                                                activeData={{ device_type: c.device_type, Total: c.num?.total }}
                                                fromDate={fromDate}
                                                toDate={toDate}
                                                demoMode={demoMode}
                                            />
                                        ) : null
                                    } */ />}
                        <div className={["widget no-padding"]}>
                            <LiveView
                                currentDomain={handle ? handle : currentDomain}
                                demoMode={demoMode}
                                onLiveDataChange={onLiveDataChange}
                            />
                        </div>
                    </div>
                </div>
                <PremiumTier loading={loading} activeData={activeData} fromDate={fromDate} toDate={toDate} demoMode={demoMode} />
                {/* {subscriptionStatus?.tier === "premium" ?
                    <PremiumTier loading={loading} activeData={activeData} />
                    : (subscriptionStatus?.tier === "professional") ?
                        <ProTier loading={loading} activeData={activeData} />
                        : <BasicTier />
                } */}
            </div>
        </>
    )
}