const { useState, useEffect, useRef, useContext } = React;
import useFetch from "../../Functions/FetchHook";
import API from "../../API/api";
import { Loading, LoadingBar } from "../../Components/widget/Loading";

import "./Style.css";
import Map from "../../Components/Charts/WorldMap/WorldMap.js";
import { DomainContext, OrganisationContext } from "../../App.js";
const useParams = window.ReactRouterDOM.useParams;
import Crawler from "../../Components/Crawler";
import Line from "../../Components/Charts/Line"
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { LiveView } from "../../components/LiveView/index.js";
import { PremiumTier, BasicTier, ProTier } from "../../Components/tiers/index.js";
import Pie from "../../Components/Charts/Pie/index.js";
import Widget from "../../Components/widget/widget.js";
import ErrorBoundary from "../../Components/Error/ErrorBoundary.js";
import Authentication from "../../Authentication/Auth";

export default function Dashboard(props) {
    document.title = "Home | Intastellar Consents | CMP";
    const [currentDomain, setCurrentDomain] = useContext(DomainContext);
    const [organisation, setOrganisation] = useContext(OrganisationContext);
    const previousPeriod = new Date(new Date().setDate(new Date().getDate() - 30));
    const previousPeriod2 = new Date(new Date().setDate(new Date().getDate() - 60));

    const subscriptionStatus = JSON.parse(localStorage.getItem("subscription"));
    const userProfile = JSON.parse(localStorage.getItem("globals")).user.avatar;

    const [demoMode, setDemoMode] = useState(Authentication.DemoMode);

    const { handle, id } = useParams();
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

    API[id].getInteractions.headers.Domains = currentDomain;
    API[id].getInteractionsByCountry.headers.Domains = currentDomain;
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

    }, [fromDate, toDate]);

    document.querySelectorAll(".intInput").forEach((input) => {
        input.setAttribute("max", new Date().toISOString().split("T")[0]);
    })

    console.log("Demo mode: ", demoMode);

    return (
        <>
            <StickyPageTitle demoMode={demoMode} loadingUpdated={loading} finalLoaded={loadingCountry} title="Home" url={url} method={method} header={header} numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setActiveData} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} previousPeriod={previousPeriod} previousPeriod2={previousPeriod2} />
            <div className="dashboard-content">
                {/* <div className="profilePicture-container">
                    <img src={userProfile} className="profilePicture" />
                    <p className="profile-user">Welcome, {JSON.parse(localStorage.getItem("globals")).user.name.firstName}</p>
                    <p>This dashboard shows aggregated consent interactions for the selected period. <br />
                        Use it to monitor acceptance rates and category-level consent behavior.</p>
                    
                </div> */}
                {/* Top key data views */}
                {
                    organisation != null && JSON.parse(organisation).id == 1 && !demoMode ?
                        <div className="grid-container" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "20px", }}>
                            {(jsLoading) ? <Loading /> : <ErrorBoundary>
                                <Widget styleType="small" totalNumber={jsData.Total?.toLocaleString("de-DE")} type="Websites" />
                            </ErrorBoundary>
                            }
                            {(jsLoading) ? <Loading /> : <ErrorBoundary><Widget styleType="small" totalNumber={jsData?.JS?.toLocaleString("de-DE") + "%"} type="JavaScript" /></ErrorBoundary>}
                            {(jsLoading) ? <Loading /> : <ErrorBoundary><Widget styleType="small" totalNumber={jsData?.WP?.toLocaleString("de-DE") + "%"} type="WordPress" /></ErrorBoundary>}
                        </div> : null
                }
                {
                    activeData != null ?
                        <>
                        <div className={`grid-container grid-7`} style={{ gap: "10px", marginBottom: "20px" }}>

                            <Widget styleType="small" totalNumber={activeData} type="Stored consent decisions" fromDate={fromDate} toDate={toDate} />
                            <Widget styleType="small" totalNumber={activeData?.Accepted.toLocaleString("de-DE") + "%"} type="Consent acceptance" fromDate={fromDate} toDate={toDate} />
                            <Widget styleType="small" totalNumber={activeData?.Declined.toLocaleString("de-DE") + "%"} type="Essential-only rate" fromDate={fromDate} toDate={toDate} />
                            <Widget styleType="small" totalNumber={activeData?.euUsers.toLocaleString("de-DE")} type="EU-based users" fromDate={fromDate} toDate={toDate} />
                            <Widget styleType="small" totalNumber={activeData?.noneEUUsers.toLocaleString("de-DE")} type="Non-EU-based users" fromDate={fromDate} toDate={toDate} />
                            <Widget styleType="small" totalNumber={observedCookies?.preConsent.count.toLocaleString("de-DE") == 0 ? "N/A" : observedCookies?.preConsent.count.toLocaleString("de-DE")} type="Detected (pre-consent)" fromDate={fromDate} toDate={toDate} />
                            <Widget styleType="small" totalNumber={observedCookies?.consent.count.toLocaleString("de-DE") == 0 ? "N/A" : observedCookies?.consent.count.toLocaleString("de-DE")} type="Detected (post-consent)" fromDate={fromDate} toDate={toDate} />
                        </div> 
                        </> : <div className="grid-container grid-5" style={{ gap: "20px", marginBottom: "20px" }}>
                                <Loading small={true} />
                                <Loading small={true} />
                                <Loading small={true} />
                                <Loading small={true} />
                                <Loading small={true} />
                                <Loading small={true} />
                            </div>  

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
                        </> : <>

                            <div className={["widget no-padding grid-3-4"]}>
                                <Map demoMode={demoMode} data={{

                                    Countries: activeDataCountry?.data?.Countries,
                                    total: activeData?.Total,
                                }} />
                            </div>
                        </>}
                        <div className={["widget no-padding"]}>
                            <LiveView currentDomain={currentDomain} demoMode={demoMode} />
                        </div>
                    </div>
                </div>
                <PremiumTier loading={loading} activeData={activeData} fromDate={fromDate} demoMode={demoMode} />
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