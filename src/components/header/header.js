import { OrganisationContext, DomainContext, WorkspaceContext } from "../../App";
import "./header.css";
import logo from "./logo.svg";
import Fetch from "../../Functions/fetch";
import API from "../../API/api";
import Authentication from "../../Authentication/Auth";
import IntastellarAccounts from "../IntastellarAccounts/IntastellarAccounts";
import PropertySelector from "./PropertySelector.js";
import {
    parseHandleFromPath,
    decodeDomainPathSegment,
    navigateWithDomain,
    detectDashboardMode,
    modePath,
} from "../../Functions/domainPathSegments.js";
import { pushRecentDomain } from "../../Functions/domainFavourites.js";
import { canAccess } from "../../Functions/tier.js";
import punycode from "punycode";
import appStorage from '../../Functions/storage.js';
import { ScannerHost } from "../../API/host";

const { useState, useEffect, useContext, useMemo, useRef, useCallback } = React;

function NotificationCenter() {
    const authToken = Authentication.getToken();
    const orgId = Authentication.getOrganisation();

    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unread, setUnread] = useState(0);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef(null);

    const fetchNotifications = useCallback(async () => {
        if (!authToken || !orgId) return;
        try {
            const resp = await fetch(`${ScannerHost}/api/ad-alerts?resource=notifications`, {
                headers: { Authorization: authToken, Organisation: String(orgId) },
            });
            if (!resp.ok) return;
            const data = await resp.json();
            setNotifications(data.notifications || []);
            setUnread(data.unreadCount || 0);
        } catch {}
    }, [authToken, orgId]);

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    useEffect(() => {
        if (!open) return;
        function handleClick(e) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    async function markAllRead() {
        if (!authToken || !orgId) return;
        try {
            await fetch(`${ScannerHost}/api/ad-alerts`, {
                method: "POST",
                headers: { Authorization: authToken, Organisation: String(orgId), "Content-Type": "application/json" },
                body: JSON.stringify({ action: "mark-read", all: true }),
            });
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            setUnread(0);
        } catch {}
    }

    async function markOneRead(id) {
        if (!authToken || !orgId) return;
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        setUnread(prev => Math.max(0, prev - 1));
        try {
            await fetch(`${ScannerHost}/api/ad-alerts`, {
                method: "POST",
                headers: { Authorization: authToken, Organisation: String(orgId), "Content-Type": "application/json" },
                body: JSON.stringify({ action: "mark-read", notificationId: id }),
            });
        } catch {}
    }

    function timeAgo(iso) {
        const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
        if (diff < 60) return "just now";
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }

    return (
        <div className="notif-center" ref={dropdownRef}>
            <button
                className="notif-bell"
                onClick={() => { setOpen(o => !o); if (!open) fetchNotifications(); }}
                aria-label="Notifications"
                title="Notifications"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unread > 0 && (
                    <span className="notif-badge">{unread > 99 ? "99+" : unread}</span>
                )}
            </button>

            {open && (
                <div className="notif-dropdown">
                    <div className="notif-dropdown__header">
                        <span className="notif-dropdown__title">Notifications</span>
                        {unread > 0 && (
                            <button className="notif-dropdown__mark-all" onClick={markAllRead}>
                                Mark all read
                            </button>
                        )}
                    </div>

                    <div className="notif-dropdown__list">
                        {loading && (
                            <p className="notif-dropdown__empty">Loading…</p>
                        )}
                        {!loading && notifications.length === 0 && (
                            <p className="notif-dropdown__empty">No notifications yet</p>
                        )}
                        {notifications.map(n => (
                            <div
                                key={n.id}
                                className={`notif-item${n.read ? "" : " notif-item--unread"}`}
                                onClick={() => !n.read && markOneRead(n.id)}
                            >
                                <div className="notif-item__body">
                                    <span className="notif-item__title">{n.title || n.rule_type}</span>
                                    <span className="notif-item__msg">{n.message || n.body}</span>
                                </div>
                                <div className="notif-item__meta">
                                    <span className="notif-item__domain">{n.domain}</span>
                                    <span className="notif-item__time">{timeAgo(n.created_at)}</span>
                                </div>
                                {!n.read && <span className="notif-item__dot" aria-label="unread" />}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
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

    function handleModeChange(mode) {
        history.push(modePath(mode, platformId, currentDomain));
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
                            {(domains && currentDomain && allOrganisations && Organisation) ? (
                                <PropertySelector
                                    mode={dashboardMode}
                                    onModeChange={handleModeChange}
                                    currentDomain={currentDomain}
                                    domains={domains}
                                    activeWorkspace={activeWorkspace}
                                    agencyWorkspaces={agencyWorkspaces}
                                    hasAgency={hasAgencySubscription()}
                                    orgId={orgId}
                                    organisation={{
                                        current: Organisation,
                                        all: allOrganisations,
                                        onChange: (e) => {
                                            setOrganisation(e);
                                            appStorage.setItem("organisation", e);
                                            window.location.reload();
                                        },
                                    }}
                                    onSelect={handlePropertySelect}
                                />
                            ) : (
                                <div className="selector selector--placeholder" aria-hidden="true" />
                            )}
                        </section>
                    </section>
                    <div className="flex profileImage" style={{ gap: "12px" }}>
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
