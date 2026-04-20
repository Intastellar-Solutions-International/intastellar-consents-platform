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
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner.js";
import Authentication from "../../Authentication/Auth.js";
import { buildDemoConsentList, buildDemoConsentRecord } from "./userConsentsDemo.js";
import {
    useSyncDomainFromRoute,
    isCombinedOrClearDomain,
    consentsDomainFromRoute,
    toDomainsApiHeader,
} from "../../Functions/domainPathSegments.js";
import { defaultCompareWindowForPrimary } from "../../Components/Filter/filterDatePresets.js";
import { FRAMEWORK_IDS, frameworksForAuditRow } from "../../components/AuditSnapshotCard/complianceRegions.js";
import punycode from "punycode";

const { useState, useEffect, useRef, useContext, useCallback, useMemo } = React;
const useParams = window.ReactRouterDOM.useParams;
const PAGE_SIZE = 40;

function consentDateKey(d) {
    if (d == null) return "";
    if (d instanceof Date && Number.isFinite(d.getTime())) return d.toISOString().split("T")[0];
    return String(d).split("T")[0];
}

/** Parse consent time for sorting (newest first). */
function consentTimestampMs(row) {
    const t = row?.consents_timestamp;
    if (t == null || t === "") return 0;
    const ms = new Date(t).getTime();
    return Number.isFinite(ms) ? ms : 0;
}

/** Newest decisions first so “yesterday” appears before older days while scrolling loads more. */
function sortConsentsNewestFirst(rows) {
    if (!Array.isArray(rows)) return rows;
    return [...rows].sort((a, b) => {
        const d = consentTimestampMs(b) - consentTimestampMs(a);
        if (d !== 0) return d;
        return String(b?.uid ?? "").localeCompare(String(a?.uid ?? ""));
    });
}

/**
 * Human-readable language tag, e.g. "th" → "th (Thai)", "en-GB" → "en-GB (English (UK))".
 * Accepts both bare ISO 639-1 codes (en, th, de) and BCP 47 tags (en-GB, th-TH).
 * Falls back to Intl.DisplayNames when available so uncommon codes still resolve.
 * Returns null when missing.
 */
const LANGUAGE_NAMES_STATIC = {
    en: "English",
    "en-GB": "English (UK)",
    "en-US": "English (US)",
    da: "Danish",
    "da-DK": "Danish",
    sv: "Swedish",
    "sv-SE": "Swedish",
    nb: "Norwegian",
    "nb-NO": "Norwegian",
    no: "Norwegian",
    fi: "Finnish",
    "fi-FI": "Finnish",
    de: "German",
    "de-DE": "German",
    "de-AT": "German (Austria)",
    "de-CH": "German (Switzerland)",
    fr: "French",
    "fr-FR": "French",
    es: "Spanish",
    "es-ES": "Spanish",
    pt: "Portuguese",
    "pt-BR": "Portuguese (Brazil)",
    "pt-PT": "Portuguese (Portugal)",
    nl: "Dutch",
    "nl-NL": "Dutch",
    it: "Italian",
    "it-IT": "Italian",
    pl: "Polish",
    "pl-PL": "Polish",
    ja: "Japanese",
    "ja-JP": "Japanese",
    zh: "Chinese",
    "zh-CN": "Chinese (Simplified)",
    "zh-TW": "Chinese (Traditional)",
    ko: "Korean",
    "ko-KR": "Korean",
    th: "Thai",
    "th-TH": "Thai",
    vi: "Vietnamese",
    id: "Indonesian",
    ms: "Malay",
};

function formatLanguage(lang) {
    if (lang == null || lang === "") return null;
    const raw = String(lang).trim();
    if (!raw) return null;
    const bcp47 = raw.includes("-")
        ? raw.replace(/^([a-z]{2,3})-([a-z]{2})$/i, (_, l, r) => `${l.toLowerCase()}-${r.toUpperCase()}`)
        : raw.toLowerCase();
    const fromStatic = LANGUAGE_NAMES_STATIC[bcp47] || LANGUAGE_NAMES_STATIC[raw];
    if (fromStatic) return `${bcp47} (${fromStatic})`;
    try {
        if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
            const dn = new Intl.DisplayNames(["en"], { type: "language" });
            const name = dn.of(bcp47);
            if (name && name !== bcp47) return `${bcp47} (${name})`;
        }
    } catch {
        /* Intl may throw on invalid tags; fall through to returning the raw tag. */
    }
    return bcp47;
}

/** Human-readable consent method, e.g. "banner_granular" → "Banner — granular". */
function formatConsentMethod(method) {
    if (method == null || method === "") return null;
    const s = String(method).trim();
    if (!s) return null;
    const NAMES = {
        banner_accept_all: "Banner — accept all",
        banner_reject_all: "Banner — reject all",
        banner_granular: "Banner — granular",
        banner_essential_only: "Banner — essential only",
        preferences_updated: "Preferences updated",
        preferences_withdrawn: "Preferences withdrawn",
        withdrawal: "Withdrawal",
        api_import: "API import",
    };
    return NAMES[s] || s.replace(/_/g, " ");
}

/**
 * Short label for a data-transfer basis code. These match the `basis` values
 * written by collect.php / domain_data_transfer.
 */
const TRANSFER_BASIS_SHORT = {
    sccs: "SCCs",
    bcrs: "BCRs",
    adequacy: "Adequacy",
    certification: "Certification",
    consent: "Consent",
    intra_group: "Intra-group",
    derogation: "Derogation",
    none_required: "No transfer",
    disclosure_only: "Disclosure only",
};

/**
 * Build the structured transfer summary shown on an audit card. Accepts the
 * new snapshot columns (`transfer_basis`, `transfer_destination`, …) and
 * falls back to the legacy single-string fields.
 * Returns { primary, secondary } or null if nothing is known.
 */
function formatTransfer(row) {
    if (!row) return null;
    const basisRaw = String(row.transfer_basis ?? "").trim().toLowerCase();
    const destination = String(row.transfer_destination ?? "").trim();
    const instrument = String(row.transfer_instrument ?? "").trim();
    const importer = String(row.transfer_data_importer ?? "").trim();
    const effective = String(row.transfer_effective_from ?? "").trim();

    if (basisRaw || destination || instrument) {
        const basisLabel = TRANSFER_BASIS_SHORT[basisRaw] || (basisRaw ? basisRaw.replace(/_/g, " ") : "");
        const primary = [basisLabel, destination].filter(Boolean).join(" → ");
        const secondaryParts = [];
        if (instrument) secondaryParts.push(instrument);
        if (importer) secondaryParts.push(importer);
        if (effective) secondaryParts.push(`since ${effective.slice(0, 10)}`);
        return {
            primary: primary || "—",
            secondary: secondaryParts.join(" · ") || null,
        };
    }

    const legacy =
        row.transfer_mechanism ??
        row.data_transfer ??
        row.data_residency ??
        row.hosting_region ??
        null;
    if (legacy) return { primary: String(legacy), secondary: null };
    return null;
}

export default function UserConsents(props) {
    document.title = "Audit log | Intastellar Consents";
    const settings = JSON.parse(localStorage.getItem("settings")) || { dateRange: 30 };
    const [currentDomain, setGlobalDomain] = useContext(DomainContext);
    const { handle, id } = useParams();
    useSyncDomainFromRoute(handle, setGlobalDomain);

    const listDomainLabel = useMemo(
        () => consentsDomainFromRoute(handle, currentDomain),
        [handle, currentDomain]
    );
    const domainsApiHeader = useMemo(() => toDomainsApiHeader(listDomainLabel), [listDomainLabel]);

    const [activeData, setActiveData] = useState(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [selectedFramework, setSelectedFramework] = useState("all");

    const [demoMode, setDemoMode] = useState(Authentication.DemoMode); 

    const [getLastDays, setLastDays] = useState((localStorage.getItem("settings") != null) ? JSON.parse(localStorage.getItem("settings")).dateRange : 30);

    const today = new Date();
    const rangeDays = settings?.dateRange ?? 30;
    const [fromDate, setFromDate] = useState(new Date(new Date().setDate(today.getDate() - rangeDays)));
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)));
    const [compareRange, setCompareRange] = useState(0);
    const [previousPeriod, setPreviousPeriod] = useState(() =>
        defaultCompareWindowForPrimary(
            new Date(new Date().setDate(new Date().getDate() - rangeDays)),
            new Date(new Date().setDate(new Date().getDate() - 1))
        ).start
    );
    const [previousPeriod2, setPreviousPeriod2] = useState(() =>
        defaultCompareWindowForPrimary(
            new Date(new Date().setDate(new Date().getDate() - rangeDays)),
            new Date(new Date().setDate(new Date().getDate() - 1))
        ).end
    );

    const consentsQueryKey = useMemo(
        () => `${id}|${domainsApiHeader}|${consentDateKey(fromDate)}|${consentDateKey(toDate)}`,
        [id, domainsApiHeader, fromDate, toDate]
    );

    API[id].getDomainsUrl.headers.Domains = domainsApiHeader;
    API[id].getDomainsUrl.headers.Offset = "0";
    API[id].getDomainsUrl.headers.Limit = String(PAGE_SIZE);
    API[id].getDomainsUrl.headers.FromDate = consentDateKey(fromDate);
    API[id].getDomainsUrl.headers.ToDate = consentDateKey(toDate);
    API[id].getDomainsUrl.headers.SortOrder = "desc";

    const url = API[id].getDomainsUrl.url;
    const method = API[id].getDomainsUrl.method;

    const [getDomainsUrlLoading, getDomainsUrlData, getDomainsUrlError, getDomainsUrlGetUpdated] = useFetch(
        5,
        API[id].getDomainsUrl.url,
        API[id].getDomainsUrl.method,
        API[id].getDomainsUrl.headers
    );

    useEffect(() => {
        const unsubscribe = Authentication.onDemoModeChange(setDemoMode);
        return unsubscribe; // Clean up on unmount
    }, []);

    const consentsInFlightKeyRef = useRef(null);

    useEffect(() => {
        setActiveData(null);
        setHasMore(true);
    }, [consentsQueryKey]);

    useEffect(() => {
        if (getDomainsUrlLoading) {
            consentsInFlightKeyRef.current = consentsQueryKey;
        }
    }, [getDomainsUrlLoading, consentsQueryKey]);

    useEffect(() => {
        if (getDomainsUrlError) {
            return;
        }
        if (getDomainsUrlLoading) {
            return;
        }
        if (getDomainsUrlData === undefined) {
            return;
        }
        if (
            consentsInFlightKeyRef.current != null &&
            consentsInFlightKeyRef.current !== consentsQueryKey
        ) {
            return;
        }
        if (
            getDomainsUrlData === "Err_Server_Error" ||
            getDomainsUrlData === "Err_No_Access"
        ) {
            return;
        }
        if (getDomainsUrlData === "Err_No_Data_Found") {
            setActiveData([]);
            setHasMore(false);
            return;
        }
        if (Array.isArray(getDomainsUrlData)) {
            // Append necessary consent to getDomainsUrlData
            getDomainsUrlData.forEach(item => {
                item.consent.unshift({
                    type: "necessary",
                    checked: "checked",
                });
            });
            setActiveData(sortConsentsNewestFirst(getDomainsUrlData));
            setHasMore(getDomainsUrlData.length === PAGE_SIZE);
        }
    }, [getDomainsUrlData, getDomainsUrlError, getDomainsUrlLoading, consentsQueryKey]);

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
                Domains: domainsApiHeader,
                Offset: String(offset),
                Limit: String(PAGE_SIZE),
                FromDate: consentDateKey(fromDate),
                ToDate: consentDateKey(toDate),
                SortOrder: "desc",
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
            batch.forEach(item => {
                item.consent.unshift({
                    type: "necessary",
                    checked: "checked",
                });
            });
            setActiveData((prev) =>
                sortConsentsNewestFirst(Array.isArray(prev) ? [...prev, ...batch] : batch)
            );
            setHasMore(batch.length === PAGE_SIZE);
        } catch (e) {
            setHasMore(false);
        } finally {
            setLoadingMore(false);
        }
    }, [domainsApiHeader, fromDate, toDate, id, getDomainsUrlLoading, method, url]);

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

    const displayData = useMemo(() => {
        if (!demoMode) {
            return activeData;
        }
        if (!activeData || activeData.length === 0) {
            if (getDomainsUrlLoading) {
                return [];
            }
            return buildDemoConsentList(28);
        }
        return activeData.map((d, i) => buildDemoConsentRecord(i, d));
    }, [demoMode, activeData, getDomainsUrlLoading]);

    /** Union of frameworks observed in loaded records + the full static list, preserving static order. */
    const availableFrameworks = useMemo(() => {
        const observed = new Set();
        if (Array.isArray(displayData)) {
            for (const row of displayData) {
                for (const fw of frameworksForAuditRow(row)) observed.add(fw);
            }
        }
        const ordered = FRAMEWORK_IDS.filter((id) => observed.has(id) || FRAMEWORK_IDS.includes(id));
        for (const fw of observed) if (!ordered.includes(fw)) ordered.push(fw);
        return ordered;
    }, [displayData]);

    /** Reset framework filter when the underlying query changes so stale selections don't hide new data. */
    useEffect(() => {
        setSelectedFramework("all");
    }, [consentsQueryKey]);

    const filteredDisplayData = useMemo(() => {
        if (!Array.isArray(displayData) || selectedFramework === "all") return displayData;
        return displayData.filter((row) => frameworksForAuditRow(row).has(selectedFramework));
    }, [displayData, selectedFramework]);

    const filteredAway =
        Array.isArray(displayData) && Array.isArray(filteredDisplayData)
            ? displayData.length - filteredDisplayData.length
            : 0;

    const showNoData =
        !demoMode &&
        (getDomainsUrlData === "Err_No_Data_Found" ||
            (Array.isArray(getDomainsUrlData) && getDomainsUrlData.length === 0));

    const showFetchFailure =
        !demoMode &&
        (getDomainsUrlError ||
            getDomainsUrlData === "Err_Server_Error" ||
            getDomainsUrlData === "Err_No_Access");

    const titleDomainLabel = isCombinedOrClearDomain(listDomainLabel) ? null : listDomainLabel;

    return (
        <>
            <SideNav links={reportsLinks} title="Reports" />
            <article style={{ flex: "1"}}>
                <StickyPageTitle demoMode={demoMode} loadingUpdated={getDomainsUrlLoading} finalLoaded={getDomainsUrlLoading} title={"Audit log" + (titleDomainLabel ? " for " + punycode.toUnicode(titleDomainLabel) : "")} numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setActiveData} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} previousPeriod={previousPeriod} previousPeriod2={previousPeriod2} compareRange={compareRange} setCompareRange={setCompareRange} setCompareWindowStart={setPreviousPeriod} setCompareWindowEnd={setPreviousPeriod2} />
                <div className="dashboard-content">
                    <section className="filter user-consents-filter-bar" aria-label="Audit log filters">
                        <label className="user-consents-filter-field" htmlFor="user-consents-framework-filter">
                            <span className="user-consents-filter-label">Framework</span>
                            <select
                                id="user-consents-framework-filter"
                                className="user-consents-filter-select"
                                value={selectedFramework}
                                onChange={(e) => setSelectedFramework(e.target.value)}
                            >
                                <option value="all">All frameworks</option>
                                {availableFrameworks.map((fw) => (
                                    <option key={fw} value={fw}>
                                        {fw}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {selectedFramework !== "all" && filteredAway > 0 ? (
                            <span className="user-consents-filter-note" role="status" aria-live="polite">
                                Showing {filteredDisplayData.length} of {displayData.length} loaded records ·{" "}
                                <button
                                    type="button"
                                    className="user-consents-filter-reset"
                                    onClick={() => setSelectedFramework("all")}
                                >
                                    Clear filter
                                </button>
                                {hasMore ? " · scroll to load more" : ""}
                            </span>
                        ) : null}
                    </section>
                    {(getDomainsUrlLoading && !showFetchFailure) ? 
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
                    : showFetchFailure ? <Unknown /> : (showNoData) ? <NoDataFound /> : <>
                        {selectedFramework !== "all" && Array.isArray(filteredDisplayData) && filteredDisplayData.length === 0 ? (
                            <div className="user-consents-empty-filter" role="status">
                                No records match <strong>{selectedFramework}</strong> in the currently loaded page.{" "}
                                {hasMore ? "Scroll to load more, or " : ""}
                                <button
                                    type="button"
                                    className="user-consents-filter-reset"
                                    onClick={() => setSelectedFramework("all")}
                                >
                                    clear the filter
                                </button>.
                            </div>
                        ) : null}
                        <div className="user-consents-grid">
                            {
                                filteredDisplayData?.map((d, key) => {
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

                                    const isNecessaryType = (t) => String(t || "").toLowerCase() === "necessary";

                                    const languageLabel = formatLanguage(d?.language ?? d?.banner_language);
                                    const methodLabel = formatConsentMethod(
                                        d?.consent_method ?? d?.consentMethod ?? d?.method
                                    );
                                    const transferInfo = formatTransfer(d);
                                    const priorConsentId =
                                        d?.prior_consent_id ?? d?.previous_consent_id ?? null;

                                    return (
                                        <div
                                            className="user-consent-card"
                                            key={d?.uid || d?.shopify_consent_id || `${key}-${d?.banner_policy_id || ""}`}
                                        >
                                            <header className="user-consent-card__header">
                                                <span className="user-consent-card__badge">
                                                    {d?.banner_policy_id ? `ID ${d.banner_policy_id}` : "Legacy record"}
                                                </span>
                                                <div className="user-consent-card__header-meta">
                                                    <span className="user-consent-card__id-line" title={d?.uid != null ? String(d.uid) : ""}>
                                                        <span className="user-consent-card__id-label">UID</span>
                                                        <span className="user-consent-card__id-value">{d?.uid ?? "—"}</span>
                                                    </span>
                                                    <span
                                                        className="user-consent-card__id-line"
                                                        title={d?.shopify_consent_id != null ? String(d.shopify_consent_id) : ""}
                                                    >
                                                        <span className="user-consent-card__id-label">Shopify consent ID</span>
                                                        <span className="user-consent-card__id-value">{d?.shopify_consent_id ?? "—"}</span>
                                                    </span>
                                                </div>
                                            </header>

                                            <dl className="user-consent-card__meta">
                                                <div className="user-consent-card__row">
                                                    <dt>Country</dt>
                                                    <dd>{d?.country_code ?? "—"}</dd>
                                                </div>
                                                <div className="user-consent-card__row">
                                                    <dt>Language</dt>
                                                    <dd>{languageLabel ?? "—"}</dd>
                                                </div>
                                                <div className="user-consent-card__row">
                                                    <dt>Applied framework</dt>
                                                    <dd><span className="regulation">{d?.regulation_applied ?? "—"}</span></dd>
                                                </div>
                                                <div className="user-consent-card__row">
                                                    <dt>Method</dt>
                                                    <dd>{methodLabel ?? "—"}</dd>
                                                </div>
                                                <div className="user-consent-card__row">
                                                    <dt>Time</dt>
                                                    <dd>{timeStr}</dd>
                                                </div>
                                                <div className="user-consent-card__row">
                                                    <dt>Data transfer</dt>
                                                    <dd>
                                                        {transferInfo ? (
                                                            <>
                                                                <span className="user-consent-card__transfer-primary">
                                                                    {transferInfo.primary}
                                                                </span>
                                                                {transferInfo.secondary ? (
                                                                    <span
                                                                        className="user-consent-card__transfer-secondary"
                                                                        title={transferInfo.secondary}
                                                                    >
                                                                        {transferInfo.secondary}
                                                                    </span>
                                                                ) : null}
                                                            </>
                                                        ) : (
                                                            "—"
                                                        )}
                                                    </dd>
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
                                                                        {declined ? "Declined" : accepted ? (isNecessaryType(c?.type) ? "Essential" : "Accepted") : String(c?.checked ?? "")}
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
                                                                {(consent?.consent_value == "1" || consent?.consent_value == "checked") ? (isNecessaryType(consent?.consent_type) ? "Essential" : "Accepted") : "Declined"}
                                                            </span>
                                                        </li>
                                                    </ul>
                                                )}
                                            </section>

                                            <footer className="user-consent-card__footer">
                                                {priorConsentId ? (
                                                    <span
                                                        className="user-consent-card__prior"
                                                        title={String(priorConsentId)}
                                                    >
                                                        <span className="user-consent-card__version-label">
                                                            Prior consent
                                                        </span>
                                                        <span className="user-consent-card__prior-id">
                                                            {String(priorConsentId)}
                                                        </span>
                                                    </span>
                                                ) : null}
                                                <span className="user-consent-card__footer-version">
                                                    <span className="user-consent-card__version-label">Version</span>
                                                    {d?.github_link ? (
                                                        <a
                                                            className="link user-consent-card__version-link"
                                                            href={d.github_link}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        >
                                                            {d?.code_version ?? "—"}
                                                        </a>
                                                    ) : (
                                                        <span>{d?.code_version ?? "—"}</span>
                                                    )}
                                                </span>
                                            </footer>
                                        </div>
                                    );
                                })
                            }
                        </div>
                        {loadingMore ? (
                            <div className="user-consents-load-more" role="status" aria-live="polite">
                                <LoadingSpinner />
                            </div>
                        ) : null}
                    </>}
                </div>
            </article>
        </>
    )
}
