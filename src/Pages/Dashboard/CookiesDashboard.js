const { useState, useEffect, useRef, useContext } = React;
import API from "../../API/api";
const useParams = window.ReactRouterDOM.useParams;
import { DomainContext, OrganisationContext } from "../../App.js";
import useFetch from "../../Functions/FetchHook";
import Table from "../../Components/Tabel/index.js";
import StickyPageTitle from "../../Components/Header/Sticky";

export default function CookiesDashboard() {
    document.title = "Cookies | Intastellar Consents";
    const { handle, id } = useParams();
    const [organisation, setOrganisation] = useContext(OrganisationContext);
    const [currentDomain, setCurrentDomain] = useContext(DomainContext);
    const [activeData, setActiveData] = useState(null);
    const settings = JSON.parse(localStorage.getItem("settings")) || { dateRange: 30 };
    const [getLastDays, setLastDays] = useState((localStorage.getItem("settings") != null) ? JSON.parse(localStorage.getItem("settings")).dateRange : 30);

    const today = new Date();
    const [fromDate, setFromDate] = useState(new Date(new Date().setDate(today.getDate() - settings?.dateRange)).toISOString().split("T")[0]);
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)).toISOString().split("T")[0]);

    const previousPeriod = new Date(new Date().setDate(today.getDate() - settings?.dateRange));
    const previousPeriod2 = new Date(new Date().setDate(today.getDate() - settings?.dateRange * 2));

    API[id].getCookies.headers.Domains = currentDomain;
    let url = API[id].getCookies.url;
    let method = API[id].getCookies.method;
    let header = API[id].getCookies.headers;
    let consent = null;

    const [loading, data, error, getUpdated] = useFetch(5, url, method, header);

    return (
        <>
            <StickyPageTitle title="Cookies Dashboard" numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setActiveData} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} previousPeriod={previousPeriod} previousPeriod2={previousPeriod2} />
            <div className="dashboard-content">
                {
                    !loading ? data.status == "success" ? <>
                        {
                            <Table data={data.data.map((cookie, index) => {
                                console.log("Cookie data:", data.data);
                                return {
                                    name: cookie.name,
                                    origin: cookie.origin,
                                    domain: cookie.domain,
                                    firstSeen: cookie.firstSeen,
                                    lastSeen: cookie.lastSeen,
                                    seenPostConsent: cookie.seenPostConsent == 1 ? "Yes" : "No",
                                    seenPreConsent: cookie.seenPreConsent == 1 ? "Yes" : "No"
                                }
                            })} headers={["Cookie", "Type", "Domain", "First Seen", "Last Seen", "Seen Post Consent", "Seen Pre Consent"]} />
                        }
                    </> : null : <div className="loading"></div>
                }
            </div>
        </>
    )
}