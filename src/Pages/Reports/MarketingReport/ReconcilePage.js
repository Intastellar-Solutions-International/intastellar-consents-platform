const { useState, useEffect, useMemo, useContext, useCallback } = React;
import SideNav from "../../../Components/Header/SideNav";
import StickyPageTitle from "../../../Components/Header/Sticky";
import { reportsLinks } from "../Reports";
import { DomainContext } from "../../../App.js";
import API from "../../../API/api";
import { ScannerHost } from "../../../API/host";
import Authentication from "../../../Authentication/Auth";
import "../../Dashboard/Style.css";
import "./MarketingReport.css";
import {
    useSyncDomainFromRoute,
    consentsDomainFromRoute,
    toDomainsApiHeader,
    reportsPath,
    isCombinedOrClearDomain,
} from "../../../Functions/domainPathSegments.js";
import MarketingReconciliationPanel from "./MarketingReconciliationPanel.js";
import appStorage from "../../../Functions/storage.js";

const useParams = window.ReactRouterDOM.useParams;

/* ─── AccountPickerModal ─────────────────────────────────────────────────── */

function AccountPickerModal({ pendingId, platform, authToken, orgId, onDone, onError }) {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState(null);

    useEffect(() => {
        fetch(`${ScannerHost}/api/ad-connection-pending?id=${encodeURIComponent(pendingId)}`, {
            headers: { Authorization: authToken, Organisation: String(orgId) },
        })
            .then(r => r.json())
            .then(data => {
                if (data.error) { setErr(data.error); }
                else { setAccounts(data.accounts || []); }
            })
            .catch(e => setErr(e.message))
            .finally(() => setLoading(false));
    }, [pendingId, authToken, orgId]);

    async function selectAccount(acc) {
        setSaving(true);
        try {
            const resp = await fetch(`${ScannerHost}/api/ad-connection-pending?id=${encodeURIComponent(pendingId)}`, {
                method: "POST",
                headers: { Authorization: authToken, Organisation: String(orgId), "Content-Type": "application/json" },
                body: JSON.stringify({ accountId: acc.id, accountLabel: acc.name }),
            });
            const data = await resp.json();
            if (!resp.ok || data.error) { setErr(data.error || "Failed to save connection"); setSaving(false); }
            else { onDone(platform, acc.name); }
        } catch (e) { setErr(e.message); setSaving(false); }
    }

    const PLATFORM_LABELS = {
        google_ads: "Google Ads", meta_ads: "Meta", linkedin_ads: "LinkedIn",
        microsoft_ads: "Microsoft Ads", tiktok_ads: "TikTok",
    };

    return (
        <div className="acct-picker-backdrop">
            <div className="acct-picker-modal" role="dialog" aria-modal="true" aria-label="Select ad account">
                <div className="acct-picker-modal__header">
                    <div>
                        <h2 className="acct-picker-modal__title">Select {PLATFORM_LABELS[platform] || platform} account</h2>
                        <p className="acct-picker-modal__sub">Choose the account you want to connect to this domain.</p>
                    </div>
                </div>

                {loading && <p className="acct-picker-modal__loading">Loading accounts…</p>}
                {err && <p className="acct-picker-modal__error">{err}</p>}

                {!loading && !err && accounts.length === 0 && (
                    <p className="acct-picker-modal__empty">No accessible accounts found. Make sure your Google account has access to at least one ad account.</p>
                )}

                {!loading && accounts.length > 0 && (
                    <ul className="acct-picker-list">
                        {accounts.map(acc => (
                            <li key={acc.id}>
                                <button
                                    className="acct-picker-item"
                                    onClick={() => selectAccount(acc)}
                                    disabled={saving}
                                >
                                    <div className="acct-picker-item__name">{acc.name}</div>
                                    <div className="acct-picker-item__meta">
                                        {acc.id}{acc.currency ? ` · ${acc.currency}` : ""}
                                        {acc.loginCustomerId ? ` · via ${acc.loginCustomerId}` : ""}
                                    </div>
                                    <svg className="acct-picker-item__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <button className="acct-picker-modal__cancel" onClick={() => onError("cancelled")}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

/* ─── OAuthBanner ────────────────────────────────────────────────────────── */

function OAuthBanner({ type, message, platform, onDismiss }) {
    const PLATFORM_LABELS = {
        google_ads: "Google Ads", meta_ads: "Meta", linkedin_ads: "LinkedIn",
        microsoft_ads: "Microsoft Ads", tiktok_ads: "TikTok", pinterest_ads: "Pinterest",
    };
    const label = PLATFORM_LABELS[platform] || platform || "Ad platform";

    return (
        <div className={`oauth-banner oauth-banner--${type}`} role="status">
            <span className="oauth-banner__msg">
                {type === "success"
                    ? `${label} connected successfully. Auto-import is now enabled.`
                    : `Connection failed: ${message || "unknown error"}`}
            </span>
            <button className="oauth-banner__close" onClick={onDismiss} aria-label="Dismiss">×</button>
        </div>
    );
}

function toYmd(d) {
    if (!d) return "";
    try {
        if (typeof d === "string") return d.split("T")[0];
        return d.toISOString().split("T")[0];
    } catch {
        return "";
    }
}

/**
 * Normalise a raw API row so the reconciliation panel always gets
 * camelCase field names (utmSource, utmMedium, acceptAll …) regardless
 * of whether the backend returns snake_case or camelCase.
 */
function mapRow(r) {
    return {
        ...r,
        utmSource:  String(r.utm_source  ?? r.utmSource  ?? r.source ?? "—"),
        utmMedium:  String(r.utm_medium  ?? r.utmMedium  ?? r.medium ?? "—"),
        consents:   Number(r.consents    ?? r.consent_count ?? r.count ?? 0) || 0,
        acceptAll:  Number(r.acceptAll   ?? r.accept_all ?? 0) || 0,
        channel:    r.channel ?? r.utm_channel ?? "",
    };
}

function extractRows(payload) {
    if (payload == null) return [];
    const root = payload.data != null ? payload.data : payload;
    if (Array.isArray(root)) return root.map(mapRow);
    if (Array.isArray(root.rows)) return root.rows.map(mapRow);
    if (Array.isArray(root.campaigns)) return root.campaigns.map(mapRow);
    if (Array.isArray(root.items)) return root.items.map(mapRow);
    if (Array.isArray(root.attribution)) return root.attribution.map(mapRow);
    return [];
}

function extractSummary(payload) {
    if (payload == null) return null;
    const root = payload.data != null ? payload.data : payload;
    if (root && typeof root === "object" && root.summary) return root.summary;
    if (root && typeof root === "object" && root.totals) return root.totals;
    return null;
}

function pickFromSummaryOrRows(summary, rows, summaryField, rowField) {
    const v = summary?.[summaryField] != null ? Number(summary[summaryField]) : NaN;
    if (Number.isFinite(v) && v >= 0) return v;
    return rows.reduce((s, r) => s + (Number(r[rowField]) || 0), 0);
}

export default function ReconcilePage() {
    document.title = "Ad Reconciliation | Reports | Intastellar Consents";
    const [currentDomain, setGlobalDomain] = useContext(DomainContext);
    const { id, handle } = useParams();
    useSyncDomainFromRoute(handle, setGlobalDomain);

    // ── OAuth return handling ─────────────────────────────────────────────
    const oauthParams = useMemo(() => new URLSearchParams(window.location.search), []);
    const [oauthBanner, setOauthBanner] = useState(() => {
        const success = oauthParams.get("oauth_success");
        const error   = oauthParams.get("oauth_error");
        const plat    = oauthParams.get("platform");
        if (success) return { type: "success", platform: success || plat };
        if (error)   return { type: "error",   platform: plat, message: error };
        return null;
    });
    const [accountPicker, setAccountPicker] = useState(() => {
        const pending = oauthParams.get("select_account");
        const plat    = oauthParams.get("platform");
        return pending ? { pendingId: pending, platform: plat } : null;
    });

    // Clean OAuth params from URL immediately so refresh doesn't re-trigger
    useEffect(() => {
        const dirty = ["oauth_success", "oauth_error", "select_account", "platform", "oauth_domain"]
            .some(k => oauthParams.has(k));
        if (!dirty) return;
        const clean = new URL(window.location.href);
        ["oauth_success", "oauth_error", "select_account", "platform", "oauth_domain"]
            .forEach(k => clean.searchParams.delete(k));
        window.history.replaceState({}, "", clean.toString());
    }, []);

    // Auto-dismiss success banner after 6 s
    useEffect(() => {
        if (oauthBanner?.type !== "success") return;
        const t = setTimeout(() => setOauthBanner(null), 6000);
        return () => clearTimeout(t);
    }, [oauthBanner]);

    const settings = (() => {
        try { return JSON.parse(localStorage.getItem("settings")) || { dateRange: 30 }; }
        catch { return { dateRange: 30 }; }
    })();

    const today = new Date();
    const initialLastDays = settings?.dateRange ?? 30;
    const [getLastDays, setLastDays] = useState(initialLastDays);
    const [fromDate, setFromDate] = useState(
        new Date(new Date().setDate(today.getDate() - initialLastDays))
    );
    const [toDate, setToDate] = useState(new Date(new Date().setDate(today.getDate() - 1)));
    const [, setActiveData] = useState(null);
    const [selectedChannel, setSelectedChannel] = useState(null);

    const listDomainLabel = useMemo(
        () => consentsDomainFromRoute(handle, currentDomain),
        [handle, currentDomain]
    );
    const domainsApiHeader = useMemo(
        () => toDomainsApiHeader(listDomainLabel),
        [listDomainLabel]
    );

    const [rows, setRows] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const endpoint = API[id]?.marketingAttribution;

    const fetchData = useCallback(async () => {
        if (!endpoint?.url) {
            setError("Marketing attribution is not configured for this platform.");
            setRows([]);
            setSummary(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const headers = {
                ...endpoint.headers,
                Domains: domainsApiHeader,
                FromDate: toYmd(fromDate),
                ToDate: toYmd(toDate),
                CompareRange: "",
                PreviousPeriod: "",
                PreviousPeriod2: "",
                "X-Compare-Start": "",
                "X-Compare-End": "",
                "X-Compare-Range": "",
            };
            const res = await fetch(endpoint.url, { method: endpoint.method || "GET", headers });
            const text = await res.text();
            let json = null;
            try { json = text ? JSON.parse(text) : null; } catch {
                setError("The server returned a non-JSON response.");
                setLoading(false);
                return;
            }
            if (json === "Err_Login_Expired") {
                appStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            if (!res.ok) {
                setError(json?.message || `Request failed (${res.status}).`);
                setLoading(false);
                return;
            }
            setRows(extractRows(json));
            setSummary(extractSummary(json));
        } catch (err) {
            setError(err.message || "Network error.");
        } finally {
            setLoading(false);
        }
    }, [endpoint, domainsApiHeader, fromDate, toDate]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const channels = useMemo(
        () => [...new Set(rows.map(r => r.channel).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
        [rows]
    );

    useEffect(() => {
        if (selectedChannel && channels.length > 0 && !channels.includes(selectedChannel)) {
            setSelectedChannel(null);
        }
    }, [channels, selectedChannel]);

    const drilldownRows = useMemo(
        () => selectedChannel ? rows.filter(r => r.channel === selectedChannel) : [],
        [rows, selectedChannel]
    );

    const totalConsents = useMemo(
        () => pickFromSummaryOrRows(summary, rows, "totalConsents", "consents"),
        [summary, rows]
    );
    const measurementReadyCount = useMemo(
        () => selectedChannel
            ? drilldownRows.reduce((s, r) => s + (Number(r.acceptAll) || 0), 0)
            : pickFromSummaryOrRows(summary, rows, "measurementReadyConsents", "acceptAll"),
        [selectedChannel, drilldownRows, summary, rows]
    );
    const visibilityScopeTotal = selectedChannel
        ? drilldownRows.reduce((s, r) => s + (Number(r.consents) || 0), 0)
        : totalConsents;
    const invisibleConsents = Math.max(0, visibilityScopeTotal - measurementReadyCount);

    const channelAnalyticsPath = reportsPath(id, listDomainLabel, "/marketing");

    // Domain gate — reconciliation must be scoped to a specific domain
    const noDomain = isCombinedOrClearDomain(listDomainLabel);

    return (
        <>
            <SideNav links={reportsLinks} title="Reports" />
            <div style={{ flex: "1" }}>
                <StickyPageTitle
                    loadingUpdated={loading}
                    finalLoaded={loading}
                    title="Ad Reconciliation"
                    numberofDays={setLastDays}
                    getLastDays={getLastDays}
                    setActiveData={setActiveData}
                    fromDate={fromDate}
                    toDate={toDate}
                    setFromDate={setFromDate}
                    setToDate={setToDate}
                />
                <div className="dashboard-content recon-page">

                    {/* ── OAuth result banner ───────────────────────────────── */}
                    {oauthBanner && (
                        <OAuthBanner
                            type={oauthBanner.type}
                            platform={oauthBanner.platform}
                            message={oauthBanner.message}
                            onDismiss={() => setOauthBanner(null)}
                        />
                    )}

                    {/* ── Account picker (multiple accounts returned by OAuth) ── */}
                    {accountPicker && (
                        <AccountPickerModal
                            pendingId={accountPicker.pendingId}
                            platform={accountPicker.platform}
                            authToken={Authentication.getToken()}
                            orgId={Authentication.getOrganisation()}
                            onDone={(platform, accountLabel) => {
                                setAccountPicker(null);
                                setOauthBanner({ type: "success", platform });
                            }}
                            onError={(msg) => {
                                setAccountPicker(null);
                                if (msg !== "cancelled") setOauthBanner({ type: "error", message: msg });
                            }}
                        />
                    )}

                    {/* ── Dashboard page header ─────────────────────────────── */}
                    <div className="recon-page-header">
                        <div className="recon-page-header__left">
                            <h1 className="recon-page-header__title">Ad Reconciliation</h1>
                            {!noDomain && listDomainLabel && (
                                <span className="recon-page-header__domain">{listDomainLabel}</span>
                            )}
                        </div>
                        <div className="recon-page-header__right">
                            {!noDomain && channels.length > 1 && (
                                <label className="recon-page-header__channel">
                                    <span>Channel</span>
                                    <select
                                        value={selectedChannel || ""}
                                        onChange={e => setSelectedChannel(e.target.value || null)}
                                        className="marketing-reconciliation__select"
                                    >
                                        <option value="">All channels</option>
                                        {channels.map(ch => (
                                            <option key={ch} value={ch}>{ch}</option>
                                        ))}
                                    </select>
                                </label>
                            )}
                            <a href={channelAnalyticsPath} className="recon-page-header__back">
                                ← Channel Analytics
                            </a>
                        </div>
                    </div>

                    {noDomain ? (
                        <div className="reconcile-domain-gate">
                            <div className="reconcile-domain-gate__icon" aria-hidden="true">⬆</div>
                            <h2 className="reconcile-domain-gate__heading">Select a domain first</h2>
                            <p className="reconcile-domain-gate__body">
                                Ad Reconciliation is domain-specific. Select a domain from the
                                dropdown in the page header to continue.
                            </p>
                        </div>
                    ) : error ? (
                        <p className="marketing-report-error">{error}</p>
                    ) : loading ? (
                        <p className="marketing-report-loading">Loading…</p>
                    ) : rows.length === 0 ? (
                        <p className="marketing-report-empty">
                            No marketing attribution data found for this period and domain.
                        </p>
                    ) : (
                        <MarketingReconciliationPanel
                            scopeLabel={selectedChannel || "all channels"}
                            scopeKey={selectedChannel ? `channel:${selectedChannel}` : "overview"}
                            domainKey={listDomainLabel}
                            consents={visibilityScopeTotal}
                            visibleConsents={measurementReadyCount}
                            invisibleConsents={invisibleConsents}
                            scopeRows={selectedChannel ? drilldownRows : rows}
                            fromDate={toYmd(fromDate)}
                            toDate={toYmd(toDate)}
                            orgId={Authentication.getOrganisation()}
                            authToken={Authentication.getToken()}
                        />
                    )}
                </div>
            </div>
        </>
    );
}
