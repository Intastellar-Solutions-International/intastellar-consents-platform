import AdConnectionManager from "../../Reports/MarketingReport/AdConnectionManager.js";
import { ScannerHost } from "../../../API/host";
import Authentication from "../../../Authentication/Auth";
import SideNav from "../../../Components/Header/SideNav";
import StickyPageTitle from "../../../Components/Header/Sticky";
import { reportsLinks as settingsSidebarLinks } from "../../../Components/Header/SideNavLinks";
import API from "../../../API/api";

const { useState, useEffect, useRef, useContext } = React;
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

// ── Account Picker Modal ────────────────────────────────────────────────────

function AccountPickerModal({ pendingId, platform, domain, orgId, authToken, onDone, onClose }) {
    const [accounts, setAccounts] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [selected, setSelected] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const dialogRef = useRef(null);

    const platformLabels = {
        google_ads:    "Google Ads",
        meta_ads:      "Meta Ads",
        linkedin_ads:  "LinkedIn Ads",
        microsoft_ads: "Microsoft Ads",
    };
    const label = platformLabels[platform] || platform;

    useEffect(() => {
        if (!pendingId || !orgId || !authToken) {
            setLoadError("Session missing. Please reconnect.");
            return;
        }
        fetch(`${ScannerHost}/api/ad-connection-pending?id=${encodeURIComponent(pendingId)}`, {
            headers: { Authorization: authToken, Organisation: String(orgId) },
        })
            .then(r => r.json())
            .then(data => {
                if (data.error) { setLoadError(data.error); return; }
                setAccounts(data.accounts || []);
                if (data.accounts?.length === 1) setSelected(data.accounts[0].id);
            })
            .catch(() => setLoadError("Could not load accounts. Please reconnect."));
    }, [pendingId, orgId, authToken]);

    // Trap focus inside dialog
    useEffect(() => {
        dialogRef.current?.focus();
    }, [accounts]);

    async function handleConfirm() {
        if (!selected) return;
        setSaving(true);
        setSaveError(null);
        try {
            const acct = accounts?.find(a => a.id === selected);
            const resp = await fetch(`${ScannerHost}/api/ad-connection-pending?id=${encodeURIComponent(pendingId)}`, {
                method: "POST",
                headers: {
                    Authorization: authToken,
                    Organisation: String(orgId),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ accountId: selected, accountLabel: acct?.name || selected }),
            });
            const data = await resp.json();
            if (!resp.ok) { setSaveError(data.error || "Could not save connection."); setSaving(false); return; }
            onDone(platform, acct?.name || selected);
        } catch (err) {
            setSaveError(err.message);
            setSaving(false);
        }
    }

    return (
        <div className="account-picker-backdrop" role="dialog" aria-modal="true" aria-label={`Connect ${label}`}>
            <div className="account-picker" ref={dialogRef} tabIndex={-1}>
                <div className="account-picker__header">
                    <h2 className="account-picker__title">Choose a {label} account</h2>
                    <p className="account-picker__sub">
                        Select the ad account you want to link to <strong>{domain}</strong>.
                        You can change this later by disconnecting and reconnecting.
                    </p>
                </div>

                <div className="account-picker__body">
                    {!accounts && !loadError && (
                        <p className="account-picker__loading">Loading accounts…</p>
                    )}
                    {loadError && (
                        <p className="account-picker__error">{loadError}</p>
                    )}
                    {accounts && accounts.length === 0 && (
                        <p className="account-picker__empty">
                            No ad accounts were found on this {label} login.
                            Make sure you have at least one active ad account and try reconnecting.
                        </p>
                    )}
                    {accounts && accounts.length > 0 && (
                        <ul className="account-picker__list" role="listbox">
                            {accounts.map(acct => (
                                <li
                                    key={acct.id}
                                    role="option"
                                    aria-selected={selected === acct.id}
                                    className={`account-picker__item${selected === acct.id ? " account-picker__item--selected" : ""}${acct.status === "inactive" ? " account-picker__item--dim" : ""}`}
                                    onClick={() => setSelected(acct.id)}
                                >
                                    <span className="account-picker__item-radio" aria-hidden="true" />
                                    <span className="account-picker__item-info">
                                        <span className="account-picker__item-name">{acct.name}</span>
                                        <span className="account-picker__item-id">ID: {acct.id}{acct.status === "inactive" ? " · inactive" : ""}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {saveError && <p className="account-picker__error" style={{ marginTop: "12px" }}>{saveError}</p>}
                </div>

                <div className="account-picker__footer">
                    <button className="account-picker__btn account-picker__btn--cancel" onClick={onClose} disabled={saving}>
                        Cancel
                    </button>
                    <button
                        className="account-picker__btn account-picker__btn--confirm"
                        onClick={handleConfirm}
                        disabled={!selected || saving || !accounts}
                    >
                        {saving ? "Connecting…" : "Connect account"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function AdConnectionsSettings() {
    document.title = "Ad Connections | Settings | Intastellar Consents";

    const [currentDomain] = useContext(DomainContext);

    const [domains, setDomains] = useState(() => readCachedDomains());
    const [domainsLoading, setDomainsLoading] = useState(() => readCachedDomains().length === 0);
    const [domainsError, setDomainsError] = useState(false);
    const [selectedDomain, setSelectedDomain] = useState("");

    // Pending OAuth account picker
    const [pendingId, setPendingId] = useState(null);
    const [pendingPlatform, setPendingPlatform] = useState(null);
    const [pendingDomain, setPendingDomain] = useState(null);

    const [successMsg, setSuccessMsg] = useState(null);
    const [managerKey, setManagerKey] = useState(0); // bump to re-mount AdConnectionManager

    // Always read fresh auth values at render time
    const authToken = Authentication.getToken();
    const orgId = Authentication.getOrganisation();

    // Detect ?select_account, ?oauth_success, ?oauth_error from URL on mount
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);

        if (params.has("select_account")) {
            setPendingId(params.get("select_account"));
            setPendingPlatform(params.get("platform") || null);
            setPendingDomain(params.get("domain") || null);
            // Clean URL immediately
            const url = new URL(window.location.href);
            url.searchParams.delete("select_account");
            url.searchParams.delete("platform");
            url.searchParams.delete("domain");
            window.history.replaceState({}, "", url.toString());
            return;
        }

        if (params.has("oauth_success")) {
            const p = params.get("oauth_success");
            const platformLabels = {
                google_ads: "Google Ads", meta_ads: "Meta Ads",
                linkedin_ads: "LinkedIn Ads", microsoft_ads: "Microsoft Ads",
            };
            showSuccess(`${platformLabels[p] || p} connected successfully.`);
            setManagerKey(k => k + 1);
            const url = new URL(window.location.href);
            url.searchParams.delete("oauth_success");
            url.searchParams.delete("oauth_domain");
            window.history.replaceState({}, "", url.toString());
        } else if (params.has("oauth_error")) {
            // Let AdConnectionManager display it
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function showSuccess(msg) {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(null), 6000);
    }

    // Domain list from localStorage cache (header populates this)
    useEffect(() => {
        const cached = readCachedDomains();
        if (cached.length > 0) {
            const ctx = typeof currentDomain === "string" && currentDomain !== "combined view"
                ? currentDomain : null;
            setSelectedDomain(ctx && cached.includes(ctx) ? ctx : cached[0]);
            setDomainsLoading(false);
            return;
        }

        // Fallback: fetch from the same endpoint the header uses
        const ep = API.gdpr?.getDomains;
        if (!ep?.url) { setDomainsLoading(false); setDomainsError(true); return; }

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
                const raw = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
                const strings = raw
                    .map(item => (typeof item === "string" ? item : (item?.domain || item?.host || "")))
                    .filter(d => d && d !== "combined view");
                if (strings.length === 0) { setDomainsError(true); return; }
                setDomains(strings);
                const ctx = typeof currentDomain === "string" && currentDomain !== "combined view"
                    ? currentDomain : null;
                setSelectedDomain(ctx && strings.includes(ctx) ? ctx : strings[0]);
            })
            .catch(() => setDomainsError(true))
            .finally(() => setDomainsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleSelectAccount(platform, pendingId, domain) {
        setPendingId(pendingId);
        setPendingPlatform(platform);
        setPendingDomain(domain || selectedDomain);
    }

    function handlePickerDone(platform, accountName) {
        const platformLabels = {
            google_ads: "Google Ads", meta_ads: "Meta Ads",
            linkedin_ads: "LinkedIn Ads", microsoft_ads: "Microsoft Ads",
        };
        showSuccess(`${platformLabels[platform] || platform} connected — ${accountName}.`);
        setPendingId(null);
        setPendingPlatform(null);
        setPendingDomain(null);
        setManagerKey(k => k + 1);
    }

    function handlePickerClose() {
        setPendingId(null);
        setPendingPlatform(null);
        setPendingDomain(null);
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

                    {successMsg && (
                        <div className="ad-connections-success-banner" role="alert">
                            {successMsg}
                        </div>
                    )}

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
                                        Managing connections for{" "}
                                        <strong style={{ color: "rgba(220,225,235,0.9)" }}>{selectedDomain}</strong>
                                    </p>
                                    <AdConnectionManager
                                        key={managerKey}
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

            {pendingId && (
                <AccountPickerModal
                    pendingId={pendingId}
                    platform={pendingPlatform}
                    domain={pendingDomain || selectedDomain}
                    orgId={orgId}
                    authToken={authToken}
                    onDone={handlePickerDone}
                    onClose={handlePickerClose}
                />
            )}
        </>
    );
}
