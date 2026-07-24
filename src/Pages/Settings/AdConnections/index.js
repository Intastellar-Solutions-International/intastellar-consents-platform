import AdConnectionManager from "../../Reports/MarketingReport/AdConnectionManager.js";
import Authentication from "../../../Authentication/Auth";
import SideNav from "../../../Components/Header/SideNav";
import StickyPageTitle from "../../../Components/Header/Sticky";
import { reportsLinks as settingsSidebarLinks } from "../../../Components/Header/SideNavLinks";
import API from "../../../API/api";

const { useState, useEffect, useContext } = React;
import { DomainContext } from "../../../App.js";

function readCachedDomains() {
    try {
        const raw = localStorage.getItem("domains");
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(d => d && typeof d === "string" && d !== "combined view");
    } catch {
        return [];
    }
}

export default function AdConnectionsSettings() {
    document.title = "Ad Connections | Settings | Intastellar Consents";

    const [currentDomain] = useContext(DomainContext);

    const [domains, setDomains] = useState(() => readCachedDomains());
    const [domainsLoading, setDomainsLoading] = useState(() => readCachedDomains().length === 0);
    const [domainsError, setDomainsError] = useState(false);
    const [selectedDomain, setSelectedDomain] = useState("");

    // Always read fresh — avoids stale closure from module-level API headers
    const authToken = Authentication.getToken();
    const orgId = Authentication.getOrganisation();

    useEffect(() => {
        // If localStorage already has domains, use them and just set the selected domain
        const cached = readCachedDomains();
        if (cached.length > 0) {
            const ctx = typeof currentDomain === "string" && currentDomain !== "combined view"
                ? currentDomain : null;
            setSelectedDomain(ctx && cached.includes(ctx) ? ctx : cached[0]);
            setDomainsLoading(false);
            return;
        }

        // Otherwise fetch from the same endpoint the header uses
        const ep = API.gdpr?.getDomains;
        if (!ep?.url) {
            setDomainsLoading(false);
            setDomainsError(true);
            return;
        }

        const token = Authentication.getToken();
        const org = Authentication.getOrganisation();

        fetch(ep.url, {
            method: ep.method || "GET",
            headers: {
                "Authorization": token || "",
                "Organisation": org != null ? String(org) : "",
                "Content-Type": "application/json",
            },
        })
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(data => {
                const raw = Array.isArray(data) ? data
                    : Array.isArray(data?.data) ? data.data
                    : [];
                const strings = raw
                    .map(item => (typeof item === "string" ? item : (item?.domain || item?.host || "")))
                    .filter(d => d && d !== "combined view");
                if (strings.length === 0) {
                    setDomainsError(true);
                } else {
                    applyDomains(strings);
                }
            })
            .catch(() => setDomainsError(true))
            .finally(() => setDomainsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function applyDomains(list) {
        setDomains(list);
        const ctx = typeof currentDomain === "string" && currentDomain !== "combined view"
            ? currentDomain : null;
        setSelectedDomain(ctx && list.includes(ctx) ? ctx : (list[0] || ""));
    }

    const notLoggedIn = !authToken || !orgId;

    return (
        <>
            <SideNav links={settingsSidebarLinks} title="Settings" />
            <div style={{ flex: "1" }}>
                <StickyPageTitle title="Ad Connections" />
                <div className="dashboard-content">
                    <header style={{ marginBottom: "24px" }}>
                        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "6px" }}>
                            Ad Connections
                        </h1>
                        <p style={{ color: "rgba(180,185,200,0.8)", fontSize: "0.9rem" }}>
                            Connect Google Ads, Meta, LinkedIn, and Microsoft Ads to auto-import
                            clicks and spend for each domain. Connections are per-domain.
                        </p>
                    </header>

                    {notLoggedIn ? (
                        <p style={{ color: "rgba(230,80,80,0.9)", fontSize: "0.9rem" }}>
                            Session not found. Please reload the page or log in again.
                        </p>
                    ) : domainsLoading ? (
                        <p style={{ color: "rgba(180,185,200,0.7)" }}>Loading domains…</p>
                    ) : domainsError || domains.length === 0 ? (
                        <p style={{ color: "rgba(180,185,200,0.7)" }}>
                            No domains found for this organisation. Add a domain in Settings → Add new Domain first.
                        </p>
                    ) : (
                        <>
                            <label style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "20px", maxWidth: "360px" }}>
                                <span style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(160,165,175,0.85)" }}>
                                    Domain
                                </span>
                                <select
                                    value={selectedDomain}
                                    onChange={e => setSelectedDomain(e.target.value)}
                                    className="marketing-reconciliation__select"
                                    style={{ maxWidth: "360px" }}
                                >
                                    {domains.map(d => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                            </label>

                            {selectedDomain ? (
                                <>
                                    <p style={{ fontSize: "0.8rem", color: "rgba(160,165,175,0.75)", marginBottom: "16px" }}>
                                        Managing connections for <strong style={{ color: "rgba(220,225,235,0.9)" }}>{selectedDomain}</strong>
                                    </p>
                                    <AdConnectionManager
                                        domain={selectedDomain}
                                        orgId={orgId}
                                        authToken={authToken}
                                    />
                                </>
                            ) : null}
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
