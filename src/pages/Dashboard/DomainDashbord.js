const { useState, useEffect, useRef, useContext } = React;
import useFetch from "../../Functions/FetchHook";
import Fetch from "../../Functions/fetch";
import API from "../../API/api";
import Widget from "../../Components/widget/widget";
import { Loading, CurrentPageLoading } from "../../Components/widget/Loading";
import "./Style.css";
import Map from "../../Components/Charts/WorldMap/WorldMap.js";
import { DomainContext } from "../../App.js";
import NotAllowed from "../../Components/NotAllowed/NotAllowed";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import ErrorBoundary from "../../Components/Error/ErrorBoundary.js";
import { LiveView } from "../../components/LiveView/index.js";
import Select from "../../Components/SelectInput/Selector.js";
const useParams = window.ReactRouterDOM.useParams;
const punycode = require("punycode");
import { PremiumTier } from "../../Components/tiers/index.js";

export default function DomainDashbord(props) {
    const { handle, id } = useParams();
    document.title = `${punycode.toUnicode(handle)} Dashboard | Intastellar Consents | CMP`;
    const today = new Date();

    const demoMode = props.demoMode || false;
    
    const [activeDataCountry, setactiveDataCountry] = useState(null);
    const [activeData, setActiveData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingCountry, setLoadingCountry] = useState(true);
    const [getLastDays, setLastDays] = useState((localStorage.getItem("settings") != null) ? JSON.parse(localStorage.getItem("settings")).dateRange : 30);
    const [fromDate, setFromDate] = useState(new Date(new Date().setDate(today.getDate() - getLastDays)));
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)));
    const previousPeriod = new Date(new Date().setDate(new Date().getDate() - 30));
    const previousPeriod2 = new Date(new Date().setDate(new Date().getDate() - 60));
    const [observedCookies, setObservedCookies] = useState(null);
    const [timeToDecision, setTimeToDecision] = useState("global");

    let url = API[id].getInteractions.url;
    let method = API[id].getInteractions.method;
    let header = API[id].getInteractions.headers;

    console.log(fromDate, toDate);

    API[id].getInteractions.headers.Domains = punycode.toASCII(handle);
    API[id].getInteractions.headers.FromDate = fromDate.toISOString().split("T")[0];
    API[id].getInteractions.headers.ToDate = toDate.toISOString().split("T")[0];

    useEffect(() => {
        API[id].getInteractionsByCountry.headers.Domains = punycode.toASCII(handle);
        API[id].getInteractionsByCountry.headers.FromDate = fromDate.toISOString().split("T")[0];
        API[id].getInteractionsByCountry.headers.ToDate = toDate.toISOString().split("T")[0];
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

        API[id].observedCookies.headers.Domains = punycode.toASCII(handle);
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

    }, [fromDate, toDate, handle]);

    return (localStorage?.getItem("domains")?.includes(punycode.toUnicode(handle)) || handle == "combined view") ? (
        <>
            <StickyPageTitle infoType={"banner-styles"} showInfoButton={true} loadingUpdated={loading} finalLoaded={loadingCountry} title={`Domain: ${punycode.toUnicode(handle)} | Banner type: ${activeData?.bannerStyle}`} url={url} method={method} header={header} numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setactiveDataCountry} fromDate={activeData?.date.from || fromDate} toDate={activeData?.date.to || toDate} setFromDate={setFromDate} setToDate={setToDate} previousPeriod={previousPeriod} previousPeriod2={previousPeriod2} />
            <div className="dashboard-content">
                {
                    activeData != null ?
                        <>
                            <div className={`grid-container grid-7`} style={{ gap: "10px", marginBottom: "20px" }}>

                                <Widget styleType="small" totalNumber={activeData} activeUsers={activeData?.activeUsers.toLocaleString("de-DE")} type="Stored consent decisions" fromDate={fromDate} toDate={toDate} />
                                <Widget kpi={true} styleType="small" change={{
                                    change: activeData?.changeRate.accepted,
                                }} relativeDrop={{
                                    relativeDrop: activeData?.relativeDrop.accepted,
                                }} totalNumber={activeData?.Accepted.toLocaleString("de-DE") + "%"} type="Consent acceptance" fromDate={fromDate} toDate={toDate} />
                                <Widget kpi={true} change={{
                                    change: activeData?.changeRate.declined,
                                }} relativeDrop={{
                                    relativeDrop: activeData?.relativeDrop.declined,
                                }} explainer={{
                                    exist: true,
                                    title: "Essential-only rate",
                                    content: "Share of users who declined analytics and marketing cookies, allowing only required cookies..",
                                }} styleType="small" totalNumber={activeData?.Declined.toLocaleString("de-DE") + "%"} type="Essential-only rate" fromDate={fromDate} toDate={toDate} />
                                <Widget explainer={{
                                    exist: true,
                                    title: "EU based users",
                                    content: "Visitors detected from EU-based IP locations.",
                                }} styleType="small" totalNumber={activeData?.euUsers.toLocaleString("de-DE")} percentage={activeData?.euAcceptedRate.toLocaleString("de-DE")} type="EU-based users" fromDate={fromDate} toDate={toDate} />
                                <Widget explainer={{
                                    exist: true,
                                    title: "Non-EU based users",
                                    content: "Visitors detected from non-EU-based IP locations.",
                                }} styleType="small" totalNumber={activeData?.noneEUUsers.toLocaleString("de-DE")} percentage={activeData?.noneEUAcceptedRate.toLocaleString("de-DE")} type="Non-EU-based users" fromDate={fromDate} toDate={toDate} />
                                <Widget explainer={{
                                    exist: true,
                                    title: "Detected (pre-consent) cookies",
                                    content: "Number of cookies detected before user consent was given. Useful for identifying compliance risks.",
                                }} styleType="small" totalNumber={observedCookies?.preConsent.count.toLocaleString("de-DE") == 0 ? "N/A" : observedCookies?.preConsent.count.toLocaleString("de-DE")} type="Detected (pre-consent)" fromDate={fromDate} toDate={toDate} />
                                <Widget styleType="small" explainer={{
                                    exist: true,
                                    title: "Detected (post-consent) cookies",
                                    content: "Number of cookies detected after user consent was given. Used to verify correct consent enforcement.",
                                }} totalNumber={observedCookies?.consent.count.toLocaleString("de-DE") == 0 ? "N/A" : observedCookies?.consent.count.toLocaleString("de-DE")} type="Detected (post-consent)" fromDate={fromDate} toDate={toDate} />
                            </div>
                            <Select type="timeToDecision"
                                items={["global", "eu", "noneEU"]}
                                labels={["Global", "EU", "Non-EU"]}
                                defaultValue={timeToDecision}
                                onChange={(e) => {
                                    setTimeToDecision(e);
                                }}
                            />
                            <p>n= {activeData?.timeToDecision[timeToDecision].count.toLocaleString("de-DE")}</p>
                            <div className="grid-container grid-7" style={{ marginTop: "20px" }}>
                                <Widget styleType="small" totalNumber={activeData?.timeToDecision[timeToDecision].median.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].median.toLocaleString("de-DE") + "s"} explainer={{
                                    exist: true,
                                    title: "Median time to decision",
                                    content: "Median time taken by users to decide on consent.",
                                }} type="Median time to decision" fromDate={fromDate} toDate={toDate} details={
                                    {
                                        "avg": activeData?.timeToDecision[timeToDecision].avg.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].avg.toLocaleString("de-DE") + "s",
                                        "median": activeData?.timeToDecision[timeToDecision].median.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].median.toLocaleString("de-DE") + "s",
                                        "p90": activeData?.timeToDecision[timeToDecision].p90.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].p90.toLocaleString("de-DE") + "s",
                                        "percentageOver10s": activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") + "%",
                                        "percentageUnder1s": activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") + "%",
                                        "count": activeData?.timeToDecision[timeToDecision].count.toLocaleString("de-DE"),
                                        "countOver10s": activeData?.timeToDecision[timeToDecision].countOver10s.toLocaleString("de-DE"),
                                        "countUnder1s": activeData?.timeToDecision[timeToDecision].countUnder1s.toLocaleString("de-DE"),
                                        "percentageOver10s": activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") + "%",
                                        "percentageUnder1s": activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") + "%",
                                        "deviceType": activeData?.timeToDecision[timeToDecision].deviceType,
                                    }
                                } />
                                <Widget styleType="small" totalNumber={activeData?.timeToDecision[timeToDecision].p90.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].p90.toLocaleString("de-DE") + "s"} explainer={{
                                    exist: true,
                                    title: "90th percentile time to decision",
                                    content: "Time taken by 90% of users to decide on consent.",
                                }} type="P90 decision time" fromDate={fromDate} toDate={toDate} details={
                                    {
                                        "avg": activeData?.timeToDecision[timeToDecision].avg.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].avg.toLocaleString("de-DE") + "s",
                                        "median": activeData?.timeToDecision[timeToDecision].median.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].median.toLocaleString("de-DE") + "s",
                                        "p90": activeData?.timeToDecision[timeToDecision].p90.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].p90.toLocaleString("de-DE") + "s",
                                        "percentageOver10s": activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") + "%",
                                        "percentageUnder1s": activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") + "%",
                                        "count": activeData?.timeToDecision[timeToDecision].count.toLocaleString("de-DE"),
                                        "countOver10s": activeData?.timeToDecision[timeToDecision].countOver10s.toLocaleString("de-DE"),
                                        "countUnder1s": activeData?.timeToDecision[timeToDecision].countUnder1s.toLocaleString("de-DE"),
                                        "percentageOver10s": activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") + "%",
                                        "percentageUnder1s": activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") + "%",
                                        "deviceType": activeData?.timeToDecision[timeToDecision].deviceType,
                                    }
                                } />
                                <Widget styleType="small" totalNumber={activeData?.timeToDecision[timeToDecision].avg.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].avg.toLocaleString("de-DE") + "s"} explainer={{
                                    exist: true,
                                    title: "Average time to decision",
                                    content: "Average time taken by users to decide on consent.",
                                }} type="Average time to decision" fromDate={fromDate} toDate={toDate} details={
                                    {
                                        "avg": activeData?.timeToDecision[timeToDecision].avg.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].avg.toLocaleString("de-DE") + "s",
                                        "median": activeData?.timeToDecision[timeToDecision].median.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].median.toLocaleString("de-DE") + "s",
                                        "p90": activeData?.timeToDecision[timeToDecision].p90.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].p90.toLocaleString("de-DE") + "s",
                                        "percentageOver10s": activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") + "%",
                                        "percentageUnder1s": activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") + "%",
                                        "count": activeData?.timeToDecision[timeToDecision].count.toLocaleString("de-DE"),
                                        "countOver10s": activeData?.timeToDecision[timeToDecision].countOver10s.toLocaleString("de-DE"),
                                        "countUnder1s": activeData?.timeToDecision[timeToDecision].countUnder1s.toLocaleString("de-DE"),
                                        "percentageOver10s": activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") + "%",
                                        "percentageUnder1s": activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") + "%",
                                        "deviceType": activeData?.timeToDecision[timeToDecision].deviceType,
                                    }
                                } />
                                <Widget styleType="small" totalNumber={activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") + "%"} explainer={{
                                    exist: true,
                                    title: "Percentage of users who took more than 10 seconds to decide",
                                    content: "Percentage of users who took more than 10 seconds to decide on consent.",
                                }} type=">10s time to decision" fromDate={fromDate} toDate={toDate} details={
                                    {
                                        "percentageOver10s": activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") + "%",
                                        "percentageUnder1s": activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") + "%",
                                        "count": activeData?.timeToDecision[timeToDecision].count.toLocaleString("de-DE"),
                                        "countOver10s": activeData?.timeToDecision[timeToDecision].countOver10s.toLocaleString("de-DE"),
                                        "countUnder1s": activeData?.timeToDecision[timeToDecision].countUnder1s.toLocaleString("de-DE"),
                                        "deviceType": activeData?.timeToDecision[timeToDecision].deviceType,
                                    }
                                } />
                                <Widget styleType="small" totalNumber={activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") + "%"} explainer={{
                                    exist: true,
                                    title: "Percentage of users who took less than 1 second to decide",
                                    content: "Percentage of users who took less than 1 second to decide on consent.",
                                }} type="<1s time to decision" fromDate={fromDate} toDate={toDate} details={
                                    {
                                        "percentageOver10s": activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") + "%",
                                        "percentageUnder1s": activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") + "%",
                                        "count": activeData?.timeToDecision[timeToDecision].count.toLocaleString("de-DE"),
                                        "countOver10s": activeData?.timeToDecision[timeToDecision].countOver10s.toLocaleString("de-DE"),
                                        "countUnder1s": activeData?.timeToDecision[timeToDecision].countUnder1s.toLocaleString("de-DE"),
                                        "deviceType": activeData?.timeToDecision[timeToDecision].deviceType,
                                    }
                                } />
                            </div>
                        </> : <>
                            <div className="grid-container grid-5" style={{ gap: "20px", marginBottom: "20px" }}>
                                <Loading small={true} />
                                <Loading small={true} />
                                <Loading small={true} />
                                <Loading small={true} />
                                <Loading small={true} />
                                <Loading small={true} />
                            </div>
                            <div className="grid-container grid-5" style={{ gap: "20px", marginBottom: "20px" }}>
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
                            <LiveView currentDomain={punycode.toUnicode(handle)} demoMode={demoMode} />
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
    ) : <NotAllowed />
}   