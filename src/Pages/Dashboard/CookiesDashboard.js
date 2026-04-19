const { useState, useEffect } = React;
import API from "../../API/api";
const useParams = window.ReactRouterDOM.useParams;
import StickyPageTitle from "../../Components/Header/Sticky";
import { defaultCompareWindowForPrimary } from "../../Components/Filter/filterDatePresets.js";
import Widget from "../../Components/widget/widget.js";
import Select from "../../Components/SelectInput/Selector.js";
import Table from "../../Components/Tabel/index.js";
import "./CookiesDashboard.css";

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

function sortWarnings(warnings) {
    if (!warnings?.length) return [];
    return [...warnings].sort((a, b) => {
        const aIndex = SEVERITY_ORDER.indexOf(String(a.severity || "").toLowerCase());
        const bIndex = SEVERITY_ORDER.indexOf(String(b.severity || "").toLowerCase());
        return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    });
}

function warningRowClass(severity) {
    const s = String(severity || "").toLowerCase();
    if (["critical", "high", "medium", "low", "info"].includes(s)) {
        return `cookies-warnings__item cookies-warnings__item--${s}`;
    }
    return "cookies-warnings__item cookies-warnings__item--unknown";
}

export default function CookiesDashboard() {
    document.title = "Cookies | Intastellar Consents";
    const { id } = useParams();
    const [activeData, setActiveData] = useState(null);
    const [loading, setLoading] = useState(true);
    const settings = JSON.parse(localStorage.getItem("settings")) || { dateRange: 30 };
    const initialLastDays =
        localStorage.getItem("settings") != null ? JSON.parse(localStorage.getItem("settings")).dateRange : 30;
    const [getLastDays, setLastDays] = useState(initialLastDays);

    const [domainFilter, setDomainFilter] = useState("combined view");

    const today = new Date();
    const [fromDate, setFromDate] = useState(new Date(new Date().setDate(today.getDate() - settings?.dateRange)));
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)));
    const [compareRange, setCompareRange] = useState(0);
    const [previousPeriod, setPreviousPeriod] = useState(() =>
        defaultCompareWindowForPrimary(
            new Date(new Date().setDate(new Date().getDate() - settings?.dateRange)),
            new Date(new Date().setDate(new Date().getDate() - 1))
        ).start
    );
    const [previousPeriod2, setPreviousPeriod2] = useState(() =>
        defaultCompareWindowForPrimary(
            new Date(new Date().setDate(new Date().getDate() - settings?.dateRange)),
            new Date(new Date().setDate(new Date().getDate() - 1))
        ).end
    );

    useEffect(() => {
        let cancelled = false;
        const domainsHeader =
            domainFilter === "Select a Domain" || domainFilter == null ? "combined view" : domainFilter;

        API[id].getCookies.headers.Domains = domainsHeader;
        API[id].getCookies.headers.FromDate = fromDate.toISOString().split("T")[0];
        API[id].getCookies.headers.ToDate = toDate.toISOString().split("T")[0];

        const url = API[id].getCookies.url;
        const method = API[id].getCookies.method;
        const headers = API[id].getCookies.headers;

        setLoading(true);
        fetch(url, { method, headers })
            .then((response) => response.json())
            .then((data) => {
                if (!cancelled) setActiveData(data);
            })
            .catch(() => {
                if (!cancelled) setActiveData(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [fromDate, toDate, domainFilter, id]);

    const domainItems =
        activeData?.status === "success" && activeData?.domains
            ? ["combined view", ...Object.keys(activeData.domains)]
            : ["combined view"];

    const showAllDomains =
        domainFilter === "combined view" || domainFilter === "Select a Domain" || domainFilter == null;

    const visibleEntries =
        activeData?.status === "success" && activeData?.domains
            ? Object.entries(activeData.domains).filter(([domain]) => showAllDomains || domain === domainFilter)
            : [];

    return (
        <>
            <StickyPageTitle
                title="Cookies Dashboard"
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                setActiveData={setActiveData}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
                previousPeriod={previousPeriod}
                previousPeriod2={previousPeriod2}
                compareRange={compareRange}
                setCompareRange={setCompareRange}
                setCompareWindowStart={setPreviousPeriod}
                setCompareWindowEnd={setPreviousPeriod2}
            />
            <div className="dashboard-content cookies-dashboard">
                {loading ? (
                    <p className="cookies-dashboard__loading">Loading…</p>
                ) : activeData?.status === "success" ? (
                    <>
                        <div className="cookies-dashboard__toolbar">
                            <p className="cookies-dashboard__toolbar-label">Domain scope</p>
                            <Select
                                defaultValue={domainFilter === "Select a Domain" ? "combined view" : domainFilter}
                                items={domainItems}
                                onChange={(e) => {
                                    if (e === "Select a Domain" || e === "combined view") {
                                        setDomainFilter("combined view");
                                    } else {
                                        setDomainFilter(e);
                                    }
                                }}
                            />
                        </div>

                        <div className="cookies-dashboard__domains">
                            {visibleEntries.length === 0 ? (
                                <p className="cookies-dashboard__empty">No domains match the current filter.</p>
                            ) : null}
                            {visibleEntries.map(([domain, domainData]) => {
                                const findings = domainData.findings || [];
                                const sortedWarnings = sortWarnings(domainData.warnings);
                                const rows = (domainData.data || []).map((cookie) => ({
                                    name: cookie.name,
                                    origin: cookie.origin,
                                    domain: cookie.domain,
                                    firstSeen: cookie.firstSeen,
                                    lastSeen: cookie.lastSeen,
                                    seenPostConsent: cookie.seenPostConsent == 1 ? "Yes" : "No",
                                    seenPreConsent: cookie.seenPreConsent == 1 ? "Yes" : "No",
                                }));

                                return (
                                    <section className="cookies-domain-card" key={domain}>
                                        <header className="cookies-domain-card__head">
                                            <h2 className="cookies-domain-card__title">{domain}</h2>
                                        </header>
                                        <div className="cookies-domain-card__body">
                                            {findings.length > 0 ? (
                                                <div className="cookies-section">
                                                    <h3 className="cookies-section__title">Findings</h3>
                                                    <ul className="cookies-findings">
                                                        {findings.map((finding, index) => (
                                                            <li key={index} className="cookies-findings__item">
                                                                {finding}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            ) : null}

                                            {sortedWarnings.length > 0 ? (
                                                <div className="cookies-section">
                                                    <h3 className="cookies-section__title">Warnings</h3>
                                                    <ul className="cookies-warnings">
                                                        {sortedWarnings.map((warning, index) => (
                                                            <li
                                                                key={index}
                                                                className={warningRowClass(warning.severity)}
                                                            >
                                                                <span
                                                                    className="cookies-warnings__dot"
                                                                    aria-hidden
                                                                />
                                                                <span>{warning.message}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            ) : null}

                                            <div className="cookies-section">
                                                <h3 className="cookies-section__title">Overview</h3>
                                                <div className="cookies-stats">
                                                    <Widget type="First-party cookies" totalNumber={domainData.firstPartyCookies} />
                                                    <Widget type="Third-party cookies" totalNumber={domainData.thirdPartyCookies} />
                                                    <Widget type="Pre-consent cookies" totalNumber={domainData.preConsent} />
                                                    <Widget type="Post-consent cookies" totalNumber={domainData.postConsent} />
                                                </div>
                                            </div>

                                            <div className="cookies-section">
                                                <h3 className="cookies-section__title">Cookie inventory</h3>
                                                <div className="cookies-table-wrap">
                                                    <Table
                                                        data={rows}
                                                        headers={[
                                                            "Cookie",
                                                            "first- / third-party",
                                                            "Domain",
                                                            "First Seen",
                                                            "Last Seen",
                                                            "Seen Post Consent",
                                                            "Seen Pre Consent",
                                                        ]}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <p className="cookies-dashboard__empty">No data found for the selected domain(s) and date range.</p>
                )}
            </div>
        </>
    );
}
