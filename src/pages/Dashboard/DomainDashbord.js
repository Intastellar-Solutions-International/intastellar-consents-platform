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

export default function DomainDashbord(props) {
    const { handle, id } = useParams();
    document.title = `${punycode.toUnicode(handle)} Dashboard | Intastellar Consents | CMP`;
    const today = new Date();

    const demoMode = props.demoMode || false;
    
    const [activeDataCountry, setactiveDataCountry] = useState(null);
    const [data, setActiveData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingCountry, setLoadingCountry] = useState(true);
    const [getLastDays, setLastDays] = useState((localStorage.getItem("settings") != null) ? JSON.parse(localStorage.getItem("settings")).dateRange : 30);
    const [fromDate, setFromDate] = useState(new Date(new Date().setDate(today.getDate() - getLastDays)));
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)));
    const previousPeriod = new Date(new Date().setDate(new Date().getDate() - 30));
    const previousPeriod2 = new Date(new Date().setDate(new Date().getDate() - 60));
    const [observedCookies, setObservedCookies] = useState(null);

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
            <StickyPageTitle infoType={"banner-styles"} showInfoButton={true} loadingUpdated={loading} finalLoaded={loadingCountry} title={`Domain: ${punycode.toUnicode(handle)} | Banner type: ${data?.bannerStyle}`} url={url} method={method} header={header} numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setactiveDataCountry} fromDate={data?.date.from || fromDate} toDate={data?.date.to || toDate} setFromDate={setFromDate} setToDate={setToDate} previousPeriod={previousPeriod} previousPeriod2={previousPeriod2} />
            <div className="dashboard-content">
                {
                    (!loading) ?
                    <>
                        <div className={`grid-container grid-7`} style={{ gap: "10px", marginBottom: "20px" }}>

                            <Widget styleType="small" totalNumber={data} type="Consents given" fromDate={fromDate} toDate={toDate} />
                            <Widget styleType="small" totalNumber={data?.Accepted.toLocaleString("de-DE") + "%"} type="Consent acceptance" fromDate={fromDate} toDate={toDate} />
                            <Widget explainer={{
                                exist: true,
                                title: "Essential-only rate",
                                content: "Share of users who declined analytics and marketing cookies, allowing only required cookies..",
                            }} styleType="small" totalNumber={data?.Declined.toLocaleString("de-DE") + "%"} type="Essential-only rate" fromDate={fromDate} toDate={toDate} />
                            <Widget explainer={{
                                exist: true,
                                title: "EU based users",
                                content: "Visitors detected from EU-based IP locations.",
                            }} styleType="small" totalNumber={data?.euUsers.toLocaleString("de-DE")} percentage={data?.euAcceptedRate.toLocaleString("de-DE")} type="EU-based users" fromDate={fromDate} toDate={toDate} />
                            <Widget explainer={{
                                exist: true,
                                title: "Non-EU based users",
                                content: "Visitors detected from non-EU-based IP locations.",
                            }} styleType="small" totalNumber={data?.noneEUUsers.toLocaleString("de-DE")} percentage={data?.noneEUAcceptedRate.toLocaleString("de-DE")} type="Non-EU-based users" fromDate={fromDate} toDate={toDate} />
                            <Widget explainer={{
                                exist: true,
                                title: "Detected (pre-consent) cookies",
                                content: "Number of cookies detected before user consent was given. Useful for identifying compliance risks.",
                            }} styleType="small" totalNumber={observedCookies?.preConsent.count.toLocaleString("de-DE") == 0 ? "N/A" : observedCookies?.preConsent.count.toLocaleString("de-DE")} type="Detected (pre-consent)" fromDate={fromDate} toDate={toDate} />
                            <Widget explainer={{
                                exist: true,
                                title: "Detected (post-consent) cookies",
                                content: "Number of cookies detected after user consent was given. Used to verify correct consent enforcement.",
                            }} styleType="small" totalNumber={observedCookies?.consent.count.toLocaleString("de-DE") == 0 ? "N/A" : observedCookies?.consent.count.toLocaleString("de-DE")} type="Detected (post-consent)" fromDate={fromDate} toDate={toDate} />
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
                        <div className="grid-container grid-7" style={{ marginBottom: "20px" }}>
                            <Widget styleType="small" totalNumber={activeData?.timeToDecision[timeToDecision].median.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].median.toLocaleString("de-DE") + "s"} explainer={{ 
                                exist: true,
                                title: "Median time to decision",
                                content: "Median time taken by users to decide on consent.",
                            }} type="Median time to decision" fromDate={fromDate} toDate={toDate} />
                            <Widget styleType="small" totalNumber={activeData?.timeToDecision[timeToDecision].p90.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].p90.toLocaleString("de-DE") + "s"} explainer={{
                                exist: true,
                                title: "90th percentile time to decision",
                                content: "Time taken by 90% of users to decide on consent.",
                                }} type="P90 decision time" fromDate={fromDate} toDate={toDate} />
                            <Widget styleType="small" totalNumber={activeData?.timeToDecision[timeToDecision].avg.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].avg.toLocaleString("de-DE") + "s"} explainer={{
                                exist: true,
                                title: "Average time to decision",
                                content: "Average time taken by users to decide on consent.",
                            }} type="Average time to decision" fromDate={fromDate} toDate={toDate} />
                            <Widget styleType="small" totalNumber={activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageOver10s.toLocaleString("de-DE") + "%"} explainer={{
                                exist: true,
                                title: "Percentage of users who took more than 10 seconds to decide",
                                content: "Percentage of users who took more than 10 seconds to decide on consent.",
                            }} type=">10s time to decision" fromDate={fromDate} toDate={toDate} />
                            <Widget styleType="small" totalNumber={activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") == 0 ? "N/A" : activeData?.timeToDecision[timeToDecision].percentageUnder1s.toLocaleString("de-DE") + "%"} explainer={{
                                exist: true,
                                title: "Percentage of users who took less than 1 second to decide",
                                content: "Percentage of users who took less than 1 second to decide on consent.",
                            }} type="<1s time to decision" fromDate={fromDate} toDate={toDate} />
                        </div>
                        </> : <>
                        <div className="grid-container grid-7" style={{ gap: "20px", marginBottom: "20px" }}>
                            <Loading small={true} />
                            <Loading small={true} />
                            <Loading small={true} />
                            <Loading small={true} />
                            <Loading small={true} />
                            <Loading small={true} />
                            <Loading small={true} />
                        </div>

                        </>
                }
                {(!loading && data?.Total === 0) ? <>
                    <h1>No interactions yet</h1>
                    <p>No interactions were recorded for this domain during the selected period.</p>
                </> :
                <>
                    <div className="grid-container grid-2" style={{ gridTemplateColumns: "1fr .5fr", gap: "20px" }}>
                        {(loadingCountry) ? <Loading /> : (activeDataCountry?.data?.Total === 0) ? null :
                            <div className={["widget no-padding grid-3-4"]}>
                                <Map data={{

                                    Countries: activeDataCountry?.data?.Countries,
                                    total: activeDataCountry?.data?.Total,
                                }} />
                            </div>
                        }
                        <div className={["widget no-padding"]}>
                            <LiveView currentDomain={punycode.toASCII(handle)} demoMode={demoMode} />
                        </div>
                    </div>
                        {(loading) ? <Loading style={{ height: "auto" }} /> : <Widget style={{height: "auto"}} totalNumber={demoMode ? `${data.Total > 9999 ? String(data?.Total).slice(0, 2) : String(data?.Total).slice(0, 1)}${data?.Total > 999 ? "k" : "**"}` : data?.Total.toLocaleString("de-DE")} overviewTotal={true} type="Total interactions" />}
                    <div className="grid-container grid-3">
                        {(loading) ? <Loading /> : <Widget totalNumber={data?.Accepted.toLocaleString("de-DE") + "%"} type="Accepted cookies" />}
                        {(loading) ? <Loading /> : <Widget totalNumber={data?.Declined.toLocaleString("de-DE") + "%"} type="Declined cookies" />}
                    </div>
                        <div className="grid-container grid-3" style={{ marginTop: "14px" }}>
                        {(loading) ? <Loading /> : <Widget totalNumber={data?.Marketing.toLocaleString("de-DE") + "%"} type="Accepted only Marketing" />}
                        {(loading) ? <Loading /> : <Widget totalNumber={data?.Functional.toLocaleString("de-DE") + "%"} type="Accepted only Functional" />}
                        {(loading) ? <Loading /> : <Widget totalNumber={data?.Statics.toLocaleString("de-DE") + "%"} type="Accepted only Statics" />}
                    </div>
                </>
                    
                }
            </div>
        </>
    ) : <NotAllowed />
}   