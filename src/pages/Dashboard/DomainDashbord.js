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
const useParams = window.ReactRouterDOM.useParams;
const punycode = require("punycode");

export default function DomainDashbord(props) {
    const { handle, id } = useParams();
    document.title = `${punycode.toUnicode(handle)} Dashboard | Intastellar Consents | CMP`;
    const today = new Date();
    
    const [activeDataCountry, setactiveDataCountry] = useState(null);
    const [data, setActiveData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingCountry, setLoadingCountry] = useState(true);
    const [getLastDays, setLastDays] = useState((localStorage.getItem("settings") != null) ? JSON.parse(localStorage.getItem("settings")).dateRange : 30);
    const [fromDate, setFromDate] = useState(new Date(new Date().setDate(today.getDate() - getLastDays)));
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)));
    const previousPeriod = new Date(new Date().setDate(new Date().getDate() - 30));
    const previousPeriod2 = new Date(new Date().setDate(new Date().getDate() - 60));

    let url = API[id].getInteractions.url;
    let method = API[id].getInteractions.method;
    let header = API[id].getInteractions.headers;

    console.log(fromDate, toDate);

    API[id].getInteractions.headers.Domains = punycode.toASCII(handle);
    API[id].getInteractions.headers.FromDate = fromDate.toISOString().split("T")[0];
    API[id].getInteractions.headers.ToDate = toDate.toISOString().split("T")[0];

    console.log("Domain Dashboard data:", data);

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

    return (localStorage?.getItem("domains")?.includes(punycode.toUnicode(handle)) || handle == "all") ? (
        <>
            <StickyPageTitle loadingUpdated={loading} finalLoaded={loadingCountry} title={`Domain: ${punycode.toUnicode(handle)} | ${data?.bannerStyle}`} url={url} method={method} header={header} numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setactiveDataCountry} fromDate={data?.date.from || fromDate} toDate={data?.date.to || toDate} setFromDate={setFromDate} setToDate={setToDate} previousPeriod={previousPeriod} previousPeriod2={previousPeriod2} />
            <div className="dashboard-content">
                {
                    (!loading) ?
                        <div className={`grid-container grid-5`} style={{ gap: "10px", marginBottom: "20px" }}>

                            <Widget styleType="small" totalNumber={data} type="Total Consents Given" fromDate={fromDate} toDate={toDate} />
                            <Widget styleType="small" totalNumber={data?.Accepted.toLocaleString("de-DE") + "%"} type="Consent acceptance" fromDate={fromDate} toDate={toDate} />
                            <Widget styleType="small" totalNumber={data?.Declined.toLocaleString("de-DE") + "%"} type="Essential-only rate" fromDate={fromDate} toDate={toDate} />
                            <Widget styleType="small" totalNumber={data?.euUsers.toLocaleString("de-DE")} type="EU-based users" fromDate={fromDate} toDate={toDate} />
                            <Widget styleType="small" totalNumber={data?.noneEUUsers.toLocaleString("de-DE")} type="Non-EU-based users" fromDate={fromDate} toDate={toDate} />
                        </div> : 
                        <div className="grid-container grid-5" style={{ gap: "20px", marginBottom: "20px" }}>
                            <Loading small={true} />
                            <Loading small={true} />
                            <Loading small={true} />
                            <Loading small={true} />
                            <Loading small={true} />
                            <Loading small={true} />
                        </div>
                }
                {(loading) ? <Loading /> : (data.Total === 0) ? <h1>No interactions yet</h1> :
                    <>
                        <p>Date Range: {Intl.DateTimeFormat("da-DK").format(new Date(data.date.from))} - {Intl.DateTimeFormat("da-DK").format(new Date(data.date.to))}</p>
                        <Widget totalNumber={data.Total.toLocaleString("de-DE")} overviewTotal={true} type="Total interactions" />
                        <div className="grid-container grid-3">
                            {(loading) ? <Loading /> : <Widget totalNumber={data?.Accepted.toLocaleString("de-DE") + "%"} type="Accepted cookies" />}
                            {(loading) ? <Loading /> : <Widget totalNumber={data?.Declined.toLocaleString("de-DE") + "%"} type="Declined cookies" />}
                        </div>
                        <div className="grid-container grid-3">
                            {(loading) ? <Loading /> : <Widget totalNumber={data?.Marketing.toLocaleString("de-DE") + "%"} type="Accepted only Marketing" />}
                            {(loading) ? <Loading /> : <Widget totalNumber={data?.Functional.toLocaleString("de-DE") + "%"} type="Accepted only Functional" />}
                            {(loading) ? <Loading /> : <Widget totalNumber={data?.Statics.toLocaleString("de-DE") + "%"} type="Accepted only Statics" />}
                        </div>
                    </>
                }
                <div className="grid-container grid-3">
                    {<section>
                        {(loadingCountry) ? <Loading /> : (activeDataCountry?.data.Total === 0) ? null :
                            <section>
                                <h3>User interactions based on country</h3>
                                <div className={["widget no-padding grid-3-4"]}>
                                    <Map data={{

                                        Countries: activeDataCountry?.data?.Countries,
                                        total: activeDataCountry?.data?.Total,
                                    }} />
                                </div>
                            </section>
                        }
                    </section>}
                </div>
            </div>
        </>
    ) : <NotAllowed />
}   