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

    const [comparisonData, setComparisonData] = useState(null);

    function handleDomainSelection(event, domain) {
        if (event.target) {
            setDomains((prevDomains) => [...prevDomains, domain]);
        } else {
            setDomains((prevDomains) => prevDomains.filter((d) => d !== domain));
        }
    }

    function handleDomainCompare() {
        // Handle domain comparison logic here
        console.log("Comparing domains:", domains);

        API[id].compareDomains.headers.FromDate = fromDate.toISOString().split("T")[0];
        API[id].compareDomains.headers.ToDate = toDate.toISOString().split("T")[0];

        // You can fetch comparison data from the API and update the state accordingly
        Fetch(API[id].compareDomains.url, API[id].compareDomains.method, API[id].compareDomains.headers, JSON.stringify({
            domains: domains
        })).then((data) => {
            if (data === "Err_Login_Expired") {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            setActiveData(data);
            setComparisonData(data);
        });
    }

    let url = API[id].getInteractions.url;
    let method = API[id].getInteractions.method;
    let header = API[id].getInteractions.headers;

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
                        <select onChange={(e) => handleDomainSelection(e, e.target.value)}>
                            <option value="" disabled selected>Select domain</option>
                            {props?.domains?.filter((domain) => domain.domain != "all")?.map((domain, index) => (
                                <option key={index} value={domain.domain}
                                    disabled={
                                        domains.includes(domain.domain)
                                    }
                                >
                                    {domain.domain}
                                </option>
                            ))}
                        </select>
                        <select onChange={(e) => handleDomainSelection(e, e.target.value)}>
                            <option value="" disabled selected>Select domain</option>
                            {props?.domains?.filter((domain) => domain.domain != "all")?.map((domain, index) => (
                                <option key={index} value={domain.domain}
                                    disabled={
                                        domains.includes(domain.domain)
                                    }
                                >
                                    {domain.domain}
                                </option>
                            ))}
                        </select>
                        <select onChange={(e) => handleDomainSelection(e, e.target.value)}>
                            <option value="" disabled selected>Select domain</option>
                            {props?.domains?.filter((domain) => domain.domain != "all")?.map((domain, index) => (
                                <option key={index} value={domain.domain}
                                    disabled={
                                        domains.includes(domain.domain)
                                    }
                                >
                                    {domain.domain}
                                </option>
                            ))}
                        </select>
                        <select onChange={(e) => handleDomainSelection(e, e.target.value)}>
                            <option value="" disabled selected>Select domain</option>
                            {props?.domains?.filter((domain) => domain.domain != "all")?.map((domain, index) => (
                                <option key={index} value={domain.domain}
                                    disabled={
                                        domains.includes(domain.domain)
                                    }
                                >
                                    {domain.domain}
                                </option>
                            ))}
                        </select>
                        <select onChange={(e) => handleDomainSelection(e, e.target.value)}>
                            <option value="" disabled selected>Select domain</option>
                            {props?.domains?.filter((domain) => domain.domain != "all")?.map((domain, index) => (
                                <option key={index} value={domain.domain}
                                    disabled={
                                        domains.includes(domain.domain)
                                    }
                                >
                                    {domain.domain}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button className="btn" onClick={handleDomainCompare}>Compare</button>
                </div>
                <div className="compare-results">
                    <h2>Comparison Results:</h2>
                    {comparisonData?.length > 0 ? (
                        <div className="compare-analysis grid-container">
                            {/* Summary Cards */}
                            <div className={`compare-summary-cards grid-container grid-cols-${Math.min(comparisonData.length, 5)}`}>
                                {comparisonData.map((domain, index) => (
                                    <div key={index} className="compare-card">
                                        <div className="compare-card-header">
                                            <h3>{domain.name}</h3>
                                            <span className="total-interactions">{Intl.NumberFormat().format(domain.Total)} total interactions</span>
                                        </div>
                                        <div className="compare-card-stats">
                                            <div className="stat-item">
                                                <span className="stat-label">Accepted: </span>
                                                <span className={`stat-value ${domain.Accepted > 50 ? 'high' : 'low'}`}>
                                                    {domain.Accepted}%
                                                </span>
                                            </div>
                                            <div className="stat-item">
                                                <span className="stat-label">Declined: </span>
                                                <span className={`stat-value ${domain.Declined > 50 ? 'high' : 'low'}`}>
                                                    {domain.Declined}%
                                                </span>
                                            </div>
                                            <div className="stat-item">
                                                <span className="stat-label">Functional: </span>
                                                <span className={`stat-value ${domain.Functional > 50 ? 'high' : 'low'}`}>
                                                    {domain.Functional}%
                                                </span>
                                            </div>
                                            <div className="stat-item">
                                                <span className="stat-label">Marketing: </span>
                                                <span className={`stat-value ${domain.Marketing > 50 ? 'high' : 'low'}`}>
                                                    {domain.Marketing}%
                                                </span>
                                            </div>
                                            <div className="stat-item">
                                                <span className="stat-label">Statistics: </span>
                                                <span className={`stat-value ${domain.Statistics > 50 ? 'high' : 'low'}`}>
                                                    {domain.Statics}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Detailed Comparison Table */}
                            <div className="compare-table-container">
                                <h3>Detailed Comparison</h3>
                                <table className="compare-table">
                                    <thead>
                                        <tr>
                                            <th>Domain</th>
                                            <th>Total</th>
                                            <th>Accepted (%)</th>
                                            <th>Declined (%)</th>
                                            <th>Marketing (%)</th>
                                            <th>Functional (%)</th>
                                            <th>Statistics (%)</th>
                                            <th>Primary Device</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {comparisonData.map((domain, index) => {
                                            const primaryDevice = Object.keys(domain.device_type.deviceTypeNum)
                                                .reduce((a, b) => domain.device_type.deviceTypeNum[a] > domain.device_type.deviceTypeNum[b] ? a : b);

                                            return (
                                                <tr key={index}>
                                                    <td className="domain-name">{domain.name}</td>
                                                    <td>{domain.Total}</td>
                                                    <td className={domain.Accepted > 50 ? 'positive' : 'negative'}>
                                                        {domain.Accepted}%
                                                    </td>
                                                    <td className={domain.Declined > 50 ? 'negative' : 'positive'}>
                                                        {domain.Declined}%
                                                    </td>
                                                    <td>{domain.Marketing}%</td>
                                                    <td>{domain.Functional}%</td>
                                                    <td>{domain.Statics}%</td>
                                                    <td>
                                                        {primaryDevice} ({domain.device_type.deviceTypeNum[primaryDevice]}%)
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Device Type Breakdown */}
                            <div className="device-comparison">
                                <h3>Device Type Distribution</h3>
                                <div className="device-charts">
                                    {comparisonData.map((domain, index) => (
                                        <div key={index} className="device-chart">
                                            <h4>{domain.name}</h4>
                                            <div className="device-stats">
                                                <div className="device-bar">
                                                    <div className="device-segment mobile"
                                                        style={{ width: `${domain.device_type.deviceTypeNum.mobile}%` }}>
                                                        <span>Mobile: {domain.device_type.deviceTypeNum.mobile}%</span>
                                                    </div>
                                                    <div className="device-segment tablet"
                                                        style={{ width: `${domain.device_type.deviceTypeNum.tablet}%` }}>
                                                        <span>Tablet: {domain.device_type.deviceTypeNum.tablet}%</span>
                                                    </div>
                                                    <div className="device-segment desktop"
                                                        style={{ width: `${domain.device_type.deviceTypeNum.desktop}%` }}>
                                                        <span>Desktop: {domain.device_type.deviceTypeNum.desktop}%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Interaction Numbers */}
                            <div className="interaction-comparison">
                                <h3>Raw Interaction Numbers</h3>
                                <div className="interaction-grid">
                                    {comparisonData.map((domain, index) => (
                                        <div key={index} className="interaction-card">
                                            <h4>{domain.name}</h4>
                                            <div className="interaction-numbers">
                                                <div className="number-item">
                                                    <span className="number-label">Accepted</span>
                                                    <span className="number-value">{domain.interactions_number.accept}</span>
                                                </div>
                                                <div className="number-item">
                                                    <span className="number-label">Declined</span>
                                                    <span className="number-value">{domain.interactions_number.decline}</span>
                                                </div>
                                                <div className="number-item">
                                                    <span className="number-label">Marketing</span>
                                                    <span className="number-value">{domain.interactions_number.marketing}</span>
                                                </div>
                                                <div className="number-item">
                                                    <span className="number-label">Functional</span>
                                                    <span className="number-value">{domain.interactions_number.functional}</span>
                                                </div>
                                                <div className="number-item">
                                                    <span className="number-label">Statistics</span>
                                                    <span className="number-value">{domain.interactions_number.statics}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p>No comparison data available. Please select domains to compare.</p>
                    )}
                </div>
            </div>
        </>
    );
}