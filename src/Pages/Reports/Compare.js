const { useState, useEffect, useRef, useContext } = React;
import StickyPageTitle from '../../Components/Header/Sticky';
import API from '../../API/api';
import { DomainContext } from '../../App.js';
const useParams = window.ReactRouterDOM.useParams;
import Fetch from '../../Functions/fetch';
import punycode from 'punycode';

export default function Compare(props) {
    document.title = "Compare Domains | Intastellar Consents | CMP";
    const [currentDomain, setCurrentDomain] = useContext(DomainContext);
    const { handle, id } = useParams();
    const previousPeriod = new Date(new Date().setDate(new Date().getDate() - 30));
    const previousPeriod2 = new Date(new Date().setDate(new Date().getDate() - 60));
    const [activeData, setActiveData] = useState(null);
    const [activeDataCountry, setactiveDataCountry] = useState(null);
    const [getLastDays, setLastDays] = useState((localStorage.getItem("settings") != null) ? JSON.parse(localStorage.getItem("settings")).dateRange : 30);
    const today = new Date();
    const [fromDate, setFromDate] = useState(new Date(new Date().setDate(today.getDate() - getLastDays)));
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)));

    const [loading, setLoading] = useState(false);
    const [loadingCountry, setLoadingCountry] = useState(false);
    const [domains, setDomains] = useState([]);

    let url = API[id].getInteractions.url;
    let method = API[id].getInteractions.method;
    let header = API[id].getInteractions.headers;
    useEffect(() => {
        Fetch(API[window.location.pathname.split("/")[1]]?.getDomains?.url, API[window.location.pathname.split("/")[1]]?.getDomains?.method, API[window.location.pathname.split("/")[1]]?.getDomains?.headers).then((data) => {
            if (data === "Err_Login_Expired") {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }

            if (data.error === "Err_No_Domains") {

            } else {
                data.unshift({ domain: "all", installed: null, lastedVisited: null });
                data?.map((d) => {
                    return punycode.toUnicode(d.domain);
                }).filter((d) => {
                    return d !== undefined && d !== "" && d !== "undefined.";
                });
                setDomains(data);

                const allowedDomains = data?.map((d) => {
                    return punycode.toUnicode(d.domain);
                }).filter((d) => {
                    return d !== undefined && d !== "" && d !== "undefined." && d !== "all";
                });

            }
        });
    }, []);

    let domainList = null;
    domainList = domains?.map((d) => {
        return punycode.toUnicode(d.domain)
    })

    return (
        <>
            <StickyPageTitle loadingUpdated={loading} finalLoaded={loadingCountry} title="Home" url={url} method={method} header={header} numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setActiveData} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} previousPeriod={previousPeriod} previousPeriod2={previousPeriod2} />
            <div className="dashboard-content">
                <h1>Compare Domains</h1>
                <p>Compare the data of different domains to see how they perform against each other.</p>
                <p>To compare domains, select the domains you want to compare from the list below and click on the "Compare" button.</p>
                <p>Note: You can only compare up to 5 domains at a time.</p>
                <div className="compare-container">
                    <p className="compare-text">Select Domains to Compare:</p>
                    <div className="compare-domain-list">
                        {props?.domains?.map((domain, index) => (
                            <div key={index} className="compare-domain-item">
                                <input
                                    type="checkbox"
                                    id={`domain-${index}`}
                                    name={`domain-${index}`}
                                    value={domain}
                                    onChange={(e) => props?.handleDomainSelection(e, domain)}
                                />
                                <label htmlFor={`domain-${index}`}>{domain}</label>
                            </div>
                        ))}
                    </div>
                    <button className="btn" onClick={props?.handleCompare}>Compare</button>
                </div>
                <div className="compare-results">
                    {props?.comparisonData?.length > 0 ? (
                        <table className="compare-table">

                        </table>
                    ) : (
                        <p>No comparison data available. Please select domains to compare.</p>
                    )}
                </div>
            </div>
        </>
    );
}