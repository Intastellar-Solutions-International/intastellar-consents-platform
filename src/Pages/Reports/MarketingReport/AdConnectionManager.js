const { useState, useEffect, useCallback } = React;
import { ScannerHost } from "../../../API/host";

const AD_PLATFORMS = [
    { id: "google_ads",    label: "Google Ads",                  color: "#4285f4", initial: "G" },
    { id: "meta_ads",      label: "Meta (Facebook / Instagram)",  color: "#1877f2", initial: "f" },
    { id: "linkedin_ads",  label: "LinkedIn Ads",                 color: "#0a66c2", initial: "in" },
    { id: "microsoft_ads", label: "Microsoft Ads",                color: "#00a4ef", initial: "B" },
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

    // Pick up oauth_success / oauth_error query params set by the callback redirect
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.has("oauth_success")) {
            const p = params.get("oauth_success");
            const label = AD_PLATFORMS.find(x => x.id === p)?.label || p;
            setStatus(`${label} connected.`);
            fetchConnections();
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
    }, [fetchConnections, setStatus]);

    async function handleConnect(platformId) {
        if (!orgId) {
            setStatus("Session expired — please reload and log in again.", true);
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
                setStatus(data.message || "No accounts found — the token may be expired. Try reconnecting.", true);
                return;
            }
            onSelectAccount?.(platformId, data.pendingId, domain);
        } catch (err) {
            setStatus(err.message, true);
        } finally {
            setReselecting(null);
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
            const label = AD_PLATFORMS.find(p => p.id === platformId)?.label || platformId;
            onImport?.(platformId, data);
            setStatus(`Imported from ${label}: ${data.clicks?.toLocaleString() || 0} clicks${data.spend ? `, ${data.currency || ""} ${Number(data.spend).toFixed(2)} spend` : ""}.`);
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
                                <div
                                    className="ad-connection-card__icon"
                                    style={{ background: platform.color }}
                                    aria-hidden="true"
                                >
                                    {platform.initial}
                                </div>

                                <div className="ad-connection-card__info">
                                    <span className="ad-connection-card__name">{platform.label}</span>
                                    {isFullyConnected ? (
                                        <span className="ad-connection-card__meta">
                                            {conn.account_label || "Connected"}
                                            {conn.updated_at ? ` · synced ${formatDate(conn.updated_at)}` : ""}
                                        </span>
                                    ) : needsAccountSelection ? (
                                        <span className="ad-connection-card__meta ad-connection-card__meta--dim">
                                            Authorized — select an ad account to finish
                                        </span>
                                    ) : (
                                        <span className="ad-connection-card__meta ad-connection-card__meta--dim">
                                            Not connected
                                        </span>
                                    )}
                                </div>

                                <div className="ad-connection-card__actions">
                                    {isFullyConnected ? (
                                        <>
                                            <button
                                                className="ad-connection-card__btn ad-connection-card__btn--import"
                                                onClick={() => handleImport(platform.id)}
                                                disabled={isImporting}
                                                title={`Import ${fromDate}–${toDate} data from ${platform.label}`}
                                            >
                                                {isImporting ? "Importing…" : "Import data"}
                                            </button>
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
                                                onClick={() => {
                                                    if (conn.pending_id) {
                                                        // Pending record already exists — open picker directly
                                                        onSelectAccount?.(platform.id, conn.pending_id, domain);
                                                    } else {
                                                        // Token is in ad_platform_connections — fetch accounts via reselect
                                                        handleReselect(platform.id);
                                                    }
                                                }}
                                                disabled={isReselecting}
                                            >
                                                {isReselecting ? "Loading…" : "Select account"}
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
        </div>
    );
}
