const { useState, useEffect, useCallback } = React;
import { ScannerHost } from "../../../API/host";
import {
    GoogleLogo, GA4Logo, SearchConsoleLogo, MetaLogo, LinkedInLogo, MicrosoftLogo, OpenAILogo,
} from "./PlatformLogos.js";

const AD_PLATFORMS = [
    { id: "google_ads",            label: "Google Ads",                  Logo: GoogleLogo,        isAnalytics: false },
    { id: "google_analytics",      label: "Google Analytics 4",          Logo: GA4Logo,           isAnalytics: true  },
    { id: "google_search_console", label: "Google Search Console",       Logo: SearchConsoleLogo, isAnalytics: true  },
    { id: "meta_ads",              label: "Meta (Facebook / Instagram)", Logo: MetaLogo,          isAnalytics: false },
    { id: "linkedin_ads",          label: "LinkedIn Ads",                Logo: LinkedInLogo,      isAnalytics: false },
    { id: "microsoft_ads",         label: "Microsoft Ads",               Logo: MicrosoftLogo,     isAnalytics: false },
    { id: "openai_ads",            label: "OpenAI Ads",                  Logo: OpenAILogo,        isAnalytics: false, apiKey: true },
];

function formatDate(iso) {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return ""; }
}

export default function AdConnectionManager({ domain, orgId, authToken, fromDate, toDate, onImport, onSelectAccount }) {
    const [connections, setConnections] = useState([]);
    const [loadingConnections, setLoadingConnections] = useState(false);
    const [importing, setImporting] = useState(null);
    const [connecting, setConnecting] = useState(null);
    const [reselecting, setReselecting] = useState(null);
    const [manualInput, setManualInput] = useState(null); // { platformId } | null
    const [manualId, setManualId] = useState("");
    const [savingManual, setSavingManual] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState(null); // { platformId } | null
    const [apiKeyValue, setApiKeyValue] = useState("");
    const [savingApiKey, setSavingApiKey] = useState(false);
    const [statusMsg, setStatusMsg] = useState(null);
    const [statusIsError, setStatusIsError] = useState(false);

    const setStatus = useCallback((msg, isError = false) => {
        setStatusMsg(msg);
        setStatusIsError(isError);
        if (msg) setTimeout(() => setStatusMsg(null), 6000);
    }, []);

    const fetchConnections = useCallback(async () => {
        if (!domain || !orgId || !authToken) return;
        setLoadingConnections(true);
        try {
            const resp = await fetch(
                `${ScannerHost}/api/ad-connections?domain=${encodeURIComponent(domain)}`,
                { headers: { Authorization: authToken, Organisation: String(orgId) } }
            );
            if (!resp.ok) { setStatus("Could not load connections.", true); return; }
            const data = await resp.json();
            setConnections(data.connections || []);
        } catch (err) {
            setStatus(err.message, true);
        } finally {
            setLoadingConnections(false);
        }
    }, [domain, orgId, authToken, setStatus]);

    useEffect(() => { fetchConnections(); }, [fetchConnections]);

    const triggerSync = useCallback((syncDomain, platform) => {
        if (!authToken || !orgId || !syncDomain) return;
        const url = new URL(`${ScannerHost}/api/cron-ad-sync`);
        url.searchParams.set("domain", syncDomain);
        if (platform) url.searchParams.set("platform", platform);
        fetch(url.toString(), {
            headers: { Authorization: authToken, Organisation: String(orgId) },
        }).catch(() => {});
    }, [authToken, orgId]);

    // Pick up oauth_success / oauth_error query params set by the callback redirect
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.has("oauth_success")) {
            const p = params.get("oauth_success");
            const oauthDomain = params.get("oauth_domain") || domain;
            const label = AD_PLATFORMS.find(x => x.id === p)?.label || p;
            setStatus(`${label} connected — syncing data…`);
            fetchConnections();
            triggerSync(oauthDomain, p);
            const url = new URL(window.location.href);
            url.searchParams.delete("oauth_success");
            url.searchParams.delete("oauth_domain");
            window.history.replaceState({}, "", url.toString());
        } else if (params.has("oauth_error")) {
            setStatus(`Connection failed: ${params.get("oauth_error")}`, true);
            const url = new URL(window.location.href);
            url.searchParams.delete("oauth_error");
            url.searchParams.delete("platform");
            window.history.replaceState({}, "", url.toString());
        }
    }, [fetchConnections, setStatus, triggerSync, domain]);

    async function handleConnect(platformId) {
        if (!orgId) {
            setStatus("Session expired — please reload and log in again.", true);
            return;
        }
        // API-key platforms show an inline form instead of redirecting to OAuth
        const platformMeta = AD_PLATFORMS.find(p => p.id === platformId);
        if (platformMeta?.apiKey) {
            setApiKeyInput({ platformId });
            return;
        }
        setConnecting(platformId);
        try {
            const returnPath = window.location.pathname;
            const url = [
                `${ScannerHost}/api/ad-oauth-start`,
                `?platform=${encodeURIComponent(platformId)}`,
                `&domain=${encodeURIComponent(domain)}`,
                `&returnPath=${encodeURIComponent(returnPath)}`,
                `&org=${encodeURIComponent(orgId)}`,
            ].join("");
            const resp = await fetch(url);
            const data = await resp.json();
            if (!resp.ok || !data.authUrl) {
                setStatus(data.error || "Could not start connection.", true);
                setConnecting(null);
                return;
            }
            window.location.href = data.authUrl;
        } catch (err) {
            setStatus(err.message, true);
            setConnecting(null);
        }
    }

    async function handleApiKeyConnect() {
        if (!apiKeyValue.trim() || !apiKeyInput) return;
        setSavingApiKey(true);
        try {
            const resp = await fetch(`${ScannerHost}/api/ad-connections`, {
                method: "POST",
                headers: {
                    Authorization: authToken,
                    Organisation: String(orgId),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    platform: apiKeyInput.platformId,
                    domain,
                    apiKey: apiKeyValue.trim(),
                }),
            });
            const data = await resp.json();
            if (!resp.ok) {
                setStatus(data.error || "Could not connect.", true);
                return;
            }
            setApiKeyInput(null);
            setApiKeyValue("");
            setStatus(`OpenAI Ads connected (${data.accountLabel || data.accountId}) — syncing data…`);
            fetchConnections();
            triggerSync(domain, apiKeyInput.platformId);
        } catch (err) {
            setStatus(err.message, true);
        } finally {
            setSavingApiKey(false);
        }
    }

    async function handleReselect(platformId) {
        setReselecting(platformId);
        try {
            const resp = await fetch(
                `${ScannerHost}/api/ad-account-reselect?platform=${encodeURIComponent(platformId)}&domain=${encodeURIComponent(domain)}&org=${encodeURIComponent(orgId)}`,
                { headers: { Authorization: authToken, Organisation: String(orgId) } }
            );
            const data = await resp.json();
            if (!resp.ok) {
                setStatus(data.error || "Could not load accounts.", true);
                return;
            }
            if (!data.pendingId) {
                // Google returned no accounts (Basic API access level) — fall back to manual ID entry
                setManualInput({ platformId });
                return;
            }
            onSelectAccount?.(platformId, data.pendingId, domain);
        } catch (err) {
            setStatus(err.message, true);
        } finally {
            setReselecting(null);
        }
    }

    async function handleManualSave() {
        if (!manualId.trim() || !manualInput) return;
        setSavingManual(true);
        try {
            const resp = await fetch(`${ScannerHost}/api/ad-account-reselect`, {
                method: "POST",
                headers: {
                    Authorization: authToken,
                    Organisation: String(orgId),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    platform: manualInput.platformId,
                    domain,
                    accountId: manualId.trim(),
                    accountLabel: manualId.trim(),
                }),
            });
            const data = await resp.json();
            if (!resp.ok) { setStatus(data.error || "Could not save account.", true); return; }
            setManualInput(null);
            setManualId("");
            setStatus("Account connected — syncing data…");
            fetchConnections();
            triggerSync(domain, manualInput.platformId);
        } catch (err) {
            setStatus(err.message, true);
        } finally {
            setSavingManual(false);
        }
    }

    async function handleDisconnect(platformId) {
        const label = AD_PLATFORMS.find(p => p.id === platformId)?.label || platformId;
        if (!window.confirm(`Disconnect ${label}?\nThis removes the connection from this domain. You can reconnect at any time.`)) return;
        try {
            await fetch(
                `${ScannerHost}/api/ad-connections?platform=${platformId}&domain=${encodeURIComponent(domain)}`,
                { method: "DELETE", headers: { Authorization: authToken, Organisation: String(orgId) } }
            );
            setConnections(prev => prev.filter(c => c.platform !== platformId));
            setStatus(`${label} disconnected.`);
        } catch (err) {
            setStatus(err.message, true);
        }
    }

    async function handleImport(platformId) {
        if (!fromDate || !toDate) {
            setStatus("Set a date range in the header filter first.", true);
            return;
        }
        setImporting(platformId);
        try {
            const resp = await fetch(
                `${ScannerHost}/api/ad-data-fetch?platform=${platformId}&domain=${encodeURIComponent(domain)}&fromDate=${fromDate}&toDate=${toDate}`,
                { headers: { Authorization: authToken, Organisation: String(orgId) } }
            );
            const data = await resp.json();
            if (!resp.ok) {
                setStatus(data.error || "Import failed.", true);
                return;
            }
            const platformMeta = AD_PLATFORMS.find(p => p.id === platformId);
            const label = platformMeta?.label || platformId;
            onImport?.(platformId, data);
            const summary = platformMeta?.isAnalytics
                ? `${data.sessions?.toLocaleString() || 0} sessions`
                : `${data.clicks?.toLocaleString() || 0} clicks${data.spend ? `, ${data.currency || ""} ${Number(data.spend).toFixed(2)} spend` : ""}`;
            setStatus(`Imported from ${label}: ${summary}`);
        } catch (err) {
            setStatus(err.message, true);
        } finally {
            setImporting(null);
        }
    }

    const connMap = Object.fromEntries(connections.map(c => [c.platform, c]));

    return (
        <div className="ad-connection-manager">
            <div className="ad-connection-manager__header">
                <h3 className="ad-connection-manager__title">Auto-import from Ad Platforms</h3>
                <p className="ad-connection-manager__hint">
                    Connect once per domain — we'll fetch clicks and spend directly from the platform
                    so you don't have to paste them in manually.
                </p>
            </div>

            {statusMsg && (
                <p
                    className={`ad-connection-manager__status${statusIsError ? " ad-connection-manager__status--error" : ""}`}
                    role="alert"
                >
                    {statusMsg}
                </p>
            )}

            {loadingConnections ? (
                <p className="ad-connection-manager__loading">Checking connections…</p>
            ) : (
                <div className="ad-connection-manager__list">
                    {AD_PLATFORMS.map(platform => {
                        const conn = connMap[platform.id];
                        const hasToken = conn?.has_token;
                        const hasAccount = !!conn?.account_id;
                        const isFullyConnected = hasToken && hasAccount;
                        const needsAccountSelection = hasToken && !hasAccount;
                        const isImporting = importing === platform.id;
                        const isConnecting = connecting === platform.id;
                        const isReselecting = reselecting === platform.id;

                        return (
                            <div
                                key={platform.id}
                                className={`ad-connection-card${isFullyConnected ? " ad-connection-card--connected" : needsAccountSelection ? " ad-connection-card--pending" : ""}`}
                            >
                                <div className="ad-connection-card__icon" aria-hidden="true">
                                    <platform.Logo />
                                </div>

                                <div className="ad-connection-card__info">
                                    <span className="ad-connection-card__name">{platform.label}</span>
                                    {isFullyConnected ? (
                                        <span className="ad-connection-card__meta">
                                            {conn.account_label || "Connected"}
                                            {platform.isAnalytics
                                                ? " · auto-populates dashboard"
                                                : conn.updated_at ? ` · synced ${formatDate(conn.updated_at)}` : ""}
                                        </span>
                                    ) : needsAccountSelection ? (
                                        <span className="ad-connection-card__meta ad-connection-card__meta--dim">
                                            {platform.isAnalytics ? "Authorized — select a property to finish" : "Authorized — select an ad account to finish"}
                                        </span>
                                    ) : (
                                        <span className="ad-connection-card__meta ad-connection-card__meta--dim">
                                            {platform.isAnalytics ? "Not connected · sessions auto-populate when connected" : "Not connected"}
                                        </span>
                                    )}
                                </div>

                                <div className="ad-connection-card__actions">
                                    {isFullyConnected ? (
                                        <>
                                            {!platform.isAnalytics && (
                                                <button
                                                    className="ad-connection-card__btn ad-connection-card__btn--import"
                                                    onClick={() => handleImport(platform.id)}
                                                    disabled={isImporting}
                                                    title={`Import ${fromDate}–${toDate} data from ${platform.label}`}
                                                >
                                                    {isImporting ? "Importing…" : "Import data"}
                                                </button>
                                            )}
                                            <button
                                                className="ad-connection-card__btn ad-connection-card__btn--disconnect"
                                                onClick={() => handleDisconnect(platform.id)}
                                            >
                                                Disconnect
                                            </button>
                                        </>
                                    ) : needsAccountSelection ? (
                                        <>
                                            <button
                                                className="ad-connection-card__btn ad-connection-card__btn--connect"
                                                onClick={() => handleReselect(platform.id)}
                                                disabled={isReselecting}
                                            >
                                                {isReselecting ? "Loading…" : platform.isAnalytics ? "Select property" : "Select account"}
                                            </button>
                                            <button
                                                className="ad-connection-card__btn ad-connection-card__btn--disconnect"
                                                onClick={() => handleDisconnect(platform.id)}
                                            >
                                                Disconnect
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            className="ad-connection-card__btn ad-connection-card__btn--connect"
                                            onClick={() => handleConnect(platform.id)}
                                            disabled={isConnecting}
                                        >
                                            {isConnecting ? "Opening…" : "Connect"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        {manualInput && (() => {
            const isGA4 = manualInput.platformId === "google_analytics";
            return (
            <div className="ad-manual-input-backdrop">
                <div className="ad-manual-input">
                    <h4 className="ad-manual-input__title">
                        {isGA4 ? "Enter GA4 Property ID" : "Enter Google Ads Customer ID"}
                    </h4>
                    <p className="ad-manual-input__hint">
                        {isGA4
                            ? <>Find it in Google Analytics → Admin → Property settings — a numeric ID like <strong>123456789</strong>.</>
                            : <>Find it in Google Ads under the account name — 10 digits, format{" "}<strong>XXX-XXX-XXXX</strong>. Dashes are optional.</>}
                    </p>
                    <input
                        className="ad-manual-input__field"
                        type="text"
                        value={manualId}
                        onChange={e => setManualId(e.target.value)}
                        placeholder={isGA4 ? "e.g. 123456789" : "e.g. 123-456-7890"}
                        onKeyDown={e => e.key === "Enter" && handleManualSave()}
                        autoFocus
                    />
                    <div className="ad-manual-input__actions">
                        <button
                            className="ad-connection-card__btn ad-connection-card__btn--disconnect"
                            onClick={() => { setManualInput(null); setManualId(""); }}
                            disabled={savingManual}
                        >
                            Cancel
                        </button>
                        <button
                            className="ad-connection-card__btn ad-connection-card__btn--connect"
                            onClick={handleManualSave}
                            disabled={!manualId.trim() || savingManual}
                        >
                            {savingManual ? "Connecting…" : "Connect"}
                        </button>
                    </div>
                </div>
            </div>
            );
        })()}

        {apiKeyInput && (
            <div className="ad-manual-input-backdrop">
                <div className="ad-manual-input">
                    <h4 className="ad-manual-input__title">Connect OpenAI Ads</h4>
                    <p className="ad-manual-input__hint">
                        Generate an API key in your{" "}
                        <strong>OpenAI Ads Manager → Settings → API keys</strong>.
                        We'll verify the key and fetch your account details automatically.
                    </p>
                    <input
                        className="ad-manual-input__field"
                        type="password"
                        value={apiKeyValue}
                        onChange={e => setApiKeyValue(e.target.value)}
                        placeholder="sk-ads-…"
                        onKeyDown={e => e.key === "Enter" && handleApiKeyConnect()}
                        autoFocus
                        autoComplete="off"
                    />
                    <div className="ad-manual-input__actions">
                        <button
                            className="ad-connection-card__btn ad-connection-card__btn--disconnect"
                            onClick={() => { setApiKeyInput(null); setApiKeyValue(""); }}
                            disabled={savingApiKey}
                        >
                            Cancel
                        </button>
                        <button
                            className="ad-connection-card__btn ad-connection-card__btn--connect"
                            onClick={handleApiKeyConnect}
                            disabled={!apiKeyValue.trim() || savingApiKey}
                        >
                            {savingApiKey ? "Verifying…" : "Connect"}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </div>
    );
}
