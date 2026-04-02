const { useState, useEffect, useRef, useContext } = React;
import { isJson } from "../../Functions/isJson.js";
import useFetch from "../../Functions/FetchHook";
import Unknown from "../../Components/Error/Unknown.js";
import NoDataFound from "../../Components/Error/NoDataFound.js";
import { Loading } from "../../Components/widget/Loading.js";
import API from "../../API/api.js";
import { reportsLinks } from "../Reports/Reports.js";
import "./Style.css";
import SideNav from "../../Components/Header/SideNav.js";
import StickyPageTitle from "../../Components/Header/Sticky";
import Filter from "../../Components/Filter/index.js";
import { DomainContext, OrganisationContext } from "../../App.js";
const useParams = window.ReactRouterDOM.useParams;
const urlParams = new URLSearchParams(window.location.search);

export default function UserConsents(props) {
    document.title = "Consents overview | Intastellar Consents";
    const settings = JSON.parse(localStorage.getItem("settings")) || { dateRange: 30 };
    const [currentDomain, setCurrentDomain] = useContext(DomainContext);
    const [organisation, setOrganisation] = useContext(OrganisationContext);
    const { handle, id } = useParams();
    const page = urlParams.get("page") || 1;

    const [activeData, setActiveData] = useState(null);
    const [getLastDays, setLastDays] = useState((localStorage.getItem("settings") != null) ? JSON.parse(localStorage.getItem("settings")).dateRange : 30);

    const today = new Date();
    const [fromDate, setFromDate] = useState(new Date(new Date().setDate(today.getDate() - settings?.dateRange)).toISOString().split("T")[0]);
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)).toISOString().split("T")[0]);

    const previousPeriod = new Date(new Date().setDate(today.getDate() - settings?.dateRange));
    const previousPeriod2 = new Date(new Date().setDate(today.getDate() - settings?.dateRange * 2));

    API[id].getDomainsUrl.headers.Domains = currentDomain;
    API[id].getDomainsUrl.headers.Offset = page;
    API[id].getDomainsUrl.headers.FromDate = fromDate;
    API[id].getDomainsUrl.headers.ToDate = toDate;

    const header = API[id].getDomainsUrl.headers;
    const url = API[id].getDomainsUrl.url;
    const method = API[id].getDomainsUrl.method;

    const [getDomainsUrlLoading, getDomainsUrlData, getDomainsUrlError, getDomainsUrlGetUpdated] = useFetch(5, API[id].getDomainsUrl.url, API[id].getDomainsUrl.method, API[id].getDomainsUrl.headers);
    useEffect(() => {
        if (getDomainsUrlData) {
            console.log(getDomainsUrlData);
            setActiveData(getDomainsUrlData);
        } else if(getDomainsUrlError) {
            setActiveData(getDomainsUrlError);
        }
    }, [getDomainsUrlData]);

    console.log(activeData);

    return (
        <>
            <SideNav links={reportsLinks} title="Reports" />
            <article style={{ flex: "1", maxWidth: "1200px", margin: "auto"}}>
                <StickyPageTitle title="Consents overview" numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setActiveData} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} previousPeriod={previousPeriod} previousPeriod2={previousPeriod2} />
                <div className="dashboard-content">
                    <section className="filter">
                        {/* <Filter url={url} method={method} header={header} numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setActiveData} date={{
                            start: fromDate,
                            end: toDate,
                            previousStart: previousPeriod,
                            previousEnd: previousPeriod2,
                        }} setFromDate={setFromDate} setToDate={setToDate} /> */}
                    </section>
                    {(getDomainsUrlLoading && !getDomainsUrlError) ? <Loading /> : (getDomainsUrlError) ? <Unknown /> : (getDomainsUrlData == "Err_No_Data_Found") ? <NoDataFound /> : <>
                        <div className="grid-container grid-3">
                            {
                                activeData?.map((d, key) => {

                                    let consent = "";
                                    if (isJson(d?.consent)) {
                                        consent = JSON.parse(d?.consent);
                                    } else {
                                        consent = d?.consent;
                                    }

                                    return (
                                        <>
                                            <div className="user" key={key}>
                                                {
                                                    d?.banner_policy_id != "" ? <p className="policy-id">Consent instance ID: {d?.banner_policy_id}</p> : <p>Consent instance ID: Unknown (Legacy Record)</p>
                                                }
                                                <p>Banner generated ID: {d?.uid}</p>
                                                <p>Country: {d?.country_code}</p>
                                                <p>Applied regulations: <span className="regulation">{d?.regulation_applied}</span></p>
                                                <p>Time: {new Date(d?.consents_timestamp).toLocaleString('de-DE', { timeZone: 'Europe/Copenhagen' })}</p>
                                                <p className="lb">Referrer: {d?.referrer.split("?")[0]}</p>
                                                <p className="lb">URL: {d?.url.split("?")[0].split("#")[0]}</p>
                                                <section>
                                                    {
                                                        (Object.prototype.toString.call(consent) === '[object Array]') ? consent?.map((c, key) => {
                                                            
                                                            return <p key={key}>{c?.type == "statics" ? "analytics" : c?.type} cookies: <strong>{(!c.checked) ? "Declined" : (c?.checked == "checked" || c?.checked == "1") ? "Accepted" : c?.checked}</strong></p>
                                                        }) : <p>{consent?.consent_type == "statics" ? "analytics" : consent?.consent_type} cookies: <strong>{(consent?.consent_value == "1" || consent?.consent_value == "checked") ? "Accepted" : "Declined"}</strong></p>
                                                    }
                                                </section>
                                                <p>Consent Version: <a className="link" href={d?.github_link} target="_blank" rel="noopener noreferrer">{d?.code_version}</a></p>
                                            </div>
                                        </>
                                    )
                                }).slice(0, 40)
                            }
                        </div>
                    </>}
                </div>
            </article>
        </>
    )
}