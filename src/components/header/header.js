import { OrganisationContext, DomainContext, WorkspaceContext } from "../../App";
import "./header.css";
import logo from "./logo.svg";
import Fetch from "../../Functions/fetch";
import API from "../../API/api";
import Authentication from "../../Authentication/Auth";
import Select from "../SelectInput/Selector";
import IntastellarAccounts from "../IntastellarAccounts/IntastellarAccounts";
import {
    parseHandleFromPath,
    decodeDomainPathSegment,
    navigateWithDomain,
} from "../../Functions/domainPathSegments.js";
import {
    isDomainVerified,
    isVerificationExpired,
} from "../../Functions/domainVerification.js";
import { canAccess } from "../../Functions/tier.js";
import punycode from "punycode";
import appStorage from '../../Functions/storage.js';

const { useState, useEffect, useContext, useMemo } = React;
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
    if (/\/[^/]+\/(?:reports|dashboard)(?:\/|$)/.test(pathname)) {
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
 * Get primary domain from a workspace
 */
function getPrimaryDomainFromWorkspace(ws) {
    if (!ws.domains || ws.domains.length === 0) {
        return ws.domain || null;
    }
    const primary = ws.domains.find((d) => d.isPrimary);
    return primary?.domain || ws.domains[0]?.domain || null;
}

/**
 * Get verification status for dropdown display
 */
function getDomainVerificationStatus(domain, orgId) {
    if (!orgId || !domain || domain === "combined view") {
        return null;
    }
    if (isDomainVerified(domain, orgId)) {
        return "verified";
    }
    if (isVerificationExpired(domain, orgId)) {
        return "expired";
    }
    return "unverified";
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

export default function Header(props) {

    const [Organisation, setOrganisation] = useContext(OrganisationContext);
    const [globalDomain, setGlobalDomain] = useContext(DomainContext);
    const location = useLocation();
    const displayDomain = useMemo(
        () => domainLabelForHeader(location.pathname, globalDomain),
        [location.pathname, globalDomain]
    );
    const [currentDomain, setCurrentDomain] = useState(displayDomain);
    const profileImage = JSON.parse(appStorage.getItem("globals"))?.user?.avatar;
    let domainList = null;
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


    // Build domain list based on whether a workspace is active
    domainList = [];
    const orgId = getCurrentOrgId();

    if (activeWorkspace) {
        // When workspace is active, show only workspace domains
        domainList.push({
            name: `${activeWorkspace.name}`,
            disabled: true,
            type: "separator"
        });

        // Add combined view for workspace (aggregates all workspace domains)
        domainList.push({
            icon: null,
            name: "combined view",
            label: "All domains (combined)",
            type: "workspace-combined",
            workspaceId: activeWorkspace.id,
            workspaceDomains: activeWorkspace.domains?.map(d => d.domain) || []
        });

        // Add workspace domains with verification status
        if (activeWorkspace.domains && activeWorkspace.domains.length > 0) {
            activeWorkspace.domains.forEach((d) => {
                const verifyStatus = getDomainVerificationStatus(d.domain, orgId);
                domainList.push({
                    icon: null,
                    name: d.domain,
                    type: "workspace-domain",
                    isPrimary: d.isPrimary,
                    verificationStatus: verifyStatus
                });
            });
        }

        // Add option to exit workspace
        domainList.push({
            name: "Exit Workspace",
            disabled: true,
            type: "separator"
        });
        domainList.push({
            icon: null,
            name: "combined view",
            label: "← Back to all domains",
            type: "exit-workspace"
        });
    } else {
        // Normal mode: show workspaces first, then all domains

        // For agency users, add client workspaces at the top
        if (hasAgencySubscription()) {
            if (agencyWorkspaces.length > 0) {
                // Add workspaces header
                domainList.push({
                    name: "Client Workspaces",
                    disabled: true,
                    type: "separator"
                });
                // Add workspaces to the list
                agencyWorkspaces.forEach((ws) => {
                    const primaryDomain = getPrimaryDomainFromWorkspace(ws);
                    const domainCount = ws.domains?.length || 1;
                    domainList.push({
                        icon: null,
                        name: primaryDomain || ws.name,
                        label: ws.name,
                        sublabel: domainCount > 1 ? `${domainCount} domains` : primaryDomain,
                        type: "workspace",
                        workspaceId: ws.id,
                        workspaceData: ws
                    });
                });
            }
        }

        // Add domains from API with verification status
        const apiDomains = domains?.map((d) => {
            const domainName = punycode.toUnicode(d.domain);
            const verifyStatus = getDomainVerificationStatus(domainName, orgId);
            return {
                icon: d.icon || null,
                name: domainName,
                type: "domain",
                verificationStatus: verifyStatus
            }
        }) || [];

        if (apiDomains.length > 0) {
            // Add separator if we have workspaces above
            if (domainList.length > 0) {
                domainList.push({
                    name: "Your Domains",
                    disabled: true,
                    type: "separator"
                });
            }
            domainList.push(...apiDomains);
        }
    }

    return (
        <>
            <header className="dashboard-header">
                <div className="dashboard-profile">
                    <section className="logo-selector-container">
                        <section className="logo_container">
                            <button className="menu" onClick={() => {
                                document.querySelector(".navOverlay").classList.toggle("expand");
                            }}>
                                <div className="menu-bar"></div>
                                <div className="menu-bar"></div>
                                <div className="menu-bar"></div>
                            </button>
                            <img className="dashboard-logo" src={logo} alt="Intastellar Solutions Logo" />
                        </section>
                        <section className="company_container">
                            {(allOrganisations && Organisation) ? (
                                <Select
                                    defaultValue={Organisation}
                                    onChange={(e) => {
                                        setOrganisation(e);
                                        appStorage.setItem("organisation", e);
                                        window.location.reload();
                                    }}
                                    items={allOrganisations}
                                    align="right"
                                />
                            ) : (
                                <div className="selector selector--placeholder" aria-hidden="true" />
                            )}
                            {domains && currentDomain ? (
                                <>
                                    <Select
                                        key={`domain-${location.pathname}`}
                                        defaultValue={currentDomain}
                                        onChange={(e) => {
                                            const parsed = JSON.parse(e);
                                            const domain = parsed.name;

                                            // Handle exit workspace
                                            if (parsed.type === "exit-workspace") {
                                                setActiveWorkspace(null);
                                                setCurrentWorkspace(null);
                                                clearWorkspaceFilter();
                                                setCurrentDomain("combined view");
                                                setGlobalDomain("combined view");
                                                navigateWithDomain(history, platformId, "combined view", location.pathname);
                                                return;
                                            }

                                            // Handle workspace combined view
                                            if (parsed.type === "workspace-combined") {
                                                // Store workspace domains for API filtering
                                                setWorkspaceFilter(parsed.workspaceDomains);
                                                setCurrentDomain("combined view");
                                                setGlobalDomain("combined view");
                                                navigateWithDomain(history, platformId, "combined view", location.pathname);
                                                return;
                                            }

                                            // Handle workspace domain selection
                                            if (parsed.type === "workspace-domain") {
                                                // Clear workspace filter when selecting single domain
                                                clearWorkspaceFilter();
                                                setCurrentDomain(domain);
                                                setGlobalDomain(domain);
                                                navigateWithDomain(history, platformId, domain, location.pathname);
                                                return;
                                            }

                                            setCurrentDomain(domain);
                                            setGlobalDomain(domain);

                                            // Track workspace selection
                                            if (parsed.type === "workspace") {
                                                // Use workspaceData if available, otherwise fetch from storage
                                                let ws = parsed.workspaceData;
                                                if (!ws) {
                                                    const workspaces = readAgencyWorkspaces();
                                                    ws = workspaces.find(w => w.id === parsed.id);
                                                }
                                                if (ws) {
                                                    setActiveWorkspace(ws);
                                                    setCurrentWorkspace(ws);
                                                    // Set workspace filter for combined view by default
                                                    const wsDomains = ws.domains?.map(d => d.domain) || [];
                                                    setWorkspaceFilter(wsDomains);
                                                }
                                            } else {
                                                // Selecting regular domain clears workspace
                                                setActiveWorkspace(null);
                                                setCurrentWorkspace(null);
                                                clearWorkspaceFilter();
                                            }

                                            navigateWithDomain(history, platformId, domain, location.pathname);
                                        }}
                                        items={domainList}
                                        align="left"
                                    />
                                    {activeWorkspace && (
                                        <div className="workspace-indicator">
                                            <span className="workspace-indicator__badge">Workspace</span>
                                            <span className="workspace-indicator__name">{activeWorkspace.name}</span>
                                            {activeWorkspace.domains?.length > 1 && (
                                                <span className="workspace-indicator__domains">
                                                    {activeWorkspace.domains.length} domains
                                                </span>
                                            )}
                                            <button
                                                className="workspace-indicator__exit"
                                                onClick={() => {
                                                    setActiveWorkspace(null);
                                                    setCurrentWorkspace(null);
                                                    clearWorkspaceFilter();
                                                    setCurrentDomain("combined view");
                                                    setGlobalDomain("combined view");
                                                    navigateWithDomain(history, platformId, "combined view", location.pathname);
                                                }}
                                                title="Exit workspace"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="selector selector--placeholder" aria-hidden="true" />
                            )}
                        </section>
                    </section>
                    <div className="flex profileImage">
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
