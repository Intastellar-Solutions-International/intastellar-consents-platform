const { useState, useEffect, useContext, useMemo } = React;
import StickyPageTitle from "../../Components/Header/Sticky";
import AuditSnapshotCard from "../../components/AuditSnapshotCard/AuditSnapshotCard.js";
import ComplianceFlowMap from "./ComplianceFlowMap.js";
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
import appStorage from '../../Functions/storage.js';

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

const BANNER_CATEGORY_META = {
    necessary:  { label: "Necessary",  color: "#50a878" },
    security:   { label: "Security",   color: "#3bb5ac" },
    analytics:  { label: "Analytics",  color: "#5090dc" },
    marketing:  { label: "Marketing",  color: "#dc5050" },
    functional: { label: "Functional", color: "#c0a053" },
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

function groupCookiesByName(rawCookies) {
    const map = new Map();
    for (const c of rawCookies) {
        if (!map.has(c.name)) {
            map.set(c.name, { ...c, domains: [c.domain] });
        } else {
            const g = map.get(c.name);
            if (!g.domains.includes(c.domain)) g.domains.push(c.domain);
            if (!g.session && c.expires && (!g.expires || c.expires > g.expires)) {
                g.expires = c.expires;
            }
        }
    }
    return [...map.values()];
}


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
    const [transferPage, setTransferPage] = useState(0);
    const [cookiePage, setCookiePage] = useState(0);

    const PAGE_SIZE = 10;
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedTransfer, setExpandedTransfer] = useState(null);
    const [scanHistory, setScanHistory] = useState([]);
    const [copyTableCopied, setCopyTableCopied] = useState(false);
    const [showEmbedModal, setShowEmbedModal] = useState(false);
    const [embedSnippetCopied, setEmbedSnippetCopied] = useState(false);
    const [cookieOverrides, setCookieOverrides] = useState({});
    const [editingCookie, setEditingCookie] = useState(null);
    const [editDraft, setEditDraft] = useState({ vendor: "", description: "", bannerCategory: "" });

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
                    appStorage.removeItem("globals");
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
                    appStorage.removeItem("globals");
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
                    appStorage.removeItem("globals");
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
                        appStorage.removeItem("globals");
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

    useEffect(() => {
        const domain = handle || currentDomain;
        if (!domain || domain === "combined view") return;
        try {
            const stored = JSON.parse(localStorage.getItem(`scanHistory_${domain}`) || "[]");
            setScanHistory(Array.isArray(stored) ? stored : []);
        } catch { setScanHistory([]); }
    }, [handle, currentDomain]);

    useEffect(() => {
        const d = handle || currentDomain || "";
        if (!d || d === "combined view") { setCookieOverrides({}); return; }
        try {
            const stored = JSON.parse(localStorage.getItem(`cookieOverrides_${d}`) || "{}");
            setCookieOverrides(stored && typeof stored === "object" ? stored : {});
        } catch { setCookieOverrides({}); }
    }, [handle, currentDomain]);

    useEffect(() => {
        if (!preConsentTransfers?.scanned_at) return;
        const domain = handle || currentDomain;
        if (!domain || domain === "combined view") return;
        const entry = {
            scanned_at: preConsentTransfers.scanned_at,
            transfers: preConsentTransfers.pre_consent_transfers?.length ?? 0,
            cookies: preConsentTransfers.pre_consent_cookies?.length ?? 0,
        };
        setScanHistory(prev => {
            if (prev[0]?.scanned_at === entry.scanned_at) return prev;
            const next = [entry, ...prev].slice(0, 5);
            try { localStorage.setItem(`scanHistory_${domain}`, JSON.stringify(next)); } catch {}
            return next;
        });
    }, [preConsentTransfers, handle, currentDomain]);

    function downloadCSV(rows, filename) {
        const csv = rows.map(r => r.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function saveCookieOverride(cookieName, draft) {
        const d = handle || currentDomain || "";
        setCookieOverrides(prev => {
            const next = { ...prev, [cookieName]: { ...prev[cookieName], ...draft } };
            try { localStorage.setItem(`cookieOverrides_${d}`, JSON.stringify(next)); } catch {}
            return next;
        });
    }

    const exportCSV = () => {
        const scanDomain = (handle || currentDomain || "domain").replace(/[^a-z0-9.-]/gi, "_");
        if (activeTab === "transfers") {
            const items = preConsentTransfers?.pre_consent_transfers || [];
            const rows = [
                ["Service", "Host", "Category", "Resource Type", "Region", "Data Country"],
                ...items.map(t => [t.service || t.host, t.host, t.category || "", t.resourceType || "", t.dataRegion || "", t.dataCountry || ""]),
            ];
            downloadCSV(rows, `pre-consent-transfers-${scanDomain}.csv`);
        } else {
            const items = preConsentTransfers?.pre_consent_cookies || [];
            const baseDomain = (handle || currentDomain || "").replace(/^www\./, "");
            const rows = [
                ["Name", "Domain", "Party", "Lifetime", "HttpOnly", "Secure", "SameSite"],
                ...items.map(c => {
                    const isThird = !c.domain.replace(/^\./, "").endsWith(baseDomain);
                    const lifetime = c.session ? "Session" : c.expires ? new Date(c.expires * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Persistent";
                    return [c.name, c.domain, isThird ? "3rd party" : "1st party", lifetime, c.httpOnly ? "Yes" : "No", c.secure ? "Yes" : "No", c.sameSite || ""];
                }),
            ];
            downloadCSV(rows, `pre-consent-cookies-${scanDomain}.csv`);
        }
    };

    const embedDomain = handle || currentDomain || "";
    const embedSnippet = `<div data-intastellar-cookies data-domain="${embedDomain}"></div>\n<script src="https://www.intastellarconsents.com/cookie-table.js" defer><\/script>`;

    const copyEmbedSnippet = () => {
        navigator.clipboard.writeText(embedSnippet).then(() => {
            setEmbedSnippetCopied(true);
            setTimeout(() => setEmbedSnippetCopied(false), 2000);
        });
    };

    const copyCookieTable = () => {
        const baseDomain = (handle || currentDomain || "").replace(/^www\./, "");
        const items = groupCookiesByName(preConsentTransfers?.pre_consent_cookies || []);
        const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const rows = items.map(c => {
            const eff = { ...c, ...(cookieOverrides[c.name] || {}) };
            const hasThird = eff.domains.some(d => !d.replace(/^\./, "").endsWith(baseDomain));
            const hasFirst = eff.domains.some(d =>  d.replace(/^\./, "").endsWith(baseDomain));
            const party = hasThird && hasFirst ? "Mixed" : hasThird ? "3rd party" : "1st party";
            const bm = eff.bannerCategory ? (BANNER_CATEGORY_META[eff.bannerCategory]?.label || eff.bannerCategory) : "";
            const lifetime = eff.session ? "Session" : eff.expires ? new Date(eff.expires * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Persistent";
            return `<tr><td>${esc(eff.name)}</td><td>${esc(eff.domains.join(", "))}</td><td>${party}</td><td>${esc(lifetime)}</td><td>${esc(bm)}</td><td>${esc(eff.vendor || "")}</td><td>${esc(eff.description || "")}</td></tr>`;
        }).join("");
        const html = `<table><thead><tr><th>Cookie name</th><th>Domain</th><th>Party</th><th>Lifetime</th><th>Category</th><th>Vendor</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>`;
        navigator.clipboard.writeText(html).then(() => {
            setCopyTableCopied(true);
            setTimeout(() => setCopyTableCopied(false), 2000);
        });
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
                <ComplianceFlowMap
                    dataFlowCountries={dataFlowCountries}
                    dataFlowOrigin="DE"
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

                {/* ── Data transfers ── */}
                {(handle || currentDomain) === "combined view" && (
                    <div className="dashboard-section compliance-transfers">
                        <div className="compliance-transfers__card compliance-transfers__combined-placeholder">
                            <span className="compliance-transfers__combined-placeholder-icon" aria-hidden>⊙</span>
                            <p>Select a specific domain from the domain picker to view data transfers and cookie scans for that domain.</p>
                        </div>
                    </div>
                )}
                {(handle || currentDomain) && (handle || currentDomain) !== "combined view" && (
                    <div className="dashboard-section compliance-transfers">
                        <div className="compliance-transfers__card">
                            <div className="compliance-transfers__header">
                                <div className="compliance-transfers__header-text">
                                    <h2 className="compliance-transfers__title">Data transfers</h2>
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
                                <div className="compliance-transfers__header-actions">
                                    {preConsentTransfers && !scanLoading && (
                                        <button type="button" className="compliance-transfers__export-btn" onClick={exportCSV}>
                                            Export CSV
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className={"compliance-transfers__scan-btn" + (scanLoading ? " --loading" : "")}
                                        onClick={triggerScan}
                                        disabled={scanLoading}
                                    >
                                        {scanLoading ? "Scanning…" : "Scan now"}
                                    </button>
                                </div>
                            </div>
                            {scanHistory.length > 1 && (
                                <div className="compliance-transfers__history">
                                    <span className="compliance-transfers__history-label">Previous scans</span>
                                    {scanHistory.slice(1).map((s, i) => (
                                        <span key={s.scanned_at + i} className="compliance-transfers__history-chip">
                                            {new Date(s.scanned_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                            <span className="compliance-transfers__history-chip-detail">{s.transfers} transfers · {s.cookies} cookies</span>
                                        </span>
                                    ))}
                                </div>
                            )}

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
                                            onClick={() => { setActiveTab(key); setTransferPage(0); setCookiePage(0); setSearchQuery(""); setExpandedTransfer(null); }}
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
                                    <span>No scan data yet — run a scan to detect data transfers for this domain.</span>
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
                                const sq = searchQuery.toLowerCase();
                                const displayed = (activeFilter
                                    ? transfers.filter(t => t.category === activeFilter)
                                    : transfers
                                ).filter(t => !sq ||
                                    (t.service || "").toLowerCase().includes(sq) ||
                                    (t.host || "").toLowerCase().includes(sq)
                                );

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
                                                        onClick={() => { setActiveFilter(isActive ? null : cat); setTransferPage(0); setSearchQuery(""); setExpandedTransfer(null); }}
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
                                                <button type="button" className="transfers-summary__clear" onClick={() => { setActiveFilter(null); setTransferPage(0); setSearchQuery(""); setExpandedTransfer(null); }}>
                                                    Show all
                                                </button>
                                            )}
                                        </div>

                                        {/* ── Search ── */}
                                        <div className="compliance-search">
                                            <input
                                                type="search"
                                                className="compliance-search__input"
                                                placeholder="Search by service or host…"
                                                value={searchQuery}
                                                onChange={e => { setSearchQuery(e.target.value); setTransferPage(0); }}
                                            />
                                            {searchQuery && (
                                                <span className="compliance-search__count">
                                                    {displayed.length} result{displayed.length !== 1 ? "s" : ""}
                                                </span>
                                            )}
                                        </div>

                                        {/* ── Transfer rows ── */}
                                        {searchQuery && !displayed.length ? (
                                            <div className="compliance-transfers__empty">
                                                <span>No transfers match "{searchQuery}".</span>
                                            </div>
                                        ) : (() => {
                                            const totalTransferPages = Math.ceil(displayed.length / PAGE_SIZE);
                                            const pageSlice = displayed.slice(transferPage * PAGE_SIZE, (transferPage + 1) * PAGE_SIZE);
                                            return (
                                                <>
                                                    <div className="compliance-transfers__list-header" aria-hidden>
                                                        <span />
                                                        <span>Service</span>
                                                        <span>Type</span>
                                                        <span>Region</span>
                                                        <span>Category</span>
                                                        <span />
                                                    </div>
                                                    <div className="compliance-transfers__list">
                                                        {pageSlice.map((t) => {
                                                            const meta     = CATEGORY_META[t.category] || { label: t.category, risk: "medium", icon: "◇", color: "#909090" };
                                                            const resLabel = RESOURCE_LABELS[t.resourceType] || (t.resourceType || "Other");
                                                            const region   = t.dataRegion || "non-eu";
                                                            const isExp    = expandedTransfer === t.host;
                                                            const toggle   = () => setExpandedTransfer(prev => prev === t.host ? null : t.host);
                                                            return (
                                                                <div key={t.host} className="compliance-transfers__row-wrap">
                                                                    <div
                                                                        className={"compliance-transfers__row compliance-transfers__row--" + (t.category || "other") + (isExp ? " --expanded" : "")}
                                                                        onClick={toggle}
                                                                        role="button"
                                                                        tabIndex={0}
                                                                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }}}
                                                                        aria-expanded={isExp}
                                                                    >
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
                                                                        <span className="compliance-transfers__row-toggle" aria-hidden>{isExp ? "▾" : "▸"}</span>
                                                                    </div>
                                                                    {isExp && (
                                                                        <div className="compliance-transfers__row-detail">
                                                                            {t.description && (
                                                                                <span className="compliance-transfers__row-detail-item compliance-transfers__row-detail-item--full">
                                                                                    <span className="compliance-transfers__row-detail-label">About</span>
                                                                                    {t.description}
                                                                                </span>
                                                                            )}
                                                                            {t.bannerCategory && (() => {
                                                                                const bm = BANNER_CATEGORY_META[t.bannerCategory];
                                                                                return (
                                                                                    <span className="compliance-transfers__row-detail-item">
                                                                                        <span className="compliance-transfers__row-detail-label">Consent category</span>
                                                                                        <span className="compliance-banner-cat" style={{ "--bc-color": bm?.color || "#909090" }}>
                                                                                            {bm?.label || t.bannerCategory}
                                                                                        </span>
                                                                                    </span>
                                                                                );
                                                                            })()}
                                                                            {t.legalBasis && (
                                                                                <span className="compliance-transfers__row-detail-item">
                                                                                    <span className="compliance-transfers__row-detail-label">Legal basis</span>
                                                                                    {t.legalBasis}
                                                                                </span>
                                                                            )}
                                                                            {t.transferMechanism && (
                                                                                <span className="compliance-transfers__row-detail-item">
                                                                                    <span className="compliance-transfers__row-detail-label">Transfer mechanism</span>
                                                                                    {t.transferMechanism}
                                                                                </span>
                                                                            )}
                                                                            {t.dataCountry && (
                                                                                <span className="compliance-transfers__row-detail-item">
                                                                                    <span className="compliance-transfers__row-detail-label">Data country</span>
                                                                                    {t.dataCountry}
                                                                                </span>
                                                                            )}
                                                                            {t.url && (
                                                                                <span className="compliance-transfers__row-detail-item compliance-transfers__row-detail-item--full">
                                                                                    <span className="compliance-transfers__row-detail-label">URL</span>
                                                                                    <code className="compliance-transfers__row-detail-code">{t.url}</code>
                                                                                </span>
                                                                            )}
                                                                            {t.initiator && (
                                                                                <span className="compliance-transfers__row-detail-item compliance-transfers__row-detail-item--full">
                                                                                    <span className="compliance-transfers__row-detail-label">Initiator</span>
                                                                                    <code className="compliance-transfers__row-detail-code">{t.initiator}</code>
                                                                                </span>
                                                                            )}
                                                                            {t.purposes?.length > 0 && (
                                                                                <span className="compliance-transfers__row-detail-item">
                                                                                    <span className="compliance-transfers__row-detail-label">Purposes</span>
                                                                                    {t.purposes.join(", ")}
                                                                                </span>
                                                                            )}
                                                                            {t.privacyUrl && (
                                                                                <span className="compliance-transfers__row-detail-item compliance-transfers__row-detail-item--full">
                                                                                    <a className="compliance-transfers__row-detail-privacy" href={t.privacyUrl} target="_blank" rel="noopener noreferrer">
                                                                                        Privacy policy ↗
                                                                                    </a>
                                                                                </span>
                                                                            )}
                                                                            {!t.description && !t.dataCountry && !t.url && !t.initiator && !t.purposes?.length && (
                                                                                <span className="compliance-transfers__row-detail-item" style={{ color: "rgba(255,255,255,0.25)" }}>
                                                                                    No additional detail available for this transfer.
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    {totalTransferPages > 1 && (
                                                        <div className="compliance-pagination">
                                                            <button
                                                                type="button"
                                                                className="compliance-pagination__btn"
                                                                onClick={() => setTransferPage(p => p - 1)}
                                                                disabled={transferPage === 0}
                                                            >‹ Prev</button>
                                                            <span className="compliance-pagination__info">
                                                                {transferPage + 1} / {totalTransferPages}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className="compliance-pagination__btn"
                                                                onClick={() => setTransferPage(p => p + 1)}
                                                                disabled={transferPage >= totalTransferPages - 1}
                                                            >Next ›</button>
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </>
                                );
                            })()}

                            {activeTab === "transfers" && preConsentTransfers?.pre_consent_transfers?.length === 0 && !scanLoading && (
                                <div className="compliance-transfers__empty compliance-transfers__empty--clean">
                                    <span className="compliance-transfers__empty-icon" aria-hidden>✓</span>
                                    <span>No data transfers detected in the last scan.</span>
                                </div>
                            )}

                            {/* ── Cookies tab ── */}
                            {activeTab === "cookies" && !scanLoading && (() => {
                                const domain  = (handle || currentDomain || "").replace(/^www\./, "");
                                const csq = searchQuery.toLowerCase();
                                const allCookies = preConsentTransfers?.pre_consent_cookies || [];
                                if (!allCookies.length) return (
                                    <div className="compliance-transfers__empty compliance-transfers__empty--clean">
                                        <span className="compliance-transfers__empty-icon" aria-hidden>✓</span>
                                        <span>No cookies set before consent in the last scan.</span>
                                    </div>
                                );
                                const cookies = groupCookiesByName(
                                    allCookies.filter(c => !csq ||
                                        (c.name || "").toLowerCase().includes(csq) ||
                                        (c.domain || "").toLowerCase().includes(csq)
                                    )
                                );
                                const totalCookiePages = Math.ceil(cookies.length / PAGE_SIZE);
                                const cookieSlice = cookies.slice(cookiePage * PAGE_SIZE, (cookiePage + 1) * PAGE_SIZE);
                                return (
                                    <>
                                        <div className="compliance-search">
                                            <input
                                                type="search"
                                                className="compliance-search__input"
                                                placeholder="Search by name or domain…"
                                                value={searchQuery}
                                                onChange={e => { setSearchQuery(e.target.value); setCookiePage(0); }}
                                            />
                                            {searchQuery && (
                                                <span className="compliance-search__count">
                                                    {cookies.length} result{cookies.length !== 1 ? "s" : ""}
                                                </span>
                                            )}
                                        </div>
                                        {!cookies.length ? (
                                            <div className="compliance-transfers__empty">
                                                <span>No cookies match "{searchQuery}".</span>
                                            </div>
                                        ) : (
                                        <>
                                        <div className="compliance-cookies__table-actions">
                                            <button
                                                type="button"
                                                className="compliance-transfers__export-btn"
                                                onClick={() => setShowEmbedModal(true)}
                                            >
                                                Embed on website
                                            </button>
                                            <button
                                                type="button"
                                                className="compliance-transfers__export-btn"
                                                onClick={copyCookieTable}
                                            >
                                                {copyTableCopied ? "Copied!" : "Copy cookie table"}
                                            </button>
                                        </div>
                                        <div className="compliance-cookies__list-header" aria-hidden>
                                            <span>Name / Domain</span>
                                            <span>Party</span>
                                            <span>Lifetime</span>
                                            <span>Category</span>
                                            <span>Flags</span>
                                        </div>
                                        <div className="compliance-cookies__list">
                                            {cookieSlice.map((c, i) => {
                                                const hasThird = c.domains.some(d => !d.replace(/^\./, "").endsWith(domain));
                                                const hasFirst = c.domains.some(d =>  d.replace(/^\./, "").endsWith(domain));
                                                const partyLabel = hasThird && hasFirst ? "Mixed" : hasThird ? "3rd party" : "1st party";
                                                const partyMod   = hasThird ? " --third" : " --first";
                                                const eff = { ...c, ...(cookieOverrides[c.name] || {}) };
                                                const isUnknown = !eff.bannerCategory;
                                                const lifetime = eff.session
                                                    ? "Session"
                                                    : eff.expires
                                                        ? new Date(eff.expires * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                                                        : "Persistent";
                                                return (
                                                    <div key={c.name + i} className="compliance-cookies__row-wrap">
                                                        <div className={"compliance-cookies__row" + (isUnknown ? " --unknown" : "")}>
                                                            <div className="compliance-cookies__row-main">
                                                                <span className="compliance-cookies__row-name">{eff.name}</span>
                                                                {eff.vendor && <span className="compliance-cookies__row-vendor">{eff.vendor}</span>}
                                                                <span className="compliance-cookies__row-domain">{eff.domains.join(", ")}</span>
                                                                {eff.description && (
                                                                    <span className="compliance-cookies__row-desc">{eff.description}</span>
                                                                )}
                                                            </div>
                                                            <span className={"compliance-cookies__row-party" + partyMod}>
                                                                {partyLabel}
                                                            </span>
                                                            <span className={"compliance-cookies__row-lifetime" + (eff.session ? " --session" : " --persistent")}>
                                                                {lifetime}
                                                            </span>
                                                            {eff.bannerCategory ? (() => {
                                                                const bm = BANNER_CATEGORY_META[eff.bannerCategory];
                                                                return (
                                                                    <span className="compliance-banner-cat" style={{ "--bc-color": bm?.color || "#909090" }}>
                                                                        {bm?.label || eff.bannerCategory}
                                                                    </span>
                                                                );
                                                            })() : (
                                                                <span className="compliance-cookies__unknown-badge">Unknown</span>
                                                            )}
                                                            <div className="compliance-cookies__flags">
                                                                {eff.httpOnly && <span className="compliance-cookies__flag">HttpOnly</span>}
                                                                {eff.secure   && <span className="compliance-cookies__flag">Secure</span>}
                                                                {eff.sameSite && eff.sameSite !== "None" && (
                                                                    <span className="compliance-cookies__flag">Same{eff.sameSite}</span>
                                                                )}
                                                            </div>
                                                            {(isUnknown || cookieOverrides[c.name]) && (
                                                                <button
                                                                    type="button"
                                                                    className={"compliance-cookies__edit-btn" + (editingCookie === eff.name ? " --active" : "")}
                                                                    onClick={e => {
                                                                        e.stopPropagation();
                                                                        if (editingCookie === eff.name) {
                                                                            setEditingCookie(null);
                                                                        } else {
                                                                            setEditDraft({
                                                                                vendor: cookieOverrides[eff.name]?.vendor ?? eff.vendor ?? "",
                                                                                description: cookieOverrides[eff.name]?.description ?? eff.description ?? "",
                                                                                bannerCategory: cookieOverrides[eff.name]?.bannerCategory ?? eff.bannerCategory ?? "",
                                                                            });
                                                                            setEditingCookie(eff.name);
                                                                        }
                                                                    }}
                                                                    aria-label={isUnknown ? "Classify this cookie" : "Edit classification"}
                                                                    title={isUnknown ? "Classify this cookie" : "Edit classification"}
                                                                >✎</button>
                                                            )}
                                                        </div>
                                                        {editingCookie === eff.name && (
                                                            <div className="compliance-cookies__edit-panel">
                                                                <div className="compliance-cookies__edit-fields">
                                                                    <div className="compliance-cookies__edit-field">
                                                                        <label className="compliance-cookies__edit-label">Category</label>
                                                                        <select
                                                                            className="compliance-cookies__edit-select"
                                                                            value={editDraft.bannerCategory}
                                                                            onChange={e => setEditDraft(d => ({ ...d, bannerCategory: e.target.value }))}
                                                                        >
                                                                            <option value="">— Unknown —</option>
                                                                            {Object.entries(BANNER_CATEGORY_META).map(([k, v]) => (
                                                                                <option key={k} value={k}>{v.label}</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                    <div className="compliance-cookies__edit-field">
                                                                        <label className="compliance-cookies__edit-label">Vendor</label>
                                                                        <input
                                                                            type="text"
                                                                            className="compliance-cookies__edit-input"
                                                                            placeholder="e.g. Google LLC"
                                                                            value={editDraft.vendor}
                                                                            onChange={e => setEditDraft(d => ({ ...d, vendor: e.target.value }))}
                                                                        />
                                                                    </div>
                                                                    <div className="compliance-cookies__edit-field compliance-cookies__edit-field--wide">
                                                                        <label className="compliance-cookies__edit-label">Description</label>
                                                                        <input
                                                                            type="text"
                                                                            className="compliance-cookies__edit-input"
                                                                            placeholder="What does this cookie do?"
                                                                            value={editDraft.description}
                                                                            onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div className="compliance-cookies__edit-actions">
                                                                    <button
                                                                        type="button"
                                                                        className="compliance-cookies__edit-save"
                                                                        onClick={() => {
                                                                            saveCookieOverride(eff.name, editDraft);
                                                                            setEditingCookie(null);
                                                                        }}
                                                                    >Save</button>
                                                                    <button
                                                                        type="button"
                                                                        className="compliance-cookies__edit-cancel"
                                                                        onClick={() => setEditingCookie(null)}
                                                                    >Cancel</button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {totalCookiePages > 1 && (
                                            <div className="compliance-pagination">
                                                <button
                                                    type="button"
                                                    className="compliance-pagination__btn"
                                                    onClick={() => setCookiePage(p => p - 1)}
                                                    disabled={cookiePage === 0}
                                                >‹ Prev</button>
                                                <span className="compliance-pagination__info">
                                                    {cookiePage + 1} / {totalCookiePages}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="compliance-pagination__btn"
                                                    onClick={() => setCookiePage(p => p + 1)}
                                                    disabled={cookiePage >= totalCookiePages - 1}
                                                >Next ›</button>
                                            </div>
                                        )}
                                        </>
                                        )}
                                    </>
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

            {/* ── Embed modal ── */}
            {showEmbedModal && (
                <div className="compliance-embed-modal__overlay" onClick={() => setShowEmbedModal(false)}>
                    <div className="compliance-embed-modal" onClick={e => e.stopPropagation()}>
                        <div className="compliance-embed-modal__header">
                            <h3 className="compliance-embed-modal__title">Embed cookie table</h3>
                            <button
                                type="button"
                                className="compliance-embed-modal__close"
                                onClick={() => setShowEmbedModal(false)}
                                aria-label="Close"
                            >✕</button>
                        </div>
                        <p className="compliance-embed-modal__desc">
                            Paste these two lines into your privacy or cookie policy page. The table will always show the latest scan results for <strong>{embedDomain}</strong>.
                        </p>
                        <pre className="compliance-embed-modal__code">{embedSnippet}</pre>
                        <div className="compliance-embed-modal__actions">
                            <button
                                type="button"
                                className="compliance-embed-modal__copy-btn"
                                onClick={copyEmbedSnippet}
                            >
                                {embedSnippetCopied ? "Copied!" : "Copy snippet"}
                            </button>
                        </div>
                        <p className="compliance-embed-modal__hint">
                            Optional: add <code>data-lang="de"</code> to the div for German labels.
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}
