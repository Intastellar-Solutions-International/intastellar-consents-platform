const { useState, useEffect, useRef, useContext, useCallback } = React;
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
import { DomainContext } from "../../App.js";
const useParams = window.ReactRouterDOM.useParams;

const PAGE_SIZE = 40;

export default function UserConsents(props) {
    document.title = "Consents overview | Intastellar Consents";
    const settings = JSON.parse(localStorage.getItem("settings")) || { dateRange: 30 };
    const [currentDomain, setCurrentDomain] = useContext(DomainContext);
    const { handle, id } = useParams();

    const [activeData, setActiveData] = useState(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const [getLastDays, setLastDays] = useState((localStorage.getItem("settings") != null) ? JSON.parse(localStorage.getItem("settings")).dateRange : 30);

    const today = new Date();
    const [fromDate, setFromDate] = useState(new Date(new Date().setDate(today.getDate() - settings?.dateRange)).toISOString().split("T")[0]);
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)).toISOString().split("T")[0]);

    const previousPeriod = new Date(new Date().setDate(today.getDate() - settings?.dateRange));
    const previousPeriod2 = new Date(new Date().setDate(today.getDate() - settings?.dateRange * 2));

    API[id].getDomainsUrl.headers.Domains = currentDomain;
    API[id].getDomainsUrl.headers.Offset = "0";
    API[id].getDomainsUrl.headers.Limit = String(PAGE_SIZE);
    API[id].getDomainsUrl.headers.FromDate = fromDate;
    API[id].getDomainsUrl.headers.ToDate = toDate;

    const url = API[id].getDomainsUrl.url;
    const method = API[id].getDomainsUrl.method;

    const [getDomainsUrlLoading, getDomainsUrlData, getDomainsUrlError, getDomainsUrlGetUpdated] = useFetch(5, API[id].getDomainsUrl.url, API[id].getDomainsUrl.method, API[id].getDomainsUrl.headers);

    useEffect(() => {
        if (getDomainsUrlError) {
            setActiveData(getDomainsUrlError);
            return;
        }
        if (getDomainsUrlData === undefined) {
            return;
        }
        if (getDomainsUrlData === "Err_No_Data_Found") {
            setActiveData([]);
            setHasMore(false);
            return;
        }
        if (Array.isArray(getDomainsUrlData)) {
            setActiveData(getDomainsUrlData);
            setHasMore(getDomainsUrlData.length === PAGE_SIZE);
        }
    }, [getDomainsUrlData, getDomainsUrlError]);

    const dataLengthRef = useRef(0);
    useEffect(() => {
        if (Array.isArray(activeData)) {
            dataLengthRef.current = activeData.length;
        }
    }, [activeData]);

    const loadingMoreRef = useRef(false);
    useEffect(() => {
        loadingMoreRef.current = loadingMore;
    }, [loadingMore]);

    const hasMoreRef = useRef(true);
    useEffect(() => {
        hasMoreRef.current = hasMore;
    }, [hasMore]);

    const appendNextBatch = useCallback(async () => {
        if (loadingMoreRef.current || !hasMoreRef.current || getDomainsUrlLoading) {
            return;
        }
        setLoadingMore(true);
        try {
            const offset = dataLengthRef.current;
            const headers = {
                ...API[id].getDomainsUrl.headers,
                Domains: currentDomain,
                Offset: String(offset),
                Limit: String(PAGE_SIZE),
                FromDate: fromDate,
                ToDate: toDate,
            };
            const res = await fetch(url, { method, headers });
            if (res.status === 401) {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            if (!res.ok) {
                setHasMore(false);
                return;
            }
            const batch = await res.json();
            if (batch === "Err_No_Data_Found" || !Array.isArray(batch) || batch.length === 0) {
                setHasMore(false);
                return;
            }
            setActiveData((prev) => (Array.isArray(prev) ? [...prev, ...batch] : batch));
            setHasMore(batch.length === PAGE_SIZE);
        } catch (e) {
            setHasMore(false);
        } finally {
            setLoadingMore(false);
        }
    }, [currentDomain, fromDate, toDate, id, getDomainsUrlLoading, method, url]);

    useEffect(() => {
        const onScroll = () => {
            if (getDomainsUrlLoading || loadingMoreRef.current || !hasMoreRef.current) {
                return;
            }
            const doc = document.documentElement;
            if (window.innerHeight + window.scrollY < doc.scrollHeight - 240) {
                return;
            }
            void appendNextBatch();
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, [appendNextBatch, getDomainsUrlLoading]);

    return (
        <>
            <SideNav links={reportsLinks} title="Reports" />
            <article style={{ flex: "1"}}>
                <StickyPageTitle loadingUpdated={getDomainsUrlLoading} finalLoaded={getDomainsUrlLoading} title="Consents overview" numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setActiveData} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} previousPeriod={previousPeriod} previousPeriod2={previousPeriod2} />
                <div className="dashboard-content">
                    <section className="filter">
                        {/* <Filter url={url} method={method} header={header} numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setActiveData} date={{
                            start: fromDate,
                            end: toDate,
                            previousStart: previousPeriod,
                            previousEnd: previousPeriod2,
                        }} setFromDate={setFromDate} setToDate={setToDate} /> */}
                    </section>
                    {(getDomainsUrlLoading && !getDomainsUrlError) ? 
                        <div className="user-consents-grid">
                            <Loading />
                            <Loading />
                            <Loading />
                            <Loading />
                            <Loading />
                            <Loading />
                            <Loading />
                            <Loading />
                        </div>
                    : (getDomainsUrlError) ? <Unknown /> : (getDomainsUrlData == "Err_No_Data_Found") ? <NoDataFound /> : <>
                        <div className="user-consents-grid">
                            {
                                activeData?.map((d, key) => {
                                    let consent = "";
                                    if (isJson(d?.consent)) {
                                        consent = JSON.parse(d?.consent);
                                    } else {
                                        consent = d?.consent;
                                    }

                                    const referrerClean = d?.referrer ? String(d.referrer).split("?")[0] : "—";
                                    const urlClean = d?.url ? String(d.url).split("?")[0].split("#")[0] : "—";
                                    const timeStr = d?.consents_timestamp
                                        ? new Date(d.consents_timestamp).toLocaleString("de-DE", { timeZone: "Europe/Copenhagen" })
                                        : "—";

                                    const consentLabel = (t) => (t === "statics" ? "analytics" : t);

                                    return (
                                        <div className="user-consent-card" key={d?.uid || `${key}-${d?.banner_policy_id || ""}`}>
                                            <header className="user-consent-card__header">
                                                <span className="user-consent-card__badge">
                                                    {d?.banner_policy_id ? `ID ${d.banner_policy_id}` : "Legacy record"}
                                                </span>
                                                <span className="user-consent-card__uid" title={d?.uid}>UID {d?.uid ?? "—"}</span>
                                            </header>

                                            <dl className="user-consent-card__meta">
                                                <div className="user-consent-card__row">
                                                    <dt>Country</dt>
                                                    <dd>{d?.country_code ?? "—"}</dd>
                                                </div>
                                                <div className="user-consent-card__row">
                                                    <dt>Regulation</dt>
                                                    <dd><span className="regulation">{d?.regulation_applied ?? "—"}</span></dd>
                                                </div>
                                                <div className="user-consent-card__row">
                                                    <dt>Time</dt>
                                                    <dd>{timeStr}</dd>
                                                </div>
                                            </dl>

                                            <div className="user-consent-card__urls">
                                                <div className="user-consent-card__url-block">
                                                    <span className="user-consent-card__url-label">Referrer</span>
                                                    <span className="user-consent-card__url-text" title={referrerClean}>{referrerClean}</span>
                                                </div>
                                                <div className="user-consent-card__url-block">
                                                    <span className="user-consent-card__url-label">URL</span>
                                                    <span className="user-consent-card__url-text" title={urlClean}>{urlClean}</span>
                                                </div>
                                            </div>

                                            <section className="user-consent-card__choices" aria-label="Cookie choices">
                                                <h4 className="user-consent-card__choices-title">Choices</h4>
                                                {(Object.prototype.toString.call(consent) === "[object Array]") ? (
                                                    <ul className="user-consent-card__choice-list">
                                                        {consent?.map((c, i) => {
                                                            const accepted = c?.checked === "checked" || c?.checked === "1" || c?.checked === true;
                                                            const declined = !c?.checked;
                                                            const status = declined ? "declined" : accepted ? "accepted" : "mixed";
                                                            const label = consentLabel(c?.type);
                                                            return (
                                                                <li key={i} className="user-consent-card__choice-item">
                                                                    <span className="user-consent-card__choice-name">{label}</span>
                                                                    <span className={`user-consent-card__pill user-consent-card__pill--${status}`}>
                                                                        {declined ? "Declined" : accepted ? "Accepted" : String(c?.checked ?? "")}
                                                                    </span>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                ) : (
                                                    <ul className="user-consent-card__choice-list">
                                                        <li className="user-consent-card__choice-item">
                                                            <span className="user-consent-card__choice-name">{consentLabel(consent?.consent_type)}</span>
                                                            <span className={`user-consent-card__pill ${(consent?.consent_value == "1" || consent?.consent_value == "checked") ? "user-consent-card__pill--accepted" : "user-consent-card__pill--declined"}`}>
                                                                {(consent?.consent_value == "1" || consent?.consent_value == "checked") ? "Accepted" : "Declined"}
                                                            </span>
                                                        </li>
                                                    </ul>
                                                )}
                                            </section>

                                            <footer className="user-consent-card__footer">
                                                <span className="user-consent-card__version-label">Version</span>
                                                {d?.github_link ? (
                                                    <a className="link user-consent-card__version-link" href={d.github_link} target="_blank" rel="noopener noreferrer">{d?.code_version ?? "—"}</a>
                                                ) : (
                                                    <span>{d?.code_version ?? "—"}</span>
                                                )}
                                            </footer>
                                        </div>
                                    );
                                })
                            }
                        </div>
                        {loadingMore ? (
                            <div className="user-consents-load-more" role="status" aria-live="polite">
                                <Loading />
                            </div>
                        ) : null}
                    </>}
                </div>
            </article>
        </>
    )
}
