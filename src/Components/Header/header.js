import { OrganisationContext, DomainContext, WorkspaceContext } from "../../App";
import "./header.css";
import logo from "./logo.svg";
import logoAnalytics from "./logo-analytics.svg";
import Fetch from "../../Functions/fetch";
import API from "../../API/api";
import Authentication from "../../Authentication/Auth";
import IntastellarAccounts from "../IntastellarAccounts/IntastellarAccounts";
import PropertySelector from "./PropertySelector.js";
import AnalyticsHeaderSearch from "./AnalyticsHeaderSearch.js";
import { t } from "../../i18n/index.js";
import {
    parseHandleFromPath,
    decodeDomainPathSegment,
    navigateWithDomain,
    detectDashboardMode,
    modePath,
    isCombinedOrClearDomain,
} from "../../Functions/domainPathSegments.js";
import { pushRecentDomain } from "../../Functions/domainFavourites.js";
import { canAccess } from "../../Functions/tier.js";
import punycode from "punycode";
import appStorage from '../../Functions/storage.js';
import { ScannerHost } from "../../API/host";
import DomainHealthPill from "../Shell/DomainHealthPill.js";
import NotificationCenter from "../Notifications/index.js";
import HelpCenter from "../Help/index.js";
import { isNewShell } from "../../Functions/featureFlags.js";

const { useState, useEffect, useContext, useMemo, useRef, useCallback } = React;

const useHistory = window.ReactRouterDOM.useHistory;
const useLocation = window.ReactRouterDOM.useLocation;

/**
 * Get current workspace info from localStorage
 */
function getCurrentWorkspace() {
    try {
        const stored = localStorage.getItem("current_workspace");
        if (stored) {
            return JSON.parse(stored);
        }
    } catch {
        /* ignore */
    }
    return null;
}

/**
 * Set current workspace in localStorage
 */
function setCurrentWorkspace(workspace) {
    if (workspace) {
        localStorage.setItem("current_workspace", JSON.stringify(workspace));
    } else {
        localStorage.removeItem("current_workspace");
    }
}

/**
 * Set workspace filter domains for API calls
 * When set, the dashboard will filter to only these domains
 */
function setWorkspaceFilter(domains) {
    if (domains && domains.length > 0) {
        localStorage.setItem("workspace_filter", JSON.stringify(domains));
    } else {
        localStorage.removeItem("workspace_filter");
    }
}

/**
 * Clear workspace filter
 */
function clearWorkspaceFilter() {
    localStorage.removeItem("workspace_filter");
}

/**
 * Get workspace filter domains (for use in API calls)
 */
export function getWorkspaceFilter() {
    try {
        const stored = localStorage.getItem("workspace_filter");
        if (stored) {
            return JSON.parse(stored);
        }
    } catch {
        /* ignore */
    }
    return null;
}

function domainLabelForHeader(pathname, globalDomain) {
    const pathHandle = parseHandleFromPath(pathname);
    if (pathHandle != null) {
        const decoded = decodeDomainPathSegment(pathHandle);
        return decoded != null ? decoded : "combined view";
    }
    if (/\/[^/]+\/(?:reports|dashboard)(?:\/|$)/.test(pathname) || /^\/analytics(?:\/|$)/.test(pathname)) {
        return "combined view";
    }
    return globalDomain || "combined view";
}

/*
 * Hydrate the dropdown from the existing `domains` localStorage key
 * — a string array of allowed domain names persisted whenever this
 * header (or any other surface) successfully fetches domains. Using
 * the same cache the rest of the app already maintains avoids a
 * second source of truth.
 *
 * The cache stores names only (no `installed`/`icon` metadata), so
 * we synthesise minimal row objects shaped like the API response and
 * re-prepend the "combined view" entry the cache strips out before
 * persisting.
 */
function readCachedDomains() {
    try {
        const raw = localStorage.getItem("domains");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        const names = parsed.filter(
            (n) => typeof n === "string" && n && n !== "combined view"
        );
        if (names.length === 0) return null;
        return [
            { domain: "combined view", installed: null, lastedVisited: null },
            ...names.map((domain) => ({
                domain,
                installed: null,
                lastedVisited: null,
            })),
        ];
    } catch {
        return null;
    }
}

function hasAgencySubscription() {
    return canAccess('agency-pro');
}

/**
 * Read agency workspaces from localStorage
 */
function readAgencyWorkspaces() {
    try {
        const stored = localStorage.getItem("agency_workspaces");
        if (stored) {
            const workspaces = JSON.parse(stored);
            // Migrate old single-domain workspaces to multi-domain format
            return workspaces.map((ws) => {
                if (ws.domain && !ws.domains) {
                    return {
                        ...ws,
                        domains: [{ domain: ws.domain, isPrimary: true }],
                    };
                }
                return ws;
            });
        }
    } catch {
        /* ignore */
    }
    return [];
}

/**
 * Get current organisation ID for verification checks
 */
function getCurrentOrgId() {
    try {
        const orgRaw = appStorage.getItem("organisation");
        if (orgRaw) {
            const org = JSON.parse(orgRaw);
            return org?.id || null;
        }
    } catch {
        /* ignore */
    }
    return null;
}

// Switching CMP -> Analytics with no domain selected used to always land on
// the combined/rollup view, even when the org has a domain with analytics
// already set up — picking a real domain first is a much more useful
// landing spot. `domains` is the header's own domain list (first entry is
// the synthetic "combined view" row, see the `data.unshift` above), kept in
// whatever order the API returned so this just defers to that ordering.
async function resolveFirstAnalyticsDomain(orgId, domains) {
    if (!orgId) return null;
    try {
        const r = await fetch(`${ScannerHost}/api/analytics-site?list=1`, {
            headers: {
                Authorization: Authentication.getToken(),
                Organisation: String(orgId),
                "Content-Type": "application/json",
            },
        });
        if (!r.ok) return null;
        const d = await r.json();
        const active = new Set((d?.sites || []).filter((s) => s.active).map((s) => s.domain));
        for (const entry of domains || []) {
            const name = punycode.toUnicode(entry.domain);
            if (active.has(name)) return name;
        }
    } catch {
        /* ignore — caller falls back to the current domain */
    }
    return null;
}

/*
 * Resolve the platform key whose `getDomains` we should call. Routes
 * like /experiments or /settings aren't platform namespaces in the
 * API map, so the literal first path segment can't be used blindly.
 * We fall back to the platform stored at login time (or "gdpr" as a
 * last resort) whenever the derived key doesn't expose getDomains.
 */
function resolveDomainsPlatformKey(API) {
    const fromPath = window.location.pathname.split("/")[1];
    if (fromPath && API[fromPath]?.getDomains?.url) return fromPath;
    const fromStorage = localStorage.getItem("platform");
    if (fromStorage && API[fromStorage]?.getDomains?.url) return fromStorage;
    return "gdpr";
}

const newShell = isNewShell();

export default function Header(props) {
    // Phone headers wrap to a height CSS can't know; the page offset and the
    // sticky title follow the real height so no gap shows between them.
    useEffect(() => {
        const header = document.querySelector(".dashboard-header");
        if (!header || !window.ResizeObserver) return undefined;
        const publish = () => document.documentElement.style.setProperty("--header-height", `${Math.ceil(header.getBoundingClientRect().height)}px`);
        publish();
        const observer = new ResizeObserver(publish);
        observer.observe(header);
        return () => observer.disconnect();
    }, []);


    const [Organisation, setOrganisation] = useContext(OrganisationContext);
    const [globalDomain, setGlobalDomain] = useContext(DomainContext);
    const location = useLocation();
    const displayDomain = useMemo(
        () => domainLabelForHeader(location.pathname, globalDomain),
        [location.pathname, globalDomain]
    );
    const [currentDomain, setCurrentDomain] = useState(displayDomain);
    const profileImage = JSON.parse(appStorage.getItem("globals"))?.user?.avatar;
    const history = useHistory();
    const platformId = props.id || window.location.pathname.split("/").filter(Boolean)[0] || "gdpr";
    const [allOrganisations, setallOrganisations] = useState(null);
    /*
     * Bootstrap order on first render:
     *   1. props.domains (passed by App.js once it has fetched)
     *   2. cached domains from localStorage (so a hard reload on
     *      /experiments still has a populated dropdown before any
     *      network round-trip resolves)
     *   3. null — the placeholder selector renders briefly until the
     *      effect below repopulates from the API.
     */
    const [domains, setDomains] = useState(
        () => props.domains || readCachedDomains()
    );
    const [viewUserProfile, setViewUserProfile] = useState(false);
    const [activeWorkspace, setActiveWorkspace] = useContext(WorkspaceContext);
    const [agencyWorkspaces, setAgencyWorkspaces] = useState(() => readAgencyWorkspaces());
    const Platform = (localStorage.getItem("platform") == "gdpr") ? "Intastellar Consents | CMP" : "Ferry Booking";


    useEffect(() => {
        setCurrentDomain(displayDomain);
    }, [displayDomain]);

    useEffect(() => {

        Fetch(API.settings.getOrganisation.url, API.settings.getOrganisation.method, API.settings.getOrganisation.headers, JSON.stringify({
            organisationMember: Authentication.getUserId()
        })).then((data) => {
            if (data === "Err_Login_Expired") {
                appStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }

            if (JSON.parse(appStorage.getItem("globals")).organisation == null) {
                JSON.parse(appStorage.getItem("globals")).organisation = data;
            }
            setallOrganisations(data);
        });

        // Fetch workspaces from backend so the profile switcher and domain
        // dropdown always reflect the live DB state.
        const wsOrgId = Authentication.getOrganisation();
        if (wsOrgId && API.workspaces?.list?.url) {
            fetch(API.workspaces.list.url, {
                method: "GET",
                headers: {
                    "Authorization": Authentication.getToken(),
                    "Organisation": String(wsOrgId),
                    "Content-Type": "application/json",
                },
            })
                .then((r) => r.ok ? r.json() : null)
                .then((data) => {
                    if (!data?.workspaces) return;
                    setAgencyWorkspaces(data.workspaces);
                    localStorage.setItem("agency_workspaces", JSON.stringify(data.workspaces));
                })
                .catch(() => {});
        }

        const platformKey = resolveDomainsPlatformKey(API);
        const domainsApi = API[platformKey]?.getDomains;
        if (!domainsApi?.url) {
            return;
        }
        Fetch(domainsApi.url, domainsApi.method, domainsApi.headers).then((data) => {
            if (data === "Err_Login_Expired") {
                appStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }

            if (data?.error == "Err_No_Domains") {

            } else if (Array.isArray(data)) {
                data.unshift({ domain: "combined view", installed: null, lastedVisited: null });
                data?.map((d) => {
                    return punycode.toUnicode(d.domain);
                }).filter((d) => {
                    return d !== undefined && d !== "" && d !== "undefined.";
                });
                setDomains(data);

                const allowedDomains = data?.map((d) => {
                    return punycode.toUnicode(d.domain);
                }).filter((d) => {
                    return d !== undefined && d !== "" && d !== "undefined." && d !== "combined view";
                });

                localStorage.setItem("domains", JSON.stringify(allowedDomains));

            }
        });
    }, []);


    const orgId = getCurrentOrgId();
    const dashboardMode = detectDashboardMode(location.pathname);

    function handlePropertySelect(action) {
        if (action.type === "exit-workspace") {
            setActiveWorkspace(null);
            setCurrentWorkspace(null);
            clearWorkspaceFilter();
            setCurrentDomain("combined view");
            setGlobalDomain("combined view");
            navigateWithDomain(history, platformId, "combined view", location.pathname);
            return;
        }

        if (action.type === "workspace-combined") {
            setWorkspaceFilter(action.workspaceDomains);
            setCurrentDomain("combined view");
            setGlobalDomain("combined view");
            navigateWithDomain(history, platformId, "combined view", location.pathname);
            return;
        }

        if (action.type === "workspace-domain") {
            clearWorkspaceFilter();
            setCurrentDomain(action.name);
            setGlobalDomain(action.name);
            pushRecentDomain(action.name);
            navigateWithDomain(history, platformId, action.name, location.pathname);
            return;
        }

        setCurrentDomain(action.name);
        setGlobalDomain(action.name);

        if (action.type === "workspace") {
            let ws = action.workspaceData;
            if (!ws) {
                const workspaces = readAgencyWorkspaces();
                ws = workspaces.find((w) => w.id === action.id);
            }
            if (ws) {
                setActiveWorkspace(ws);
                setCurrentWorkspace(ws);
                setWorkspaceFilter(ws.domains?.map((d) => d.domain) || []);
            }
        } else {
            setActiveWorkspace(null);
            setCurrentWorkspace(null);
            clearWorkspaceFilter();
            pushRecentDomain(action.name);
        }

        navigateWithDomain(history, platformId, action.name, location.pathname);
    }

    async function handleModeChange(mode) {
        if (mode === "analytics" && isCombinedOrClearDomain(currentDomain)) {
            const firstAnalyticsDomain = await resolveFirstAnalyticsDomain(orgId, domains);
            if (firstAnalyticsDomain) {
                history.push(modePath(mode, platformId, firstAnalyticsDomain));
                return;
            }
        }
        history.push(modePath(mode, platformId, currentDomain));
    }

    return (
        <>
            <header className="dashboard-header">
                <div className={"dashboard-profile" + (newShell ? " shell-profile" : "")}>
                    <section className="logo-selector-container">
                        <section className="logo_container">
                            <button className="menu" aria-label={t("Toggle navigation")} onClick={() => {
                                if (newShell) window.dispatchEvent(new Event("shell:toggle-rail"));
                                else document.querySelector(".navOverlay")?.classList.toggle("expand");
                            }}>
                                <div className="menu-bar"></div>
                                <div className="menu-bar"></div>
                                <div className="menu-bar"></div>
                            </button>
                            <img className="dashboard-logo" src={dashboardMode === "analytics" ? logoAnalytics : logo} alt={dashboardMode === "analytics" ? "Intastellar Analytics" : "Intastellar Consents"} />
                        </section>
                        <section className="company_container">
                            {/* Users outside an organisation still need the CMP/Analytics
                                switch and domain picker — only the org switcher depends
                                on organisation data, and PropertySelector hides it when
                                `organisation` is null. */}
                            {(domains && currentDomain) ? (
                                <PropertySelector
                                    mode={dashboardMode}
                                    onModeChange={handleModeChange}
                                    currentDomain={currentDomain}
                                    domains={domains}
                                    activeWorkspace={activeWorkspace}
                                    agencyWorkspaces={agencyWorkspaces}
                                    hasAgency={hasAgencySubscription()}
                                    orgId={orgId}
                                    organisation={(allOrganisations && Organisation) ? {
                                        current: Organisation,
                                        all: allOrganisations,
                                        onChange: (e) => {
                                            setOrganisation(e);
                                            appStorage.setItem("organisation", e);
                                            window.location.reload();
                                        },
                                    } : null}
                                    onSelect={handlePropertySelect}
                                />
                            ) : (
                                <div className="selector selector--placeholder" aria-hidden="true" />
                            )}
                        </section>
                        {dashboardMode === "analytics" && (
                            <section className="analytics-header-search">
                                <AnalyticsHeaderSearch />
                            </section>
                        )}
                    </section>
                    {newShell && (
                        <div className="shell-topbar-tools">
                            {/* StickyPageTitle renders the page's date range in here. */}
                            <div id="shell-daterange-slot" className="shell-topbar-date" />
                            {dashboardMode !== "analytics" && <DomainHealthPill />}
                        </div>
                    )}
                    <div className="flex profileImage" style={{ gap: "12px" }}>
                        <HelpCenter />
                        <NotificationCenter />
                        <img src={profileImage} className="content-img" onClick={() => setViewUserProfile(!viewUserProfile)} />
                    </div>
                </div>
                {(viewUserProfile) ? <IntastellarAccounts
                    profile={{
                        image: profileImage,
                        name: JSON.parse(appStorage.getItem("globals"))?.user?.name?.firstName,
                        email: JSON.parse(appStorage.getItem("globals"))?.user?.email,
                    }}
                    workspaces={agencyWorkspaces}
                    activeWorkspace={activeWorkspace}
                    onWorkspaceSelect={(ws) => {
                        setActiveWorkspace(ws);
                        setCurrentWorkspace(ws);
                        setWorkspaceFilter(ws.domains?.map((d) => d.domain) || []);
                        setViewUserProfile(false);
                    }}
                    onWorkspaceClear={() => {
                        setActiveWorkspace(null);
                        setCurrentWorkspace(null);
                        clearWorkspaceFilter();
                        setViewUserProfile(false);
                    }}
                    setIsOpen={setViewUserProfile}
                /> : null}
            </header>
        </>
    )
}
