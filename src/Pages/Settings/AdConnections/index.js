import AdConnectionManager from "../../Reports/MarketingReport/AdConnectionManager.js";
import Authentication from "../../../Authentication/Auth";
import SideNav from "../../../Components/Header/SideNav";
import StickyPageTitle from "../../../Components/Header/Sticky";
import { reportsLinks as settingsSidebarLinks } from "../../../Components/Header/SideNavLinks";
import API from "../../../API/api";

const { useState, useEffect, useContext } = React;
import { DomainContext } from "../../../App.js";

export default function AdConnectionsSettings() {
    document.title = "Ad Connections | Settings | Intastellar Consents";

    const [currentDomain] = useContext(DomainContext);

    const [domains, setDomains] = useState([]);
    const [domainsLoading, setDomainsLoading] = useState(true);
    const [domainsError, setDomainsError] = useState(false);
    const [selectedDomain, setSelectedDomain] = useState("");

    const authToken = Authentication.getToken();
    const orgId = Authentication.getOrganisation();

    useEffect(() => {
        const ep = API.gdpr?.getDomainsUrl;
        if (!ep?.url) {
            setDomainsLoading(false);
            setDomainsError(true);
            return;
        }
        fetch(ep.url, { method: ep.method || "GET", headers: ep.headers || {} })
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(data => {
                const raw = Array.isArray(data) ? data
                    : Array.isArray(data?.data) ? data.data
                    : [];
                const filtered = raw
                    .map(item => (typeof item === "string" ? item : item?.domain || ""))
                    .filter(d => d && d !== "combined view");
                setDomains(filtered);
                // Default: prefer the context domain if valid, else first from list
                const ctx = typeof currentDomain === "string" && currentDomain !== "combined view"
                    ? currentDomain : null;
                setSelectedDomain(ctx && filtered.includes(ctx) ? ctx : (filtered[0] || ""));
            })
            .catch(() => {
                setDomainsError(true);
            })
            .finally(() => {
                setDomainsLoading(false);
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

                    {domainsLoading ? (
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
