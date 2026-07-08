const { useState, useEffect, useContext, useMemo } = React;
import StickyPageTitle from "../../Components/Header/Sticky";
import AuditSnapshotCard from "../../components/AuditSnapshotCard/AuditSnapshotCard.js";
import Map from "../../Components/Charts/WorldMap/WorldMap.js";
import { defaultCompareWindowForPrimary } from "../../Components/Filter/filterDatePresets.js";
import { DomainContext, WorkspaceContext } from "../../App.js";
import API from "../../API/api";
import {
    reportsPath,
    useSyncDomainFromRoute,
} from "../../Functions/domainPathSegments.js";
import Authentication from "../../Authentication/Auth";
import "../Dashboard/Style.css";
import "./Style.css";

const Link = window.ReactRouterDOM.Link;
const useParams = window.ReactRouterDOM.useParams;

const CATEGORY_META = {
    fingerprinting: { label: "Fingerprinting", risk: "high",   icon: "◆", color: "#c0365a" },
    advertising:    { label: "Advertising",    risk: "high",   icon: "◈", color: "#dc5050" },
    analytics:      { label: "Analytics",      risk: "medium", icon: "◉", color: "#5090dc" },
    social:         { label: "Social",         risk: "medium", icon: "◎", color: "#8264c8" },
    functional:     { label: "Functional",     risk: "low",    icon: "◌", color: "#50a878" },
    cdn:            { label: "CDN / Fonts",    risk: "low",    icon: "○", color: "#787878" },
    cmp:            { label: "CMP",            risk: "none",   icon: "✓", color: "#50a878" },
    "third-party":  { label: "Third-party",    risk: "medium", icon: "◇", color: "#909090" },
};

const RESOURCE_LABELS = {
    script:     "Script",
    stylesheet: "CSS",
    image:      "Image",
    font:       "Font",
    xhr:        "XHR",
    fetch:      "Fetch",
    media:      "Media",
    document:   "Doc",
    websocket:  "WS",
    other:      "Other",
};

const RISK_ORDER = { high: 0, medium: 1, low: 2, none: 3 };
const CAT_ORDER  = { fingerprinting: 0, advertising: 1, analytics: 2, social: 3, functional: 4, cdn: 5, cmp: 6, "third-party": 7 };


export default function CompliancePage() {
    const { id, handle } = useParams();
    const [currentDomain, setCurrentDomain] = useContext(DomainContext);
    const [activeWorkspace] = useContext(WorkspaceContext);
    const [demoMode, setDemoMode] = useState(Authentication.DemoMode);

    useSyncDomainFromRoute(handle, setCurrentDomain);

    const workspaceId = activeWorkspace?.id ?? null;

    const initialLastDays = localStorage.getItem("settings") != null
        ? JSON.parse(localStorage.getItem("settings")).dateRange
        : 30;
    const [getLastDays, setLastDays] = useState(initialLastDays);
    const today = new Date();
    const [fromDate, setFromDate] = useState(
        new Date(new Date().setDate(today.getDate() - initialLastDays))
    );
    const [toDate, setToDate] = useState(
        new Date(new Date().setDate(today.getDate() - 1))
    );
    const [compareRange, setCompareRange] = useState(0);
    const [previousPeriod, setPreviousPeriod] = useState(() =>
        defaultCompareWindowForPrimary(
            new Date(new Date().setDate(new Date().getDate() - initialLastDays)),
            new Date(new Date().setDate(new Date().getDate() - 1))
        ).start
    );
    const [previousPeriod2, setPreviousPeriod2] = useState(() =>
        defaultCompareWindowForPrimary(
            new Date(new Date().setDate(new Date().getDate() - initialLastDays)),
            new Date(new Date().setDate(new Date().getDate() - 1))
        ).end
    );
    const [, setActiveDataDummy] = useState(null);

    const [activeData, setActiveData] = useState(null);
    const [activeDataCountry, setActiveDataCountry] = useState(null);
    const [observedCookies, setObservedCookies] = useState(null);
    const [preConsentTransfers, setPreConsentTransfers] = useState(null);
    const [scanLoading, setScanLoading] = useState(false);
    const [activeFilter, setActiveFilter] = useState(null);
    const [activeTab, setActiveTab] = useState("transfers");
    const [loading, setLoading] = useState(false);

    const domainsForApi = useMemo(
        () => (handle ? handle : currentDomain) || "combined view",
        [handle, currentDomain]
    );

    const dataFlowCountries = useMemo(() => {
        const transfers = preConsentTransfers?.pre_consent_transfers;
        if (!transfers?.length) return [];
        // Only highlight non-EU destinations — EU transfers are not a Chapter V GDPR concern
        return [...new Set(
            transfers
                .filter(t => t.dataCountry && t.dataRegion !== "eu")
                .map(t => t.dataCountry)
        )];
    }, [preConsentTransfers]);


    useEffect(() => {
        const unsubscribe = Authentication.onDemoModeChange(setDemoMode);
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!id || !API[id]) return;
        setLoading(true);

        const fd = fromDate.toISOString().split("T")[0];
        const td = toDate.toISOString().split("T")[0];
        const pp = previousPeriod.toISOString().split("T")[0];
        const pp2 = previousPeriod2.toISOString().split("T")[0];
        const cr = compareRange === 0 || compareRange == null ? "" : String(compareRange);
        const sharedHeaders = {
            Domains: domainsForApi,
            FromDate: fd,
            ToDate: td,
            CompareRange: compareRange,
            PreviousPeriod: pp,
            PreviousPeriod2: pp2,
            "X-Compare-Start": pp,
            "X-Compare-End": pp2,
            "X-Compare-Range": cr,
        };

        fetch(API[id].getInteractions.url, {
            method: API[id].getInteractions.method,
            headers: { ...API[id].getInteractions.headers, ...sharedHeaders },
            body: JSON.stringify({ workspaceId }),
        })
            .then((r) => r.json())
            .then((data) => {
                if (data === "Err_Login_Expired") {
                    localStorage.removeItem("globals");
                    window.location.href = "/login";
                    return;
                }
                setActiveData(data);
            })
            .catch(console.error)
            .finally(() => setLoading(false));

        fetch(API[id].getInteractionsByCountry.url, {
            method: API[id].getInteractionsByCountry.method,
            headers: { ...API[id].getInteractionsByCountry.headers, ...sharedHeaders },
            body: JSON.stringify({ workspaceId }),
        })
            .then((r) => r.json())
            .then((data) => {
                if (data === "Err_Login_Expired") {
                    localStorage.removeItem("globals");
                    window.location.href = "/login";
                    return;
                }
                setActiveDataCountry(data);
            })
            .catch(console.error);

        fetch(API[id].observedCookies.url, {
            method: API[id].observedCookies.method,
            headers: { ...API[id].observedCookies.headers, ...sharedHeaders },
            body: JSON.stringify({ workspaceId }),
        })
            .then((r) => r.json())
            .then((data) => {
                if (data === "Err_Login_Expired") {
                    localStorage.removeItem("globals");
                    window.location.href = "/login";
                    return;
                }
                setObservedCookies(data);
            })
            .catch(console.error);

        const domain = handle || currentDomain;
        if (domain && domain !== "combined view") {
            fetch(`${API[id].getPreConsentTransfers.url}?domain=${encodeURIComponent(domain)}`, {
                method: API[id].getPreConsentTransfers.method,
                headers: { ...API[id].getPreConsentTransfers.headers },
            })
                .then((r) => r.json())
                .then((data) => {
                    if (data === "Err_Login_Expired") {
                        localStorage.removeItem("globals");
                        window.location.href = "/login";
                        return;
                    }
                    setPreConsentTransfers(data);
                })
                .catch(() => setPreConsentTransfers(null));
        }
    }, [id, domainsForApi, fromDate, toDate, compareRange, previousPeriod, previousPeriod2, workspaceId]);

    const triggerScan = () => {
        const domain = handle || currentDomain;
        if (!domain || domain === "combined view" || !API[id]) return;
        setScanLoading(true);
        fetch(API[id].triggerPreConsentScan.url, {
            method: API[id].triggerPreConsentScan.method,
            headers: { ...API[id].triggerPreConsentScan.headers },
            body: JSON.stringify({ domain, workspaceId }),
        })
            .then((r) => r.json())
            .then((data) => setPreConsentTransfers(data))
            .catch(console.error)
            .finally(() => setScanLoading(false));
    };

    if (!id || !API[id]) return null;

    const preCount = observedCookies?.preConsent?.count;
    const postCount = observedCookies?.consent?.count;
    const auditLogPath = reportsPath(id, currentDomain, "/user-consents");

    return (
        <>
            <StickyPageTitle
                loadingUpdated={loading}
                finalLoaded={loading}
                title={handle ? `Compliance: ${handle}` : "Compliance overview"}
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                setActiveData={setActiveDataDummy}
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
                demoMode={demoMode}
            />

            {/* ── Hero map — full-width, outside dashboard-content padding ── */}
            <div className="compliance-hero">
                <Map
                    demoMode={demoMode}
                    data={{
                        Countries: activeDataCountry?.data?.Countries,
                        total: activeData?.Total,
                    }}
                    dataFlowCountries={dataFlowCountries}
                />
                {/* Cookie scan strip overlaid at the bottom of the hero */}
                {observedCookies && (
                    <div className="compliance-hero__stats">
                        <div className="compliance-hero__stat">
                            <span className="compliance-hero__stat-value">
                                {preCount > 0 ? preCount.toLocaleString("de-DE") : "—"}
                            </span>
                            <span className="compliance-hero__stat-label">Pre-consent cookies</span>
                        </div>
                        <div className="compliance-hero__stat-divider" aria-hidden />
                        <div className="compliance-hero__stat">
                            <span className="compliance-hero__stat-value">
                                {postCount > 0 ? postCount.toLocaleString("de-DE") : "—"}
                            </span>
                            <span className="compliance-hero__stat-label">Post-consent cookies</span>
                        </div>
                        <div className="compliance-hero__stat-divider" aria-hidden />
                        <div className="compliance-hero__stat">
                            <span className="compliance-hero__stat-value">
                                {activeData?.Total != null ? Number(activeData.Total).toLocaleString("de-DE") : "—"}
                            </span>
                            <span className="compliance-hero__stat-label">Consent interactions</span>
                        </div>
                        <Link to={auditLogPath} className="compliance-hero__audit-btn">
                            Open audit log
                        </Link>
                    </div>
                )}
            </div>

            {/* ── Content ── */}
            <div className="dashboard-content compliance-page">
            <div className="compliance-bottom-grid">

                {/* ── Pre-consent data transfers ── */}
                {(handle || currentDomain) && (handle || currentDomain) !== "combined view" && (
                    <div className="dashboard-section compliance-transfers">
                        <h2 className="dashboard-section-label">Pre-consent data transfers</h2>
                        <div className="compliance-transfers__card">
                            <div className="compliance-transfers__header">
                                <div className="compliance-transfers__header-text">
                                    <p className="compliance-transfers__desc">
                                        Third-party services that receive visitor data before consent is given —
                                        e.g. analytics scripts, social pixels, advertising trackers.
                                        Each represents a potential Chapter V transfer under GDPR.
                                    </p>
                                    {preConsentTransfers?.scanned_at && (
                                        <span className="compliance-transfers__scan-time">
                                            Last scanned {new Date(preConsentTransfers.scanned_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                        </span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    className={"compliance-transfers__scan-btn" + (scanLoading ? " --loading" : "")}
                                    onClick={triggerScan}
                                    disabled={scanLoading}
                                >
                                    {scanLoading ? "Scanning…" : "Scan now"}
                                </button>
                            </div>

                            {/* ── Tabs (shown once a scan exists) ── */}
                            {preConsentTransfers && !scanLoading && (
                                <div className="compliance-transfers__tabs">
                                    {[
                                        { key: "transfers", label: "Transfers", count: preConsentTransfers.pre_consent_transfers?.length },
                                        { key: "cookies",   label: "Cookies",   count: preConsentTransfers.pre_consent_cookies?.length   },
                                    ].map(({ key, label, count }) => (
                                        <button
                                            key={key}
                                            type="button"
                                            className={"compliance-transfers__tab" + (activeTab === key ? " --active" : "")}
                                            onClick={() => setActiveTab(key)}
                                        >
                                            {label}
                                            {count > 0 && <span className="compliance-tab-pill">{count}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {!preConsentTransfers && !scanLoading && (
                                <div className="compliance-transfers__empty">
                                    <span className="compliance-transfers__empty-icon" aria-hidden>⟳</span>
                                    <span>No scan data yet — run a scan to detect pre-consent transfers for this domain.</span>
                                </div>
                            )}

                            {scanLoading && (
                                <div className="compliance-transfers__empty compliance-transfers__empty--loading">
                                    <span>Scanning {handle || currentDomain}…</span>
                                </div>
                            )}

                            {activeTab === "transfers" && preConsentTransfers?.pre_consent_transfers?.length > 0 && (() => {
                                const transfers = preConsentTransfers.pre_consent_transfers;
                                const countsByCategory = transfers.reduce((acc, t) => {
                                    acc[t.category] = (acc[t.category] || 0) + 1;
                                    return acc;
                                }, {});
                                const sortedCategories = Object.entries(countsByCategory)
                                    .sort(([a], [b]) => (CAT_ORDER[a] ?? 99) - (CAT_ORDER[b] ?? 99));
                                const displayed = activeFilter
                                    ? transfers.filter(t => t.category === activeFilter)
                                    : transfers;

                                return (
                                    <>
                                        {/* ── Category summary cards ── */}
                                        <div className="transfers-summary">
                                            {sortedCategories.map(([cat, count]) => {
                                                const meta = CATEGORY_META[cat] || { label: cat, risk: "medium", icon: "◇", color: "#909090" };
                                                const isActive = activeFilter === cat;
                                                return (
                                                    <button
                                                        key={cat}
                                                        type="button"
                                                        className={"transfers-summary__card" + (isActive ? " --active" : "")}
                                                        onClick={() => setActiveFilter(isActive ? null : cat)}
                                                        style={{ "--cat-color": meta.color }}
                                                    >
                                                        <span className="transfers-summary__card-icon">{meta.icon}</span>
                                                        <span className="transfers-summary__card-count">{count}</span>
                                                        <span className="transfers-summary__card-label">{meta.label}</span>
                                                        {meta.risk !== "none" && (
                                                            <span className={"transfers-summary__card-risk --" + meta.risk}>
                                                                {meta.risk === "high" ? "High" : meta.risk === "medium" ? "Med" : "Low"}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                            {activeFilter && (
                                                <button type="button" className="transfers-summary__clear" onClick={() => setActiveFilter(null)}>
                                                    Show all
                                                </button>
                                            )}
                                        </div>

                                        {/* ── Transfer rows ── */}
                                        <div className="compliance-transfers__list">
                                            {displayed.map((t) => {
                                                const meta   = CATEGORY_META[t.category] || { label: t.category, risk: "medium", icon: "◇", color: "#909090" };
                                                const resLabel = RESOURCE_LABELS[t.resourceType] || (t.resourceType || "Other");
                                                const region   = t.dataRegion || "non-eu";
                                                return (
                                                    <div key={t.host} className={"compliance-transfers__row compliance-transfers__row--" + (t.category || "other")}>
                                                        <span className="compliance-transfers__row-icon" style={{ color: meta.color }}>
                                                            {meta.icon}
                                                        </span>
                                                        <div className="compliance-transfers__row-main">
                                                            <span className="compliance-transfers__row-service">{t.service || t.host}</span>
                                                            <span className="compliance-transfers__row-host">{t.host}</span>
                                                        </div>
                                                        <span className={"compliance-transfers__row-resource compliance-transfers__row-resource--" + (t.resourceType || "other")}>
                                                            {resLabel}
                                                        </span>
                                                        <span className={"compliance-transfers__row-region --" + region}>
                                                            {region === "eu" ? "EU" : "Non-EU"}
                                                        </span>
                                                        <span className={"compliance-transfers__row-cat compliance-transfers__row-cat--" + (t.category || "other")}>
                                                            {meta.label || t.category}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                );
                            })()}

                            {activeTab === "transfers" && preConsentTransfers?.pre_consent_transfers?.length === 0 && !scanLoading && (
                                <div className="compliance-transfers__empty compliance-transfers__empty--clean">
                                    <span className="compliance-transfers__empty-icon" aria-hidden>✓</span>
                                    <span>No pre-consent transfers detected in the last scan.</span>
                                </div>
                            )}

                            {/* ── Cookies tab ── */}
                            {activeTab === "cookies" && !scanLoading && (() => {
                                const cookies = preConsentTransfers?.pre_consent_cookies || [];
                                const domain  = (handle || currentDomain || "").replace(/^www\./, "");
                                if (!cookies.length) return (
                                    <div className="compliance-transfers__empty compliance-transfers__empty--clean">
                                        <span className="compliance-transfers__empty-icon" aria-hidden>✓</span>
                                        <span>No cookies set before consent in the last scan.</span>
                                    </div>
                                );
                                return (
                                    <div className="compliance-cookies__list">
                                        {cookies.map((c, i) => {
                                            const isThird = !c.domain.replace(/^\./, "").endsWith(domain);
                                            return (
                                                <div key={c.name + c.domain + i} className="compliance-cookies__row">
                                                    <div className="compliance-cookies__row-main">
                                                        <span className="compliance-cookies__row-name">{c.name}</span>
                                                        <span className="compliance-cookies__row-domain">{c.domain}</span>
                                                    </div>
                                                    <span className={"compliance-cookies__row-party" + (isThird ? " --third" : " --first")}>
                                                        {isThird ? "3rd party" : "1st party"}
                                                    </span>
                                                    <span className={"compliance-cookies__row-lifetime" + (c.session ? " --session" : " --persistent")}>
                                                        {c.session ? "Session" : "Persistent"}
                                                    </span>
                                                    <div className="compliance-cookies__flags">
                                                        {c.httpOnly && <span className="compliance-cookies__flag">HttpOnly</span>}
                                                        {c.secure   && <span className="compliance-cookies__flag">Secure</span>}
                                                        {c.sameSite && c.sameSite !== "None" && (
                                                            <span className="compliance-cookies__flag">Same{c.sameSite}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* ── Audit card ── */}
                <div className="compliance-page__audit">
                    <AuditSnapshotCard
                        platformId={id}
                        handle={handle}
                        currentDomain={currentDomain}
                        fromDate={fromDate}
                        toDate={toDate}
                        activeData={activeData}
                        demoMode={demoMode}
                        interactionsLoading={loading}
                        observedCookies={observedCookies}
                    />
                </div>

            </div>{/* end compliance-bottom-grid */}
            </div>
        </>
    );
}
