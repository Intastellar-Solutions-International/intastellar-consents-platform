import "./PropertySelector.css";
import punycode from "punycode";
import {
    isDomainVerified,
    isVerificationExpired,
} from "../../Functions/domainVerification.js";
import {
    getFavouriteDomains,
    toggleFavouriteDomain,
    getRecentDomains,
} from "../../Functions/domainFavourites.js";
import dashboardIcon from "./icons/dashboard.svg";
import reportsIcon from "./icons/reports.svg";
import Authentication from "../../Authentication/Auth.js";
import { ScannerHost } from "../../API/host.js";

const { useState, useEffect, useMemo, useRef } = React;

const MODES = [
    { id: "cmp", label: "CMP Dashboard", icon: dashboardIcon },
    { id: "analytics", label: "Site Analytics", icon: reportsIcon },
];

function getDomainVerificationStatus(domain, orgId) {
    if (!orgId || !domain || domain === "combined view") return null;
    if (isDomainVerified(domain, orgId)) return "verified";
    if (isVerificationExpired(domain, orgId)) return "expired";
    return "unverified";
}

function getPrimaryDomainFromWorkspace(ws) {
    if (!ws.domains || ws.domains.length === 0) return ws.domain || null;
    const primary = ws.domains.find((d) => d.isPrimary);
    return primary?.domain || ws.domains[0]?.domain || null;
}

function verifyBadge(status) {
    if (!status) return null;
    const glyph = status === "verified" ? "✓" : status === "expired" ? "!" : "?";
    return (
        <span className={`property-selector__verify property-selector__verify--${status}`}>
            {glyph}
        </span>
    );
}

function analyticsBadge(hasAnalytics) {
    if (!hasAnalytics) return null;
    return (
        <span className="property-selector__analytics-badge" title="Analytics installed">
            ●
        </span>
    );
}

// Which of this org's domains have an active analytics site key — fetched
// once the panel is relevant (analytics mode) rather than up front, and
// refreshed each time the panel opens (e.g. right after enabling a site from
// the setup card elsewhere in the app).
function useAnalyticsEnabledDomains(orgId, shouldFetch) {
    const [domains, setDomains] = useState(() => new Set());

    useEffect(() => {
        if (!orgId || !shouldFetch) return;
        let cancelled = false;
        fetch(`${ScannerHost}/api/analytics-site?list=1`, {
            headers: {
                Authorization: Authentication.getToken(),
                Organisation: String(orgId),
                "Content-Type": "application/json",
            },
        })
            .then(async (r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (cancelled || !d?.sites) return;
                setDomains(new Set(d.sites.filter((s) => s.active).map((s) => s.domain)));
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [orgId, shouldFetch]);

    return domains;
}

export default function PropertySelector(props) {
    const {
        mode,
        onModeChange,
        currentDomain,
        domains,
        activeWorkspace,
        agencyWorkspaces,
        hasAgency,
        orgId,
        organisation,
        onSelect,
    } = props;

    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("all");
    const [query, setQuery] = useState("");
    const [orgMenuOpen, setOrgMenuOpen] = useState(false);
    const [favourites, setFavourites] = useState(() => getFavouriteDomains());
    const containerRef = useRef(null);
    const analyticsDomains = useAnalyticsEnabledDomains(orgId, mode === "analytics" && isOpen);

    useEffect(() => {
        function onClickOutside(e) {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
                setOrgMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        setQuery("");
        setActiveTab("all");
        setOrgMenuOpen(false);
        setFavourites(getFavouriteDomains());
    }, [isOpen]);

    const orgLabel = useMemo(() => {
        try {
            return JSON.parse(organisation?.current)?.name || "Organisation";
        } catch {
            return "Organisation";
        }
    }, [organisation?.current]);

    const workspaceItems = useMemo(() => {
        const items = [{ key: "__all__", type: "all", name: "All domains" }];
        if (hasAgency && agencyWorkspaces?.length > 0) {
            agencyWorkspaces.forEach((ws) => {
                const primaryDomain = getPrimaryDomainFromWorkspace(ws);
                const domainCount = ws.domains?.length || 1;
                items.push({
                    key: ws.id,
                    type: "workspace",
                    id: ws.id,
                    name: primaryDomain || ws.name,
                    label: ws.name,
                    sublabel: domainCount > 1 ? `${domainCount} domains` : primaryDomain,
                    workspaceData: ws,
                });
            });
        }
        return items;
    }, [agencyWorkspaces, hasAgency]);

    const domainItems = useMemo(() => {
        if (activeWorkspace) {
            // Unlike the plain org-level `domains` list below, workspace
            // domains come from a separate backend (list-workspaces) that
            // isn't guaranteed to hand back the same punycode-decoded Unicode
            // form — left un-decoded here, an IDN domain (or one that's just
            // differently-cased) would set globalDomain to a string that
            // never matches analytics_sites.domain, permanently showing
            // noSiteKey for a domain that genuinely has one. Decode the same
            // way the non-workspace branch does so both paths agree.
            const combined = {
                key: "__workspace_combined__",
                type: "workspace-combined",
                name: "combined view",
                label: "All domains (combined)",
                workspaceId: activeWorkspace.id,
                workspaceDomains: activeWorkspace.domains?.map((d) => punycode.toUnicode(d.domain)) || [],
            };
            const wsDomains = (activeWorkspace.domains || []).map((d) => {
                const name = punycode.toUnicode(d.domain);
                return {
                    key: name,
                    type: "workspace-domain",
                    name,
                    isPrimary: d.isPrimary,
                    verificationStatus: getDomainVerificationStatus(name, orgId),
                    hasAnalytics: analyticsDomains.has(name),
                };
            });
            return [combined, ...wsDomains];
        }
        return (domains || []).map((d) => {
            const name = punycode.toUnicode(d.domain);
            return {
                key: name,
                type: "domain",
                name,
                icon: d.icon || null,
                verificationStatus: getDomainVerificationStatus(name, orgId),
                hasAnalytics: analyticsDomains.has(name),
            };
        });
    }, [activeWorkspace, domains, orgId, analyticsDomains]);

    const recent = useMemo(() => getRecentDomains(), [isOpen]);

    const filteredWorkspaces = useMemo(() => {
        if (!query.trim()) return workspaceItems;
        const q = query.toLowerCase();
        return workspaceItems.filter(
            (item) =>
                item.name?.toLowerCase().includes(q) || item.label?.toLowerCase().includes(q)
        );
    }, [workspaceItems, query]);

    const filteredDomains = useMemo(() => {
        const q = query.trim().toLowerCase();
        return domainItems.filter((item) => {
            if (q && !item.name.toLowerCase().includes(q)) return false;
            if (activeTab === "favourites") return favourites.includes(item.name);
            if (activeTab === "recent") return recent.includes(item.name);
            if (activeTab === "with-analytics") return item.hasAnalytics;
            return true;
        });
    }, [domainItems, query, activeTab, favourites, recent]);

    function pick(action) {
        onSelect(action);
        setIsOpen(false);
    }

    function handleWorkspaceClick(item) {
        if (item.type === "all") {
            pick({ type: "exit-workspace", name: "combined view" });
            return;
        }
        pick({ type: "workspace", id: item.id, name: item.name, workspaceData: item.workspaceData });
    }

    function handleDomainClick(item) {
        if (item.type === "workspace-combined") {
            pick({
                type: "workspace-combined",
                name: item.name,
                workspaceId: item.workspaceId,
                workspaceDomains: item.workspaceDomains,
            });
            return;
        }
        pick({ type: item.type, name: item.name });
    }

    function handleToggleFavourite(e, name) {
        e.stopPropagation();
        setFavourites(toggleFavouriteDomain(name));
    }

    const currentModeMeta = MODES.find((m) => m.id === mode) || MODES[0];
    const domainLabel = currentDomain === "combined view" ? "All domains" : currentDomain;

    return (
        <div ref={containerRef} className="property-selector">
            <button
                type="button"
                className="property-selector__trigger"
                onClick={() => setIsOpen((o) => !o)}
                aria-expanded={isOpen}
                aria-haspopup="true"
            >
                <span className="property-selector__mode-icon" aria-hidden="true">
                    <img src={currentModeMeta.icon} alt="" />
                </span>
                <span className="property-selector__trigger-text">
                    <span className="property-selector__trigger-context">
                        {activeWorkspace ? activeWorkspace.name : orgLabel}
                    </span>
                    <span className="property-selector__trigger-domain">{domainLabel || "…"}</span>
                </span>
                <span className="property-selector__caret" aria-hidden="true" />
            </button>

            {isOpen && (
                <div className="property-selector__panel">
                    <div className="property-selector__mode-row">
                        {MODES.map((m) => (
                            <button
                                key={m.id}
                                type="button"
                                className={
                                    "property-selector__mode-btn" +
                                    (mode === m.id ? " property-selector__mode-btn--active" : "")
                                }
                                onClick={() => {
                                    setIsOpen(false);
                                    onModeChange(m.id);
                                }}
                                title={m.label}
                            >
                                <img src={m.icon} alt="" />
                                <span>{m.label}</span>
                            </button>
                        ))}
                    </div>

                    {organisation?.all?.length > 1 && (
                        <div className="property-selector__org-row">
                            <button
                                type="button"
                                className="property-selector__org-btn"
                                onClick={() => setOrgMenuOpen((o) => !o)}
                            >
                                <span className="property-selector__org-badge" aria-hidden="true">!</span>
                                <span className="property-selector__org-name">{orgLabel}</span>
                                <span className="property-selector__caret" aria-hidden="true" />
                            </button>
                            {orgMenuOpen && (
                                <ul className="property-selector__org-list">
                                    {organisation.all.map((org) => (
                                        <li key={org.id}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setOrgMenuOpen(false);
                                                    setIsOpen(false);
                                                    organisation.onChange(
                                                        JSON.stringify({ id: org.id, name: org.name, access: org.access })
                                                    );
                                                }}
                                            >
                                                {org.icon ? <img src={org.icon} alt="" /> : null}
                                                {org.name}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    <div className="property-selector__search-row">
                        <input
                            type="search"
                            className="property-selector__search"
                            placeholder="Search workspaces & domains"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            autoComplete="off"
                        />
                    </div>

                    <div className="property-selector__tabs">
                        {[
                            { id: "all", label: "All" },
                            ...(mode === "analytics" ? [{ id: "with-analytics", label: "With analytics" }] : []),
                            { id: "favourites", label: "Favourites" },
                            { id: "recent", label: "Recent" },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                className={
                                    "property-selector__tab" +
                                    (activeTab === tab.id ? " property-selector__tab--active" : "")
                                }
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="property-selector__columns">
                        <div className="property-selector__col">
                            <div className="property-selector__col-title">Workspaces</div>
                            <ul className="property-selector__list">
                                {filteredWorkspaces.map((item) => {
                                    const active =
                                        item.type === "all" ? !activeWorkspace : activeWorkspace?.id === item.id;
                                    return (
                                        <li key={item.key}>
                                            <button
                                                type="button"
                                                className={
                                                    "property-selector__row" +
                                                    (active ? " property-selector__row--active" : "")
                                                }
                                                onClick={() => handleWorkspaceClick(item)}
                                            >
                                                {item.type === "workspace" ? (
                                                    <span className="property-selector__ws-icon" aria-hidden="true">W</span>
                                                ) : (
                                                    <span className="property-selector__ws-icon property-selector__ws-icon--all" aria-hidden="true">
                                                        ⊕
                                                    </span>
                                                )}
                                                <span className="property-selector__row-text">
                                                    <span className="property-selector__row-name">
                                                        {item.label || item.name}
                                                    </span>
                                                    {item.sublabel && (
                                                        <span className="property-selector__row-sub">{item.sublabel}</span>
                                                    )}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                                {filteredWorkspaces.length === 0 && (
                                    <li className="property-selector__empty">No matches</li>
                                )}
                            </ul>
                        </div>

                        <div className="property-selector__col">
                            <div className="property-selector__col-title">
                                {activeWorkspace ? "Domains & Apps" : "Domains"}
                            </div>
                            <ul className="property-selector__list">
                                {filteredDomains.map((item) => {
                                    const active = item.name === currentDomain;
                                    const isFav = favourites.includes(item.name);
                                    const isRealDomain = item.type !== "workspace-combined" && item.name !== "combined view";
                                    const dimForNoAnalytics = mode === "analytics" && isRealDomain && !item.hasAnalytics;
                                    return (
                                        <li key={item.key}>
                                            <div
                                                className={
                                                    "property-selector__row property-selector__row--domain" +
                                                    (active ? " property-selector__row--active" : "") +
                                                    (dimForNoAnalytics ? " property-selector__row--no-analytics" : "")
                                                }
                                                onClick={() => handleDomainClick(item)}
                                                title={dimForNoAnalytics ? "Analytics not set up yet on this domain — click to open and enable it" : undefined}
                                            >
                                                {active && (
                                                    <span className="property-selector__check" aria-hidden="true">✓</span>
                                                )}
                                                {item.icon ? <img className="property-selector__favicon" src={item.icon} alt="" /> : null}
                                                <span className="property-selector__row-name property-selector__row-name--mono">
                                                    {item.label || item.name}
                                                </span>
                                                {mode === "analytics" && isRealDomain && analyticsBadge(item.hasAnalytics)}
                                                {verifyBadge(item.verificationStatus)}
                                                {item.isPrimary && (
                                                    <span className="property-selector__primary-tag">Primary</span>
                                                )}
                                                {item.type !== "workspace-combined" && item.name !== "combined view" && (
                                                    <button
                                                        type="button"
                                                        className={
                                                            "property-selector__star" +
                                                            (isFav ? " property-selector__star--active" : "")
                                                        }
                                                        onClick={(e) => handleToggleFavourite(e, item.name)}
                                                        aria-label={isFav ? "Remove favourite" : "Add favourite"}
                                                        title={isFav ? "Remove favourite" : "Add favourite"}
                                                    >
                                                        {isFav ? "★" : "☆"}
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                                {filteredDomains.length === 0 && (
                                    <li className="property-selector__empty">No matches</li>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
