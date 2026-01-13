const { useState, useEffect, useRef, useContext } = React;
import API from "../../API/api";
const useParams = window.ReactRouterDOM.useParams;
import { DomainContext, OrganisationContext } from "../../App.js";
import useFetch from "../../Functions/FetchHook";
import Table from "../../Components/Tabel/index.js";
import StickyPageTitle from "../../Components/Header/Sticky";
import Widget from "../../Components/widget/widget.js";
import Select from "../../Components/SelectInput/Selector.js";

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

    useEffect(() => {
        API[id].getCookies.headers.Domains = currentDomain;
        API[id].getCookies.headers.FromDate = new Date(fromDate).toISOString().split("T")[0];
        API[id].getCookies.headers.ToDate = new Date(toDate).toISOString().split("T")[0];
        header = API[id].getCookies.headers;
        url = API[id].getCookies.url;
        method = API[id].getCookies.method;

        fetch(url, {
            method: method,
            headers: header
        })
            .then(response => response.json())
            .then(data => {
                console.log("Fetched cookie data:", data);
                setActiveData(data);
            })
            .catch(error => {
                console.error("Error fetching cookie data:", error);
            });

    }, [fromDate, toDate]);
    const [loading, data, error, getUpdated] = useFetch(5, url, method, header);

    useEffect(() => {
        if (data) {
            console.log(data);
            setActiveData(data);
        } else if (error) {
            setActiveData(error);
        }
    }, [data]);

    function filterDataByDomain(domain) {

        if (domain == "clear filter") {
            setActiveData(activeData);
            return;
        }

        if (!activeData || !activeData?.domains) return null;
        return activeData?.domains[domain] || null;
    }

    const [defaultValue, setDefaultValue] = useState("Select a Domain");

    return (
        <>
            <StickyPageTitle title="Cookies Dashboard" numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setActiveData} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} previousPeriod={previousPeriod} previousPeriod2={previousPeriod2} />
            <div className="dashboard-content">
                {
                    !loading ? activeData.status == "success" ? <>
                        <Select
                            defaultValue={defaultValue}
                            key={""}
                            items={["clear filter", ...Object.keys(activeData.domains)]}
                            onChange={(e) => {
                                console.log("Selected domain:", e);
                                if (e === "Select a Domain" || e === "clear filter") {
                                    // Clear filter, show all domains
                                    setDefaultValue("clear filter");
                                    setCurrentDomain(null);
                                } else {
                                    filterDataByDomain(e);
                                    setDefaultValue(e);
                                    setCurrentDomain(e);
                                }
                            }}
                        />
                        <div className="grid-container grid-cols-2">
                            {
                                !loading && activeData.status === "success" ?
                                    Object.entries(activeData.domains).map(([domain, domainData], idx) => (
                                        <div key={domain} className="domain-group">
                                            <h3 style={{marginTop: '2em'}}>{domain}</h3>
                                            <div className="grid-container grid-cols-3 warnings-findings" style={{ marginBottom: "20px" }}>
                                                {domainData.findings && domainData.findings.map((finding, index) => (
                                                    <p key={index}>{finding}</p>
                                                ))}
                                            </div>
                                            <div className="grid-container grid-cols-2">
                                                {domainData.warnings && (() => {
                                                    const severityOrder = ["critical", "high", "medium", "low", "info"];
                                                    const sortedWarnings = [...domainData.warnings].sort((a, b) => {
                                                        const aIndex = severityOrder.indexOf((a.severity || '').toLowerCase());
                                                        const bIndex = severityOrder.indexOf((b.severity || '').toLowerCase());
                                                        return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
                                                    });
                                                    return sortedWarnings.map((warning, index) => (
                                                        <p key={index}>
                                                            <span className={"warning " + warning.severity}></span>
                                                            {warning.message}
                                                        </p>
                                                    ));
                                                })()}
                                            </div>
                                            <div className="stats-overview grid-container grid-cols-4" style={{ marginBottom: "20px" }}>
                                                <Widget type="First-party cookies" totalNumber={domainData.firstPartyCookies} />
                                                <Widget type="Third-party cookies" totalNumber={domainData.thirdPartyCookies} />
                                                <Widget type="Pre-consent cookies" totalNumber={domainData.preConsent} />
                                                <Widget type="Post-consent cookies" totalNumber={domainData.postConsent} />
                                            </div>
                                            <Table data={domainData.data.map((cookie, index) => ({
                                                name: cookie.name,
                                                origin: cookie.origin,
                                                domain: cookie.domain,
                                                firstSeen: cookie.firstSeen,
                                                lastSeen: cookie.lastSeen,
                                                seenPostConsent: cookie.seenPostConsent == 1 ? "Yes" : "No",
                                                seenPreConsent: cookie.seenPreConsent == 1 ? "Yes" : "No"
                                            }))} headers={["Cookie", "first- / third-party", "Domain", "First Seen", "Last Seen", "Seen Post Consent", "Seen Pre Consent"]} />
                                        </div>
                                    ))
                                    .filter(domainData => {
                                        // Show all domains if 'clear filter' is selected
                                        if (defaultValue === "clear filter") return true;
                                        // Show all domains if 'Select a Domain' is selected
                                        if (defaultValue === "Select a Domain") return true;
                                        // Otherwise, show only the selected/current domain
                                        return domainData.key === defaultValue || domainData.key === currentDomain;
                                    })
                                    : <div className="loading"></div>
                            }
                        </div>
                    </> : <p>No data found for the selected domain(s) and date range.</p> : <p>Loading...</p>
                }
            </div>
        </>
    )
}