const { useState, useEffect, useContext, useMemo } = React;
import StickyPageTitle from "../../Components/Header/Sticky";
import AuditSnapshotCard from "../../Components/AuditSnapshotCard/AuditSnapshotCard.js";
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
import { useExcludeBots } from "../../Functions/botFilter.js";
import { preConsentCookieStat, postConsentCookieStat } from "../../Functions/cookieStats.js";
import { Icon } from "../../Components/ui/icons.js";
import { formatDate, formatDateTime, formatNumber } from "../../Functions/format.js";
import TransferVendors from "./TransferVendors.js";
import { loadEvidence, vendorDocuments } from "../../Functions/evidenceClient.js";
import { chapterVLabels } from "../../Functions/transferCompliance.js";
import { COMPLIANCE_CHANGED_EVENT } from "../../Components/Shell/useDomainCompliance.js";
import { scanConsentStep, consentPhaseLabel, filterByConsentPhase, staleScanDays, scanRegionLabel } from "../../Functions/scanHistory.js";
import ScanHistoryPanel from "./ScanHistoryPanel.js";
import DsrSummaryCard from "./DsrSummaryCard.js";
import AllDomainsCompliance from "./AllDomainsCompliance.js";
import { KpiTile, Button, Badge, Tabs, TabPanel, EmptyState, FilterSelect } from "../../Components/ui";

const Link = window.ReactRouterDOM.Link;
const useParams = window.ReactRouterDOM.useParams;
const useLocation = window.ReactRouterDOM.useLocation;

const CATEGORY_META = {
    // icon: name in src/Components/ui/icons.js (was Unicode glyphs ◆ ◈ ◉ ◎ ◌ ○ ✓ ◇)
    fingerprinting: { label: "Fingerprinting", risk: "high",   icon: "fingerprint",  color: "#c0365a" },
    advertising:    { label: "Advertising",    risk: "high",   icon: "megaphone",    color: "#dc5050" },
    analytics:      { label: "Analytics",      risk: "medium", icon: "bar-chart",    color: "#5090dc" },
    social:         { label: "Social",         risk: "medium", icon: "share",        color: "#8264c8" },
    functional:     { label: "Functional",     risk: "low",    icon: "sliders",      color: "#50a878" },
    cdn:            { label: "CDN / Fonts",    risk: "low",    icon: "server",       color: "#787878" },
    cmp:            { label: "CMP",            risk: "none",   icon: "shield-check", color: "#50a878" },
    "third-party":  { label: "Third-party",    risk: "medium", icon: "link",         color: "#909090" },
};

const BANNER_CATEGORY_META = {
    necessary:  { label: "Necessary",  color: "#50a878" },
    security:   { label: "Security",   color: "#3bb5ac" },
    analytics:  { label: "Analytics",  color: "#5090dc" },
    marketing:  { label: "Marketing",  color: "#dc5050" },
    functional: { label: "Functional", color: "#c0a053" },
    unclassified: { label: "Unclassified", color: "#8a8a8a" },
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

const CONSENT_STEP_NOTE = {
    accepted: "The scanner then accepted the Intastellar banner; anything first seen after that counts as after consent.",
    none: "No accept step showed in this scan, so everything it saw counts as before consent.",
    unknown: "This scan is too old to tell what loaded before consent.",
};

const RISK_ORDER = { high: 0, medium: 1, low: 2, none: 3 };
const CAT_ORDER  = { fingerprinting: 0, advertising: 1, analytics: 2, social: 3, functional: 4, cdn: 5, cmp: 6, "third-party": 7 };

function formatCookieDuration(expiresUnixSec, scannedAtIso) {
    const baseSec = scannedAtIso
        ? Math.floor(new Date(scannedAtIso).getTime() / 1000)
        : Math.floor(Date.now() / 1000);
    const secs = expiresUnixSec - baseSec;
    if (secs <= 0) return "Persistent";
    const m = 60, h = 3600, d = 86400, mo = 2592000, y = 31536000;
    if (secs < h)  { const v = Math.round(secs / m);  return v + (v === 1 ? " minute"  : " minutes");  }
    if (secs < d)  { const v = Math.round(secs / h);  return v + (v === 1 ? " hour"    : " hours");     }
    if (secs < mo) { const v = Math.round(secs / d);  return v + (v === 1 ? " day"     : " days");      }
    if (secs < y)  { const v = Math.round(secs / mo); return v + (v === 1 ? " month"   : " months");    }
    const v = Math.round(secs / y); return v + (v === 1 ? " year" : " years");
}

function groupCookiesByName(rawCookies) {
    const map = new Map();
    for (const c of rawCookies) {
        if (!map.has(c.name)) {
            map.set(c.name, { ...c, domains: [c.domain] });
        } else {
            const g = map.get(c.name);
            if (!g.domains.includes(c.domain)) g.domains.push(c.domain);
            if (c.consentPhase === "pre") g.consentPhase = "pre";
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
    // Set when this page was opened from the Cookie scans list.
    const location = useLocation();
    const scanId = new URLSearchParams(location.search).get("scan");

    useSyncDomainFromRoute(handle, setCurrentDomain);

    useEffect(() => {
        document.title = `Compliance overview${handle ? `: ${handle}` : ""} | Reports | Intastellar Consents`;
    }, [handle]);

    const workspaceId = activeWorkspace?.id ?? null;

    const initialLastDays = localStorage.getItem("settings") != null
        ? JSON.parse(localStorage.getItem("settings")).dateRange
        : 30;
    const [getLastDays, setLastDays] = useState(initialLastDays);
    const today = new Date();
    const [fromDate, setFromDate] = useState(
        new Date(new Date().setDate(today.getDate() - (initialLastDays - 1)))
    );
    const [toDate, setToDate] = useState(
        new Date()
    );
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
    const [, setActiveDataDummy] = useState(null);

    const [activeData, setActiveData] = useState(null);
    const [activeDataCountry, setActiveDataCountry] = useState(null);
    const [observedCookies, setObservedCookies] = useState(null);
    const [excludeBots] = useExcludeBots();
    const [preConsentTransfers, setPreConsentTransfers] = useState(null);
    const [vendorRecords, setVendorRecords] = useState({});
    const [evidenceDocs, setEvidenceDocs] = useState([]);
    const [scanLoading, setScanLoading] = useState(false);
    const [activeTab, setActiveTab] = useState("transfers");
    const [loading, setLoading] = useState(false);
    const [cookiePage, setCookiePage] = useState(0);

    const PAGE_SIZE = 10;
    const [searchQuery, setSearchQuery] = useState("");
    const [cookiePhase, setCookiePhase] = useState("all");
    const [mapOpen, setMapOpen] = useState(false);
    const [scanHistory, setScanHistory] = useState([]);
    const [copyTableCopied, setCopyTableCopied] = useState(false);
    const [showEmbedModal, setShowEmbedModal] = useState(false);
    const [embedSnippetCopied, setEmbedSnippetCopied] = useState(false);
    const [cookieOverrides, setCookieOverrides] = useState({});
    const [editingCookie, setEditingCookie] = useState(null);
    const [editDraft, setEditDraft] = useState({ vendor: "", description: "", bannerCategory: "" });
    const [allDomainsSummary, setAllDomainsSummary] = useState(null);

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

    const loadScan = (scan) => {
        const domain = handle || currentDomain;
        if (!domain || domain === "combined view") return;
        fetch(`${API[id].getPreConsentTransfers.url}?domain=${encodeURIComponent(domain)}${scan ? `&scan=${encodeURIComponent(scan)}` : ""}`, {
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
    };

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

        loadScan(scanId);
    }, [id, domainsForApi, fromDate, toDate, compareRange, previousPeriod, previousPeriod2, workspaceId, excludeBots, scanId]);

    useEffect(() => {
        const api = API[id]?.vendorCompliance;
        if (!api) return;
        fetch(api.url, { headers: { ...api.headers } })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => { if (data?.records) setVendorRecords(data.records); })
            .catch(() => {});
        loadEvidence().then((data) => setEvidenceDocs(data.documents || [])).catch(() => {});
    }, [id]);

    const saveVendorRecord = async (vendor, values) => {
        const api = API[id].vendorCompliance;
        const response = await fetch(api.url, { method: "POST", headers: { ...api.headers }, body: JSON.stringify({ vendor, ...values }) });
        if (!response.ok) throw new Error("save failed");
        const { record } = await response.json();
        applyVendorRecord(vendor, record);
    };

    const applyVendorRecord = (vendor, record) => {
        setVendorRecords((all) => {
            const next = { ...all };
            if (record) next[vendor] = record; else delete next[vendor];
            return next;
        });
        window.dispatchEvent(new Event(COMPLIANCE_CHANGED_EVENT));
    };

    const vendorEvidence = { documents: evidenceDocs, onChange: (catalog) => setEvidenceDocs(catalog.documents || []) };

    // The header status links here (#open-issues); the block only exists on this tab.
    useEffect(() => {
        if (location.hash !== "#open-issues" || !preConsentTransfers) return undefined;
        setActiveTab("transfers");
        const timer = setTimeout(() => document.getElementById("open-issues")?.scrollIntoView({ behavior: "smooth" }), 100);
        return () => clearTimeout(timer);
    }, [location.hash, preConsentTransfers]);

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
            .then((data) => {
                setPreConsentTransfers(data);
                // The stored scan carries what this response lacks, such as EU-hosted hosts.
                if (!data.error) {
                    loadScan(null);
                    // The first-visit scan runs alongside and can finish a little later.
                    setTimeout(() => { loadScan(null); window.dispatchEvent(new Event(COMPLIANCE_CHANGED_EVENT)); }, 30000);
                }
                window.dispatchEvent(new Event(COMPLIANCE_CHANGED_EVENT));
            })
            .catch(console.error)
            .finally(() => setScanLoading(false));
    };

    const latestScanAt = preConsentTransfers?.scanned_at;
    useEffect(() => {
        const domain = handle || currentDomain;
        const api = API[id]?.listPreConsentScans;
        if (!api || !domain || domain === "combined view") { setScanHistory([]); return undefined; }
        const ac = new AbortController();
        fetch(api.url, { method: api.method, headers: api.headers, signal: ac.signal, body: JSON.stringify({ domains: [domain], pageSize: 10, includeFirstVisit: true }) })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => setScanHistory(Array.isArray(data?.scans) ? data.scans : []))
            .catch((e) => { if (e.name !== "AbortError") setScanHistory([]); });
        return () => ac.abort();
    }, [id, handle, currentDomain, latestScanAt, preConsentTransfers?.first_visit?.id]);

    useEffect(() => {
        const d = handle || currentDomain || "";
        if (!d || d === "combined view") { setCookieOverrides({}); return; }

        // Apply localStorage immediately for instant render
        let local = {};
        try {
            local = JSON.parse(localStorage.getItem(`cookieOverrides_${d}`) || "{}") || {};
        } catch {}
        setCookieOverrides(local);

        // Fetch from server and merge (server wins — syncs across sessions/browsers)
        if (!id || !API[id]?.cookieOverrides) return;
        const cfg = API[id].cookieOverrides.get;
        fetch(`${cfg.url}?domain=${encodeURIComponent(d)}`, { method: cfg.method, headers: cfg.headers })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data?.overrides) return;
                setCookieOverrides(prev => {
                    const merged = { ...prev, ...data.overrides };
                    try { localStorage.setItem(`cookieOverrides_${d}`, JSON.stringify(merged)); } catch {}
                    return merged;
                });
            })
            .catch(() => {});
    }, [handle, currentDomain, id]);

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

            // Persist to server (fire-and-forget)
            if (id && API[id]?.cookieOverrides) {
                const cfg = API[id].cookieOverrides.save;
                fetch(cfg.url, {
                    method: cfg.method,
                    headers: cfg.headers,
                    body: JSON.stringify({ domain: d, overrides: { [cookieName]: draft } }),
                }).catch(() => {});
            }

            return next;
        });
    }

    const documentList = (vendor) => {
        const { dpa, other } = vendorDocuments(evidenceDocs, vendor);
        return [dpa, ...other].filter(Boolean).map((d) => d.title).join("; ");
    };

    const exportCSV = () => {
        const scanDomain = (handle || currentDomain || "domain").replace(/[^a-z0-9.-]/gi, "_");
        if (activeTab === "transfers") {
            const items = preConsentTransfers?.pre_consent_transfers || [];
            const rows = [
                ["Service", "Host", "Category", "Resource Type", "Region", "Data Country", "Transfer Mechanism", "DPA", "Hosted in EU", "Mechanism Confirmed On", "Owner", "Notes", "Evidence Link", "Documents", "Loaded"],
                ...items.map(t => {
                    const record = vendorRecords[t.service || t.host];
                    const chapterV = chapterVLabels({ region: t.dataRegion === "eu" ? "eu" : "non-eu", transferMechanism: t.transferMechanism }, record);
                    return [t.service || t.host, t.host, t.category || "", t.resourceType || "", t.dataRegion || "", t.dataCountry || "", chapterV.transfer, chapterV.dpa, t.dataRegion === "eu" || t.hostedInEU ? "Yes" : "No", record?.mechanism_confirmed_at || "", record?.owner || "", record?.notes || "", record?.evidence_url || "", documentList(t.service || t.host), consentPhaseLabel(t.consentPhase)];
                }),
            ];
            downloadCSV(rows, `pre-consent-transfers-${scanDomain}.csv`);
        } else {
            const items = preConsentTransfers?.pre_consent_cookies || [];
            const baseDomain = (handle || currentDomain || "").replace(/^www\./, "");
            const rows = [
                ["Name", "Domain", "Party", "Lifetime", "HttpOnly", "Secure", "SameSite", "Loaded"],
                ...items.map(c => {
                    const isThird = !c.domain.replace(/^\./, "").endsWith(baseDomain);
                    const lifetime = c.session ? "Session" : c.expires ? formatCookieDuration(c.expires, preConsentTransfers.scanned_at) : "Persistent";
                    return [c.name, c.domain, isThird ? "3rd party" : "1st party", lifetime, c.httpOnly ? "Yes" : "No", c.secure ? "Yes" : "No", c.sameSite || "", consentPhaseLabel(c.consentPhase)];
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
            const lifetime = eff.session ? "Session" : eff.expires ? formatCookieDuration(eff.expires, preConsentTransfers.scanned_at) : "Persistent";
            const vendorCell = eff.vendor
                ? (eff.privacyUrl ? `<a href="${esc(eff.privacyUrl)}" target="_blank" rel="noopener noreferrer">${esc(eff.vendor)}</a>` : esc(eff.vendor))
                : "";
            return `<tr><td>${esc(eff.name)}</td><td>${esc(eff.domains.join(", "))}</td><td>${party}</td><td>${esc(lifetime)}</td><td>${esc(bm)}</td><td>${vendorCell}</td><td>${esc(eff.description || "")}</td></tr>`;
        }).join("");
        const html = `<table><thead><tr><th>Cookie name</th><th>Domain</th><th>Party</th><th>Lifetime</th><th>Category</th><th>Vendor</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>`;
        navigator.clipboard.writeText(html).then(() => {
            setCopyTableCopied(true);
            setTimeout(() => setCopyTableCopied(false), 2000);
        });
    };

    if (!id || !API[id]) return null;

    // Same sources as Home and the audit snapshot card — see cookieStats.js.
    const vendorCount = new Set((preConsentTransfers?.pre_consent_transfers || []).map((t) => t.service || t.host)).size;
    const allDomains = (handle || currentDomain) === "combined view";
    const preStat = preConsentCookieStat(preConsentTransfers);
    const postStat = postConsentCookieStat(observedCookies);
    const auditLogPath = reportsPath(id, currentDomain, "/user-consents");
    const rangeDays = Math.round((toDate - fromDate) / 86400000) + 1;
    const staleDays = latestScanAt && !scanId ? staleScanDays(latestScanAt, rangeDays) : null;

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
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

            {/* ── Content ── */}
            <div className="dashboard-content compliance-page">
            {/* Headline figures (were overlaid on the hero map). Same sources as before. */}
            <section aria-label="Key figures" className="compliance-kpis">
                {allDomains ? (
                    <KpiTile
                        label="Pre-consent cookies"
                        loading={allDomainsSummary == null}
                        value={allDomainsSummary?.preConsentCookies != null ? formatNumber(allDomainsSummary.preConsentCookies) : "—"}
                        hint={allDomainsSummary ? `Across ${formatNumber(allDomainsSummary.domainsWithCookieCount)} scanned domains` : undefined}
                    />
                ) : <KpiTile
                    label="Pre-consent cookies"
                    value={preStat.count != null ? formatNumber(preStat.count) : preStat.label}
                    noData={preStat.count == null ? preStat.reason : undefined}
                    hint={preStat.count != null ? (
                        <>
                            {preStat.afterConsent != null && <span className="tw-block">of {formatNumber(preStat.total)} found · {formatNumber(preStat.afterConsent)} set after accepting</span>}
                            Cookie scan · {formatDate(preStat.scannedAt)}
                        </>
                    ) : preStat.reason}
                />}
                <KpiTile
                    label="Post-consent cookies"
                    value={postStat.count != null ? formatNumber(postStat.count) : postStat.label}
                    noData={postStat.count == null ? postStat.reason : undefined}
                    hint={postStat.count != null ? "Banner reports · real visits" : postStat.reason}
                />
                <KpiTile
                    label="Consent interactions"
                    loading={loading && activeData == null}
                    value={activeData?.Total != null ? formatNumber(activeData.Total) : "—"}
                    hint={<Link to={auditLogPath} className="tw-text-accent-strong tw-font-semibold focus-visible:tw-outline-none focus-visible:tw-shadow-focus tw-rounded-sm">Open audit log</Link>}
                />
            </section>
            <div className="compliance-bottom-grid">

                {/* ── Data transfers ── */}
                {allDomains && <AllDomainsCompliance platformId={id} workspace={activeWorkspace} onSummary={setAllDomainsSummary} />}
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
                                    <p className="compliance-transfers__note">
                                        Loading analytics or advertising before consent is a consent issue under ePrivacy Art. 5(3) and the GDPR,
                                        wherever the vendor is based. Chapter V is a separate question about where the data goes, and it applies even with consent.
                                    </p>
                                    {preConsentTransfers?.scanned_at && (
                                        <p className="compliance-transfers__note">
                                            <strong>Scan mode:</strong> simulated script blocking: <strong>No</strong>.
                                            {" "}A real browser loads the live site, the homepage and up to 4 subpages, so only what the site itself blocks is blocked.
                                            {preConsentTransfers.first_visit ? (
                                                <>
                                                    {" "}Before-consent results come from a first-visit scan that never accepts the banner
                                                    ({scanRegionLabel(preConsentTransfers.first_visit.scan_region)}, {formatDateTime(preConsentTransfers.first_visit.scanned_at)}).
                                                    {" "}The cookie list comes from a scan that accepts it.
                                                </>
                                            ) : (
                                                <>
                                                    {" "}{CONSENT_STEP_NOTE[scanConsentStep(preConsentTransfers.pre_consent_transfers, preConsentTransfers.pre_consent_cookies)]}
                                                    {" "}This scan ran from the US, and a site that decides by visitor location can behave differently for EU visitors.
                                                </>
                                            )}
                                        </p>
                                    )}
                                    {preConsentTransfers?.scanned_at && (
                                        <span className="compliance-transfers__scan-time">
                                            {scanId ? "Scan from" : "Last scanned"} {formatDate(new Date(preConsentTransfers.scanned_at))}
                                            {" · "}<Link to={`/${id}/reports/scans`} style={{ color: "var(--color-accent-strong)" }}>All scans</Link>
                                        </span>
                                    )}
                                </div>
                                <div className="compliance-transfers__header-actions">
                                    {preConsentTransfers && !preConsentTransfers.error && !scanLoading && (
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
                            {staleDays != null && (
                                <div role="status" className="compliance-transfers__stale">
                                    <Icon name="clock" size={16} />
                                    <span>Scan is {staleDays} days old, and this report covers {rangeDays} days.</span>
                                    <Button size="sm" variant="secondary" onClick={triggerScan} loading={scanLoading}>Scan now</Button>
                                </div>
                            )}
                            <ScanHistoryPanel scans={scanHistory} currentId={preConsentTransfers?.id} firstVisitId={preConsentTransfers?.first_visit?.id} basePath={location.pathname} />

                            {/* ── Tabs (shown once a scan exists) ── */}
                            {preConsentTransfers && !scanLoading && !preConsentTransfers.error && (
                                <Tabs
                                    label="Scan results"
                                    idPrefix="compliance"
                                    value={activeTab}
                                    onChange={(key) => { setActiveTab(key); setCookiePage(0); setSearchQuery(""); setCookiePhase("all"); }}
                                    tabs={[
                                        { id: "transfers", label: "Transfers", count: vendorCount },
                                        { id: "cookies", label: "Cookies", count: preConsentTransfers.pre_consent_cookies?.length || 0 },
                                    ]}
                                    className="tw-mb-4"
                                />
                            )}

                            {preConsentTransfers?.error && !scanLoading && (
                                <EmptyState
                                    icon="search"
                                    title={preStat.label}
                                    message={preStat.reason}
                                    action={{ label: "Scan now", onClick: triggerScan }}
                                />
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

                            {activeTab === "transfers" && preConsentTransfers?.pre_consent_transfers?.length > 0 && (
                                <TabPanel idPrefix="compliance" id="transfers" active>
                                    <TransferVendors
                                        transfers={preConsentTransfers.pre_consent_transfers}
                                        categoryMeta={CATEGORY_META}
                                        bannerMeta={BANNER_CATEGORY_META}
                                        resourceLabels={RESOURCE_LABELS}
                                        categoryOrder={CAT_ORDER}
                                        phaseKnown={preConsentTransfers.consent_phase_known === true}
                                        records={vendorRecords}
                                        onSaveRecord={saveVendorRecord}
                                        evidence={vendorEvidence}
                                    />
                                    {/* Map: secondary to the table — smaller, collapsed by default. */}
                                    {dataFlowCountries.length > 0 && (
                                        <section className="compliance-map" aria-labelledby="compliance-map-title">
                                            <div className="compliance-map__head">
                                                <h3 id="compliance-map-title" className="compliance-map__title">Data flow map</h3>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    iconRight={mapOpen ? "chevron-up" : "chevron-down"}
                                                    aria-expanded={mapOpen}
                                                    aria-controls="compliance-map-body"
                                                    onClick={() => setMapOpen((o) => !o)}
                                                >
                                                    {mapOpen ? "Hide map" : "Show map"}
                                                </Button>
                                            </div>
                                            {mapOpen && (
                                                <div id="compliance-map-body" className="compliance-map__body">
                                                    <ComplianceFlowMap dataFlowCountries={dataFlowCountries} dataFlowOrigin="DE" />
                                                </div>
                                            )}
                                        </section>
                                    )}
                                </TabPanel>
                            )}

                            {activeTab === "transfers" && preConsentTransfers?.pre_consent_transfers?.length === 0 && !scanLoading && (
                                <div className="compliance-transfers__empty compliance-transfers__empty--clean">
                                    <span className="compliance-transfers__empty-icon" aria-hidden>✓</span>
                                    <span>No data transfers detected in the last scan.</span>
                                </div>
                            )}

                            {/* ── Cookies tab ── */}
                            <TabPanel idPrefix="compliance" id="cookies" active={activeTab === "cookies"}>
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
                                const cookiePhaseKnown = preConsentTransfers?.consent_phase_known === true;
                                const cookiesInPhase = filterByConsentPhase(allCookies, cookiePhaseKnown ? cookiePhase : "all");
                                const cookies = groupCookiesByName(
                                    cookiesInPhase.filter(c => !csq ||
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
                                            {cookiePhaseKnown && (
                                                <FilterSelect
                                                    label="Loaded"
                                                    value={cookiePhase}
                                                    onChange={(value) => { setCookiePhase(value); setCookiePage(0); }}
                                                    options={[{ value: "all", label: "Before or after consent" }, { value: "pre", label: "Before consent only" }, { value: "post", label: "After consent only" }]}
                                                />
                                            )}
                                            {(searchQuery || cookiePhase !== "all") && (
                                                <span className="compliance-search__count">
                                                    {cookies.length} result{cookies.length !== 1 ? "s" : ""}
                                                </span>
                                            )}
                                        </div>
                                        {!cookies.length ? (
                                            <div className="compliance-transfers__empty">
                                                <span>{searchQuery ? `No cookies match "${searchQuery}" with this filter.` : "No cookies match this filter."}</span>
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
                                                        ? formatCookieDuration(eff.expires, preConsentTransfers?.scanned_at)
                                                        : "Persistent";
                                                return (
                                                    <div key={c.name + i} className="compliance-cookies__row-wrap">
                                                        <div className={"compliance-cookies__row" + (isUnknown ? " --unknown" : "")}>
                                                            <div className="compliance-cookies__row-main">
                                                                <span className="compliance-cookies__row-name">{eff.name}</span>
                                                                {eff.vendor && (
                                                    eff.privacyUrl
                                                        ? <a href={eff.privacyUrl} target="_blank" rel="noopener noreferrer" className="compliance-cookies__row-vendor">{eff.vendor}</a>
                                                        : <span className="compliance-cookies__row-vendor">{eff.vendor}</span>
                                                )}
                                                                <span className="compliance-cookies__row-domain">{eff.domains.join(", ")}</span>
                                                                {cookiePhaseKnown && c.consentPhase === "pre" && (["marketing", "analytics"].includes(eff.bannerCategory)
                                                                    ? <Badge tone="danger" icon="alert-triangle" className="compliance-cookies__row-phase">Before consent</Badge>
                                                                    : <Badge tone="neutral" icon="info" className="compliance-cookies__row-phase">Before consent</Badge>)}
                                                                {cookiePhaseKnown && c.consentPhase === "post" && <Badge tone="neutral" icon="check-circle" className="compliance-cookies__row-phase">After consent</Badge>}
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
</TabPanel>
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
                        preConsentScan={preConsentTransfers}
                    />
                    <DsrSummaryCard platformId={id} />
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
                            Optional: add <code>data-lang="de"</code> for translated labels. If visitors use an ad blocker, add <code>data-api-base="/your-proxy"</code> and proxy that path to <code>https://www.intastellarconsents.com/api/cookie-banner</code> on your server.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
