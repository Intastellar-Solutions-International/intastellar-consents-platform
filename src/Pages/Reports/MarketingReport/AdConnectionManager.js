const { useState, useEffect, useCallback } = React;

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

export default function AdConnectionManager({ domain, orgId, authToken, fromDate, toDate, onImport }) {
    const [connections, setConnections] = useState([]);
    const [loadingConnections, setLoadingConnections] = useState(false);
    const [importing, setImporting] = useState(null);
    const [connecting, setConnecting] = useState(null);
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
                `/api/ad-connections?domain=${encodeURIComponent(domain)}`,
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
        setConnecting(platformId);
        try {
            const returnPath = window.location.pathname;
            const resp = await fetch(
                `/api/ad-oauth-start?platform=${platformId}&domain=${encodeURIComponent(domain)}&returnPath=${encodeURIComponent(returnPath)}`,
                { headers: { Authorization: authToken, Organisation: String(orgId) } }
            );
            const data = await resp.json();
            if (data.missingConfig) {
                const label = AD_PLATFORMS.find(x => x.id === platformId)?.label || platformId;
                setStatus(`${label} OAuth credentials are not yet configured. Add the required environment variables in Vercel (e.g. GOOGLE_ADS_CLIENT_ID, OAUTH_REDIRECT_URI) to enable this connection.`, true);
                setConnecting(null);
                return;
            }
            if (!resp.ok) {
                setStatus(data.error || "Could not start connection.", true);
                setConnecting(null);
                return;
            }
            // Full-page redirect — the callback will bring the user back
            window.location.href = data.authUrl;
        } catch (err) {
            setStatus(err.message, true);
            setConnecting(null);
        }
    }

    async function handleDisconnect(platformId) {
        const label = AD_PLATFORMS.find(p => p.id === platformId)?.label || platformId;
        if (!window.confirm(`Disconnect ${label}?\nThis removes the connection from this domain. You can reconnect at any time.`)) return;
        try {
            await fetch(
                `/api/ad-connections?platform=${platformId}&domain=${encodeURIComponent(domain)}`,
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
                `/api/ad-data-fetch?platform=${platformId}&domain=${encodeURIComponent(domain)}&fromDate=${fromDate}&toDate=${toDate}`,
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
                        const isConnected = !!conn;
                        const isImporting = importing === platform.id;
                        const isConnecting = connecting === platform.id;

                        return (
                            <div
                                key={platform.id}
                                className={`ad-connection-card${isConnected ? " ad-connection-card--connected" : ""}`}
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
                                    {isConnected ? (
                                        <span className="ad-connection-card__meta">
                                            {conn.account_label || "Connected"}
                                            {conn.updated_at ? ` · synced ${formatDate(conn.updated_at)}` : ""}
                                        </span>
                                    ) : (
                                        <span className="ad-connection-card__meta ad-connection-card__meta--dim">
                                            Not connected
                                        </span>
                                    )}
                                </div>

                                <div className="ad-connection-card__actions">
                                    {isConnected ? (
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
