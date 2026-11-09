import useFetch from "../../Functions/FetchHook";
import API from "../../API/api";
import { LoadingBar } from "../../Components/widget/Loading";

import "./Style.css";
import { DomainContext, WorkspaceContext } from "../../App.js";
import {
    reportsPath,
    analyticsMarketingPath,
    consentsDomainFromRoute,
    toDomainsApiHeader,
} from "../../Functions/domainPathSegments.js";
import {
    isDomainVerified,
    isVerificationExpired,
    getOrCreateVerificationRecord,
} from "../../Functions/domainVerification.js";
import { isJson } from "../../Functions/isJson.js";
import Crawler from "../../Components/Crawler";
import ConsentTrend from "../../Components/Charts/ConsentTrend/index.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { defaultCompareWindowForPrimary } from "../../Components/Filter/filterDatePresets.js";
import { LiveView } from "../../Components/LiveView/index.js";
import { DecisionBehaviourDrawer } from "../../Components/DecisionBehaviourDrawer/index.js";
import { BasicTier, ProTier } from "../../Components/tiers/index.js";
import Pie from "../../Components/Charts/Pie/index.js";
import ErrorBoundary from "../../Components/Error/ErrorBoundary.js";
import Authentication from "../../Authentication/Auth";
import punycode from "punycode";
import appStorage from '../../Functions/storage.js';
import BotFilterToggle from "../../Components/BotFilterToggle";
import { useExcludeBots } from "../../Functions/botFilter.js";
import { preConsentCookieStat, postConsentCookieStat } from "../../Functions/cookieStats.js";
import SectionError from "../../Components/SectionError";
import { fetchJsonWithTimeout } from "../../Functions/fetchWithTimeout.js";
import { Icon } from "../../Components/ui/icons.js";
import { formatNumber, formatPercent } from "../../Functions/format.js";
import { OverviewTemplate, AttentionPanel } from "../../Components/templates";
import { KpiTile, Card, SkeletonCard } from "../../Components/ui";
import { t } from "../../i18n/index.js";
import QuickReport from "./QuickReport.js";
import { ComplianceChecks, PerformanceBand, CategoryOptIn, DecisionSplit, CountryRanking, DeviceShare, DecisionTime, LatestScan, periodChangePercent } from "./HomeSections.js";
import useDomainHealth from "../../Components/Shell/useDomainHealth.js";

const { useState, useEffect, useRef, useContext, useMemo } = React;

const useParams = window.ReactRouterDOM.useParams;
const Link = window.ReactRouterDOM.Link;

export default function Dashboard(props) {
    document.title = "Home | Intastellar Consents | CMP";
    const [currentDomain, setCurrentDomain] = useContext(DomainContext);
    const [activeWorkspace] = useContext(WorkspaceContext);
    const subscriptionStatus = JSON.parse(appStorage.getItem("subscription"));
    const userProfile = JSON.parse(appStorage.getItem("globals")).user.avatar;

    const [demoMode, setDemoMode] = useState(Authentication.DemoMode);
    const [timeToDecision, setTimeToDecision] = useState("global");
    const [behaviourDrawerOpen, setBehaviourDrawerOpen] = useState(false);

    const { handle, id } = useParams();

    useEffect(() => {
        if (handle == null || handle === undefined) {
            setCurrentDomain("combined view");
            return;
        }
        if (handle === "combined view") {
            setCurrentDomain("combined view");
        } else {
            const decoded = decodeURIComponent(String(handle).replace(/%2E/gi, "."));
            setCurrentDomain(punycode.toUnicode(decoded));
        }
    }, [handle, id, setCurrentDomain]);

    const [activeData, setActiveData] = useState(null);
    const [activeDataCountry, setactiveDataCountry] = useState(null);
    const initialLastDays =
        localStorage.getItem("settings") != null ? JSON.parse(localStorage.getItem("settings")).dateRange : 30;
    const [getLastDays, setLastDays] = useState(initialLastDays);
    const today = new Date();
    const [fromDate, setFromDate] = useState(new Date(new Date().setDate(today.getDate() - (initialLastDays - 1))));
    const [toDate, setToDate] = useState(new Date());
    const [compareRange, setCompareRange] = useState(0);
    const [previousPeriod, setPreviousPeriod] = useState(() =>
        defaultCompareWindowForPrimary(
            new Date(new Date().setDate(new Date().getDate() - (initialLastDays - 1))),
            new Date()
        ).start
    );
    const [previousPeriod2, setPreviousPeriod2] = useState(() =>
        defaultCompareWindowForPrimary(
            new Date(new Date().setDate(new Date().getDate() - (initialLastDays - 1))),
            new Date()
        ).end
    );
    const [loading, setLoading] = useState(false);
    const [loadingCountry, setLoadingCountry] = useState(false);
    const [interactionsError, setInteractionsError] = useState(null);
    const [countryError, setCountryError] = useState(null);
    // Bumped by the Retry buttons to re-run the matching request.
    const [interactionsAttempt, setInteractionsAttempt] = useState(0);
    const [countryAttempt, setCountryAttempt] = useState(0);
    const [scanSummary, setScanSummary] = useState(null);
    // Raw scan response incl. 404 bodies — they say *why* there is no scan.
    const [scanResult, setScanResult] = useState(null);
    const [excludeBots] = useExcludeBots();
    const [scanLoading, setScanLoading] = useState(false);

    const dashboardView = props.dashboardView;
    let url = API[id].getInteractions.url;
    let method = API[id].getInteractions.method;
    let header = API[id].getInteractions.headers;

    const workspaceId = activeWorkspace?.id ?? null;

    // Always pass the user-selected domain (or "combined view") as-is.
    // When a workspace is active, workspaceId is sent in the request body and
    // the backend resolves which domains belong to that workspace itself.
    const domainsForApi = useMemo(() => {
        return (handle ? handle : currentDomain) || "combined view";
    }, [handle, currentDomain]);
    API[id].getInteractions.headers.Domains = domainsForApi;
    API[id].getInteractionsByCountry.headers.Domains = domainsForApi;
    API[id].getInteractions.headers.FromDate = fromDate.toISOString().split("T")[0];
    API[id].getInteractions.headers.ToDate = toDate.toISOString().split("T")[0];

    API[id].getInteractionsByCountry.headers.FromDate = fromDate.toISOString().split("T")[0];
    API[id].getInteractionsByCountry.headers.ToDate = toDate.toISOString().split("T")[0];

    API[id].getInteractions.headers.CompareRange = compareRange;
    API[id].getInteractions.headers.PreviousPeriod = previousPeriod.toISOString().split("T")[0];
    API[id].getInteractions.headers.PreviousPeriod2 = previousPeriod2.toISOString().split("T")[0];
    API[id].getInteractions.headers["X-Compare-Start"] = previousPeriod.toISOString().split("T")[0];
    API[id].getInteractions.headers["X-Compare-End"] = previousPeriod2.toISOString().split("T")[0];
    API[id].getInteractions.headers["X-Compare-Range"] =
        compareRange === 0 || compareRange == null ? "" : String(compareRange);

    const StyleAPIUrl = API[id].getStyle.url;
    const StyleAPIMethod = API[id].getStyle.method;
    const StyleAPIHeader = API[id].getStyle.headers;

    const [styleLoading, styleData, styleError, styleUpdated] = useFetch(30, StyleAPIUrl, StyleAPIMethod, StyleAPIHeader);

    const hasTimeToDecision =
        activeData != null &&
        activeData.timeToDecision != null &&
        typeof activeData.timeToDecision === "object";
    const timeToDecisionSlice = useMemo(() => {
        const root = activeData?.timeToDecision;
        if (root == null || typeof root !== "object") return null;
        const slice = root[timeToDecision];
        if (slice == null || typeof slice !== "object") return null;
        return slice;
    }, [activeData, timeToDecision]);

    const globalTimeToDecision = useMemo(() => {
        const root = activeData?.timeToDecision;
        if (root == null || typeof root !== "object") return null;
        return root.global ?? null;
    }, [activeData]);

    // Domain verification status check
    const verificationStatus = useMemo(() => {
        // Get organisation ID
        let orgId = null;
        try {
            const orgRaw = appStorage.getItem("organisation");
            if (orgRaw) {
                const org = JSON.parse(orgRaw);
                orgId = org?.id;
            }
        } catch {
            /* ignore */
        }

        // Determine which domain to check
        const domainToCheck = handle || currentDomain;

        // Skip for combined view or if no domain/org
        if (!orgId || !domainToCheck || domainToCheck === "combined view") {
            return { show: false };
        }

        const verified = isDomainVerified(domainToCheck, orgId);
        const expired = isVerificationExpired(domainToCheck, orgId);

        if (verified) {
            return { show: false };
        }

        return {
            show: true,
            domain: domainToCheck,
            orgId,
            isExpired: expired,
        };
    }, [handle, currentDomain]);

    useEffect(() => {
        const unsubscribe = Authentication.onDemoModeChange(setDemoMode);
        return unsubscribe;
    }, []);

    useEffect(() => {
        const domain = handle || currentDomain;
        if (!domain || domain === "combined view" || !id || !API[id]?.getPreConsentTransfers) return;
        setScanSummary(null);
        setScanResult(null);
        fetch(`${API[id].getPreConsentTransfers.url}?domain=${encodeURIComponent(domain)}`, {
            method: API[id].getPreConsentTransfers.method,
            headers: { ...API[id].getPreConsentTransfers.headers },
        })
            .then(r => r.json().catch(() => null))
            .then(data => {
                setScanResult(data || { error: "unreadable" });
                if (data && !data.error) setScanSummary(data);
            })
            .catch(() => setScanResult(null));
    }, [handle, currentDomain, id]);

    const triggerOverviewScan = () => {
        const domain = handle || currentDomain;
        if (!domain || domain === "combined view" || !id || !API[id]?.triggerPreConsentScan) return;
        setScanLoading(true);
        fetch(API[id].triggerPreConsentScan.url, {
            method: API[id].triggerPreConsentScan.method,
            headers: { ...API[id].triggerPreConsentScan.headers },
            body: JSON.stringify({ domain, workspaceId }),
        })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data && !data.error) { setScanSummary(data); setScanResult(data); } })
            .catch(() => {})
            .finally(() => setScanLoading(false));
    };

    useEffect(() => {

        function handleScrollEvent() {
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
                /* console.log("you're at the bottom of the page"); */
                // here add more items in the 'filteredData' state from the 'allData' state source.
            }

        }

        window.addEventListener('scroll', handleScrollEvent)

        return () => {
            window.removeEventListener('scroll', handleScrollEvent);
        }
    }, [])

    // Interactions (hero KPIs, category cards, device chart) and the country
    // map load independently: each has its own time limit, error state and
    // Retry, and a change of range/domain cancels the request in flight so a
    // slow old response can't overwrite newer data. Previously one fetch with
    // no timeout or error handling fed every card, so a failed or hung request
    // left the whole page on skeletons.
    const onLoginExpired = () => {
        appStorage.removeItem("globals");
        window.location.href = "/login";
    };

    useEffect(() => {
        const ac = new AbortController();
        setLoading(true);
        setInteractionsError(null);
        fetchJsonWithTimeout(API[id].getInteractions.url, {
            method: API[id].getInteractions.method,
            headers: API[id].getInteractions.headers,
            body: JSON.stringify({ workspaceId }),
        }, { signal: ac.signal, onLoginExpired })
            .then((data) => {
                if (ac.signal.aborted) return;
                if (data && typeof data === "object" && !Array.isArray(data) && data.error == null) {
                    setActiveData(data);
                } else {
                    setActiveData(null);
                    setInteractionsError(typeof data?.error === "string" ? data.error : "The server returned no statistics.");
                }
                setLoading(false);
            })
            .catch((err) => {
                if (err.kind === "aborted" || ac.signal.aborted) return;
                setActiveData(null);
                setInteractionsError(err.message);
                setLoading(false);
            });
        return () => ac.abort();
    }, [fromDate, toDate, handle, currentDomain, compareRange, previousPeriod, previousPeriod2, workspaceId, excludeBots, interactionsAttempt]);

    useEffect(() => {
        const ac = new AbortController();
        setLoadingCountry(true);
        setCountryError(null);

        API[id].getInteractionsByCountry.headers.CompareRange = compareRange;
        API[id].getInteractionsByCountry.headers.PreviousPeriod = previousPeriod.toISOString().split("T")[0];
        API[id].getInteractionsByCountry.headers.PreviousPeriod2 = previousPeriod2.toISOString().split("T")[0];
        API[id].getInteractionsByCountry.headers["X-Compare-Start"] = previousPeriod.toISOString().split("T")[0];
        API[id].getInteractionsByCountry.headers["X-Compare-End"] = previousPeriod2.toISOString().split("T")[0];
        API[id].getInteractionsByCountry.headers["X-Compare-Range"] =
            compareRange === 0 || compareRange == null ? "" : String(compareRange);

        fetchJsonWithTimeout(API[id].getInteractionsByCountry.url, {
            method: API[id].getInteractionsByCountry.method,
            headers: API[id].getInteractionsByCountry.headers,
            body: JSON.stringify({ workspaceId }),
        }, { signal: ac.signal, onLoginExpired })
            .then((country) => {
                if (ac.signal.aborted) return;
                setactiveDataCountry(country);
                setLoadingCountry(false);
            })
            .catch((err) => {
                if (err.kind === "aborted" || ac.signal.aborted) return;
                setactiveDataCountry(null);
                setCountryError(err.message);
                setLoadingCountry(false);
            });
        return () => ac.abort();
    }, [fromDate, toDate, handle, currentDomain, compareRange, previousPeriod, previousPeriod2, workspaceId, excludeBots, countryAttempt]);

    document.querySelectorAll(".intInput").forEach((input) => {
        input.setAttribute("max", new Date().toISOString().split("T")[0]);
    })

    const compareOn = compareRange !== 0 && compareRange != null;

    // ── "Needs attention" (Overview template). Built only from data this page
    // and the shell already load — no new requests.
    const selectedDomain = handle || currentDomain;
    const hasDomain = Boolean(selectedDomain) && selectedDomain !== "combined view";
    const healthChecks = useDomainHealth(hasDomain ? selectedDomain : null);
    // Scans since consent-phase tagging say which vendors loaded before the
    // scanner accepted consent; only those are a problem. Older scans
    // can't tell, so they keep the neutral "found in the scan" wording.
    const phaseKnown = scanSummary?.consent_phase_known === true;
    const trackers = useMemo(() => [...new Set((scanSummary?.pre_consent_transfers || [])
        .filter((t) => ["advertising", "fingerprinting", "social"].includes(t.category))
        .filter((t) => !phaseKnown || t.consentPhase === "pre")
        .map((t) => t.service || t.host))], [scanSummary, phaseKnown]);
    // buildHealthChecks always returns [logging, last scan]; their labels are translated.
    const logging = healthChecks?.[0];
    const scan = healthChecks?.[1];
    const consentsChange = useMemo(() => periodChangePercent(activeData?.dailyNum), [activeData]);
    const attentionItems = useMemo(() => {
        if (!hasDomain) return [];
        const items = [];
        if (verificationStatus.show) {
            items.push({
                id: "verify",
                severity: "danger",
                title: verificationStatus.isExpired ? "Domain verification has lapsed" : "Domain not verified",
                description: verificationStatus.isExpired
                    ? `Verification for ${verificationStatus.domain} has lapsed — consent data attribution may be paused until re-verified.`
                    : `${verificationStatus.domain} hasn't been verified yet. Without verification, consent interactions for this domain may not be attributed to your account.`,
                action: { label: verificationStatus.isExpired ? "Re-verify" : "See token", to: "/settings/workspaces" },
            });
        }
        if (trackers.length) {
            const vendors = `${trackers.length} advertising or tracking vendor${trackers.length === 1 ? "" : "s"}`;
            items.push({
                id: "trackers",
                severity: phaseKnown ? "danger" : "warning",
                title: phaseKnown
                    ? `${vendors} load${trackers.length === 1 ? "s" : ""} before consent`
                    : `${vendors} found in the latest cookie scan`,
                description: trackers.slice(0, 3).join(", ") + (trackers.length > 3 ? ` and ${trackers.length - 3} more` : ""),
                action: { label: "Review in Compliance", to: reportsPath(id, selectedDomain, "/compliance") },
            });
        }
        if (logging && (logging.status === "warning" || logging.status === "error")) {
            items.push({
                id: "logging",
                severity: logging.status === "error" ? "danger" : "warning",
                title: "Consent logging looks stale",
                description: logging.detail ? logging.detail.charAt(0).toUpperCase() + logging.detail.slice(1) + "." : null,
                action: { label: "Open audit log", to: reportsPath(id, selectedDomain, "/user-consents") },
            });
        }
        if (scan && scan.status === "warning") {
            items.push({
                id: "scan",
                severity: "warning",
                title: scan.detail === t("not scanned yet") ? "No cookie scan yet" : "Cookie scan is out of date",
                description: scan.detail === t("not scanned yet") ? "Run a scan to see which cookies and vendors load on this domain." : `Last scan ${scan.detail}.`,
                action: { label: "Scan now", onClick: triggerOverviewScan },
            });
        }
        return items;
    }, [hasDomain, verificationStatus, phaseKnown, trackers, logging, scan, id, selectedDomain]);

    const healthCheckRow = (label, check) => ({
        label,
        status: !check ? "unknown" : check.status === "error" ? "danger" : check.status,
        text: check ? check.detail : "Checking…",
    });
    const complianceChecks = [
        {
            label: "Domain verification",
            status: verificationStatus.show ? "danger" : "ok",
            text: verificationStatus.show ? (verificationStatus.isExpired ? "Lapsed" : "Not verified") : "Verified",
        },
        healthCheckRow("Consent logging", logging),
        healthCheckRow("Cookie scan", scan),
        {
            label: "Before consent",
            status: !scanSummary ? "unknown" : !trackers.length ? "ok" : phaseKnown ? "danger" : "warning",
            text: !scanSummary ? "No scan yet" : trackers.length ? `${trackers.length} vendor${trackers.length === 1 ? "" : "s"}` : "No trackers",
        },
    ];

    return (
        <>
            <StickyPageTitle demoMode={demoMode} loadingUpdated={loading} finalLoaded={loadingCountry} title={handle ? `Dashboard: ${punycode.toUnicode(handle)}` : "Dashboard"} url={url} method={method} header={header} numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setActiveData} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} previousPeriod={previousPeriod} previousPeriod2={previousPeriod2} compareRange={compareRange} setCompareRange={setCompareRange} setCompareWindowStart={setPreviousPeriod} setCompareWindowEnd={setPreviousPeriod2} />
            <div className="dashboard-content">
                <BotFilterToggle />
                {/* Workspace banner */}
                {activeWorkspace && (
                    <div className="dashboard-workspace-banner">
                        <div className="dashboard-workspace-banner__left">
                            <span className="dashboard-workspace-banner__kicker">Workspace</span>
                            <span className="dashboard-workspace-banner__name">{activeWorkspace.name}</span>
                        </div>
                        {activeWorkspace.domains?.length > 0 && (
                            <div className="dashboard-workspace-banner__domains">
                                {activeWorkspace.domains.slice(0, 3).map((d) => (
                                    <span key={d.domain} className="dashboard-workspace-banner__domain-tag">
                                        {d.domain}
                                    </span>
                                ))}
                                {activeWorkspace.domains.length > 3 && (
                                    <span className="dashboard-workspace-banner__domain-tag dashboard-workspace-banner__domain-tag--more">
                                        +{activeWorkspace.domains.length - 3}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* <div className="profilePicture-container">
                    <img src={userProfile} className="profilePicture" />
                    <p className="profile-user">Welcome, {JSON.parse(appStorage.getItem("globals")).user.name.firstName}</p>
                    <p>This dashboard shows aggregated consent interactions for the selected period. <br />
                        Use it to monitor acceptance rates and category-level consent behavior.</p>

                </div> */}
                <OverviewTemplate
                    attention={<>
                        <div className="home-grid">
                            <Card>
                                {hasDomain ? (
                                    <div className="tw-flex tw-flex-col tw-gap-4">
                                        <AttentionPanel items={attentionItems} loading={!healthChecks && !verificationStatus.show} />
                                        <ComplianceChecks checks={complianceChecks} />
                                    </div>
                                ) : (
                                    <p className="tw-m-0 tw-text-sm tw-text-text-secondary">Choose a domain to see what needs attention.</p>
                                )}
                            </Card>
                            <QuickReport platformId={id} domain={hasDomain ? selectedDomain : null} fromDate={fromDate} toDate={toDate} />
                        </div>
                    </>}
                    main={interactionsError ? (
                        <SectionError
                            title="Consent statistics couldn't be loaded"
                            message={interactionsError}
                            onRetry={() => setInteractionsAttempt((n) => n + 1)}
                        />
                    ) : (
                        <PerformanceBand>
                            <KpiTile
                                plain
                                label="Acceptance"
                                loading={activeData == null}
                                value={formatPercent(activeData?.Accepted)}
                                delta={compareOn && Number.isFinite(activeData?.changeRate?.accepted) ? { value: activeData.changeRate.accepted, formatted: formatPercent(activeData.changeRate.accepted), goodWhen: "up", label: "vs comparison" } : undefined}
                            />
                            <KpiTile
                                plain
                                label="Essential-only"
                                loading={activeData == null}
                                value={formatPercent(activeData?.Declined)}
                                delta={compareOn && Number.isFinite(activeData?.changeRate?.declined) ? { value: activeData.changeRate.declined, formatted: formatPercent(activeData.changeRate.declined), goodWhen: "down", label: "vs comparison" } : undefined}
                            />
                            <KpiTile
                                plain
                                label="Consent decisions"
                                loading={activeData == null}
                                value={formatNumber(activeData?.Total)}
                                delta={compareOn && consentsChange != null ? { value: consentsChange, formatted: formatPercent(consentsChange), goodWhen: "up", label: "vs comparison" } : undefined}
                            />
                            <KpiTile plain label="Active users" loading={activeData == null} value={formatNumber(activeData?.activeUsers)} />
                        </PerformanceBand>
                    )}
                >
                    {!interactionsError && (<>
                        <div className="home-grid">
                            {activeData == null ? <SkeletonCard height={360} label="Loading consent trend…" /> : (
                                <ErrorBoundary>
                                    <ConsentTrend daily={activeData.dailyNum} granularity={activeData.granularity} fromDate={fromDate} toDate={toDate} compareOn={compareOn} />
                                </ErrorBoundary>
                            )}
                            <DecisionSplit activeData={activeData} demoMode={demoMode} />
                        </div>
                        <div className="home-grid">
                            <CategoryOptIn
                                activeData={activeData}
                                compareOn={compareOn}
                                footer={<Link to={analyticsMarketingPath(currentDomain)} className="tw-text-sm tw-font-semibold tw-text-accent-strong focus-visible:tw-outline-none focus-visible:tw-shadow-focus tw-rounded-sm">Marketing recoil analysis</Link>}
                            />
                            <DeviceShare activeData={activeData} />
                        </div>
                    </>)}

                    <div className="home-grid">
                        {loadingCountry ? <SkeletonCard height={360} label="Loading countries…" /> : countryError ? (
                            <SectionError
                                title="Country data couldn't be loaded"
                                message={countryError}
                                onRetry={() => setCountryAttempt((n) => n + 1)}
                            />
                        ) : <CountryRanking countries={activeDataCountry?.data?.Countries} activeData={activeData} demoMode={demoMode} />}
                        <LiveView currentDomain={handle ? handle : currentDomain} demoMode={demoMode} />
                    </div>

                    <div className="home-grid-3">
                        {hasTimeToDecision && <DecisionTime timeToDecision={globalTimeToDecision} onOpen={() => setBehaviourDrawerOpen(true)} />}
                        <LatestScan
                            domain={hasDomain ? selectedDomain : null}
                            scanSummary={scanSummary}
                            scanResult={scanResult}
                            compliancePath={hasDomain ? reportsPath(id, selectedDomain, "/compliance") : null}
                            allScansPath={`/${id}/reports/scans`}
                            platformId={id}
                            workspace={activeWorkspace}
                            scanLoading={scanLoading}
                            onScan={triggerOverviewScan}
                        />
                    </div>
                </OverviewTemplate>

                {hasTimeToDecision && (
                    <DecisionBehaviourDrawer
                        isOpen={behaviourDrawerOpen}
                        onClose={() => setBehaviourDrawerOpen(false)}
                        timeToDecision={timeToDecision}
                        onChangeRegion={setTimeToDecision}
                        timeToDecisionSlice={timeToDecisionSlice}
                        fromDate={fromDate}
                        toDate={toDate}
                    />
                )}
            </div>
        </>
    )
}