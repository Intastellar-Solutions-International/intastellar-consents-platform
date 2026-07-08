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
    const [loading, setLoading] = useState(false);

    const domainsForApi = useMemo(
        () => (handle ? handle : currentDomain) || "combined view",
        [handle, currentDomain]
    );


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

                            {preConsentTransfers?.pre_consent_transfers?.length > 0 && (
                                <div className="compliance-transfers__list">
                                    {preConsentTransfers.pre_consent_transfers.map((t) => (
                                        <div key={t.host} className={"compliance-transfers__row compliance-transfers__row--" + (t.category || "other")}>
                                            <div className="compliance-transfers__row-main">
                                                <span className="compliance-transfers__row-service">
                                                    {t.service || t.host}
                                                </span>
                                                <span className="compliance-transfers__row-host">{t.host}</span>
                                            </div>
                                            <span className={"compliance-transfers__row-cat compliance-transfers__row-cat--" + (t.category || "other")}>
                                                {t.category || "unknown"}
                                            </span>
                                            <span className="compliance-transfers__row-flag" title="Fires before consent">
                                                Pre-consent
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {preConsentTransfers?.pre_consent_transfers?.length === 0 && !scanLoading && (
                                <div className="compliance-transfers__empty compliance-transfers__empty--clean">
                                    <span className="compliance-transfers__empty-icon" aria-hidden>✓</span>
                                    <span>No pre-consent transfers detected in the last scan.</span>
                                </div>
                            )}
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
            </div>
        </>
    );
}
