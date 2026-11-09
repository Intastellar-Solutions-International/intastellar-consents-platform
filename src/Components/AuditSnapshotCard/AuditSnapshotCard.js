const { useState, useEffect, useMemo } = React;
import API from "../../API/api.js";
import {
    reportsPath,
    consentsDomainFromRoute,
    toDomainsApiHeader,
} from "../../Functions/domainPathSegments.js";
import { getApproxLastInteractionIsoFromLiveData } from "../LiveView/liveInteractionTimestamp.js";
import { useUserLocale } from "../../Functions/userLocale.js";
import { deriveComplianceRegionStatus } from "./complianceRegions.js";
import AuditComplianceMiniMap from "./AuditComplianceMiniMap.js";
import "./AuditSnapshotCard.css";
import appStorage from '../../Functions/storage.js';
import { parseConsentTimestamp } from "../../Functions/consentTimestamp.js";
import { useExcludeBots } from "../../Functions/botFilter.js";
import { preConsentCookieStat, postConsentCookieStat } from "../../Functions/cookieStats.js";
import { Icon } from "../ui/icons.js";
import { auditRowChoiceSummary, auditRowChoices, consentIdOf, matchesConsentId, sortNewestFirst } from "./auditRows.js";

const Link = window.ReactRouterDOM.Link;
const useHistory = window.ReactRouterDOM.useHistory;
const DEFAULT_ROWS = 11;

function shortenFramework(reg) {
    const u = String(reg || "").toUpperCase();
    if (u.includes("CCPA") || u.includes("CPRA")) return "CCPA";
    if (u.includes("GDPR")) return "GDPR";
    if (!reg || String(reg).trim() === "") return "—";
    return String(reg).length > 14 ? `${String(reg).slice(0, 12)}…` : String(reg);
}

function formatAuditRowDateTime(ts, locale) {
    const d = parseConsentTimestamp(ts);
    if (!d) return "—";
    return d.toLocaleString(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Copenhagen",
    });
}

function formatLastConsentAgo(ts) {
    const d = parseConsentTimestamp(ts);
    if (!d) return null;
    const ms = d.getTime();
    const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (sec < 90) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 120) return `${min} minute${min === 1 ? "" : "s"} ago`;
    const hr = Math.floor(min / 60);
    if (hr < 48) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
    const days = Math.floor(hr / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatVersionTag(versionRaw) {
    if (versionRaw == null || String(versionRaw).trim() === "") return null;
    const s = String(versionRaw).trim();
    return /^v\d/i.test(s) ? s : `v${s}`;
}

function deriveSystemHealth({
    auditPhase,
    auditError,
    auditPreview,
    liveData,
    activeData,
    demoMode,
    interactionsLoading,
    auditPreviewLoading,
}) {
    if (demoMode) {
        return {
            level: "healthy",
            label: "Consent logging active",
            sub: "Demo mode — illustrative snapshot only.",
        };
    }
    if (auditPhase === "loading" || auditPreviewLoading) {
        return {
            level: "loading",
            label: "Checking status…",
            sub: "Contacting the audit log for this domain and date range.",
        };
    }
    if (auditPhase === "error") {
        return {
            level: "error",
            label: "Audit log unreachable",
            sub: auditError || "Network or server error. Open the audit log or retry shortly.",
        };
    }
    if (interactionsLoading) {
        return {
            level: "loading",
            label: "Consent logging active",
            sub: "Audit log OK — loading dashboard metrics for this period.",
        };
    }
    const liveN = Number(liveData?.count);
    const totalN = Number(activeData?.Total);
    const hasSamples = Array.isArray(auditPreview) && auditPreview.length > 0;
    const hasSignal =
        hasSamples ||
        (Number.isFinite(liveN) && liveN > 0) ||
        (Number.isFinite(totalN) && totalN > 0);
    if (hasSignal) {
        return {
            level: "healthy",
            label: "Consent logging active",
            sub: "Audit log responding; consent data is flowing for this selection.",
        };
    }
    return {
        level: "degraded",
        label: "Logging endpoint OK",
        sub: "No recent consents in this view (quiet period or narrow range). Verify the banner if this persists.",
    };
}

/**
 * @param {object} props
 * @param {string} props.platformId — route :id (e.g. gdpr)
 * @param {string} [props.handle]
 * @param {string} props.currentDomain — DomainContext
 * @param {Date} props.fromDate
 * @param {Date} props.toDate
 * @param {object|null} props.activeData — getInteractions payload
 * @param {boolean} props.demoMode
 * @param {object|null} props.liveData — payload from Live view (optional)
 * @param {boolean} [props.interactionsLoading] — dashboard getInteractions in flight
 * @param {Record<string, 'ok'|'watch'|'risk'>} [props.complianceRegionRisk] — optional API hints per framework (GDPR, LGPD, CCPA, POPIA)
 */
export default function AuditSnapshotCard(props) {
    const locale = useUserLocale();
    const {
        platformId,
        handle,
        currentDomain,
        fromDate,
        toDate,
        activeData,
        demoMode,
        liveData,
        interactionsLoading = false,
        complianceRegionRisk,
        observedCookies = null,
        preConsentScan = null,
    } = props;

    const auditLogPath = useMemo(() => {
        if (!platformId) return "/";
        return reportsPath(platformId, currentDomain, "/user-consents");
    }, [platformId, currentDomain]);

    const domainsApiHeaderForStats = useMemo(() => {
        const label = consentsDomainFromRoute(handle, currentDomain);
        return toDomainsApiHeader(label);
    }, [handle, currentDomain]);

    const history = useHistory();
    const [consentSearch, setConsentSearch] = useState("");
    const [auditPreview, setAuditPreview] = useState([]);
    const [excludeBots] = useExcludeBots();
    const [auditPreviewLoading, setAuditPreviewLoading] = useState(false);
    const [auditFetchState, setAuditFetchState] = useState({ phase: "loading", error: null });

    useEffect(() => {
        if (!platformId || !API[platformId]?.getDomainsUrl) {
            setAuditFetchState({ phase: "error", error: "Platform not configured" });
            return undefined;
        }
        let cancelled = false;
        const ac = new AbortController();
        setAuditPreviewLoading(true);
        setAuditFetchState({ phase: "loading", error: null });
        const fd = fromDate.toISOString().split("T")[0];
        const td = toDate.toISOString().split("T")[0];
        const hdrs = {
            ...API[platformId].getDomainsUrl.headers,
            Domains: domainsApiHeaderForStats,
            Offset: "0",
            Limit: "15",
            FromDate: fd,
            ToDate: td,
            SortOrder: "desc",
        };
        fetch(API[platformId].getDomainsUrl.url, {
            method: API[platformId].getDomainsUrl.method,
            headers: hdrs,
            signal: ac.signal,
        })
            .then(async (res) => {
                if (cancelled) return;
                let data;
                try {
                    data = await res.json();
                } catch {
                    if (!cancelled) {
                        setAuditPreview([]);
                        setAuditFetchState({ phase: "error", error: "Invalid response" });
                    }
                    return;
                }
                if (cancelled) return;
                if (data === "Err_Login_Expired") {
                    appStorage.removeItem("globals");
                    window.location.href = "/login";
                    return;
                }
                if (!res.ok) {
                    const msg =
                        typeof data?.error === "string"
                            ? data.error
                            : `Request failed (${res.status})`;
                    setAuditPreview([]);
                    setAuditFetchState({ phase: "error", error: msg });
                    return;
                }
                if (data != null && typeof data === "object" && data.error != null) {
                    setAuditPreview([]);
                    setAuditFetchState({
                        phase: "error",
                        error: String(data.error),
                    });
                    return;
                }
                if (data === "Err_No_Data_Found") {
                    setAuditPreview([]);
                    setAuditFetchState({ phase: "ok", error: null });
                    return;
                }
                if (!Array.isArray(data)) {
                    setAuditPreview([]);
                    setAuditFetchState({ phase: "error", error: "Unexpected audit log response" });
                    return;
                }
                setAuditPreview(data);
                setAuditFetchState({ phase: "ok", error: null });
            })
            .catch((err) => {
                if (cancelled || err?.name === "AbortError") return;
                setAuditPreview([]);
                setAuditFetchState({
                    phase: "error",
                    error: err?.message || "Network error",
                });
            })
            .finally(() => {
                if (!cancelled && !ac.signal.aborted) setAuditPreviewLoading(false);
            });
        return () => {
            cancelled = true;
            ac.abort();
        };
    }, [platformId, fromDate, toDate, domainsApiHeaderForStats, excludeBots]);

    const systemHealth = useMemo(
        () =>
            deriveSystemHealth({
                auditPhase: auditFetchState.phase,
                auditError: auditFetchState.error,
                auditPreview,
                liveData,
                activeData,
                demoMode,
                interactionsLoading,
                auditPreviewLoading,
            }),
        [
            auditFetchState.phase,
            auditFetchState.error,
            auditPreview,
            liveData,
            activeData,
            demoMode,
            interactionsLoading,
            auditPreviewLoading,
        ]
    );

    const auditSampleRowsForCompliance = useMemo(() => {
        const rows = Array.isArray(auditPreview) ? auditPreview : [];
        if (rows.length > 0) return rows;
        if (demoMode) {
            return [
                { country_code: "DE", regulation_applied: "GDPR" },
                { country_code: "DK", regulation_applied: "GDPR" },
                { country_code: "US", regulation_applied: "CCPA" },
            ];
        }
        return [];
    }, [auditPreview, demoMode]);

    const [complianceSnapshotRisk, setComplianceSnapshotRisk] = useState(null);
    const [complianceSnapshotIssues, setComplianceSnapshotIssues] = useState([]);

    useEffect(() => {
        if (demoMode || !platformId || !API[platformId]?.complianceSnapshot) {
            setComplianceSnapshotRisk(null);
            setComplianceSnapshotIssues([]);
            return undefined;
        }
        let cancelled = false;
        const ac = new AbortController();
        const fd = fromDate.toISOString().split("T")[0];
        const td = toDate.toISOString().split("T")[0];
        const hdrs = {
            ...API[platformId].complianceSnapshot.headers,
            Domains: domainsApiHeaderForStats,
            FromDate: fd,
            ToDate: td,
        };
        fetch(API[platformId].complianceSnapshot.url, {
            method: API[platformId].complianceSnapshot.method,
            headers: hdrs,
            signal: ac.signal,
        })
            .then((res) => {
                if (cancelled) return;
                let data;
                try {
                    data = res.json();
                } catch {
                    setComplianceSnapshotRisk(null);
                    setComplianceSnapshotIssues([]);
                    return;
                }
                if (data === "Err_Login_Expired") {
                    appStorage.removeItem("globals");
                    window.location.href = "/login";
                    return;
                }
                if (data?.ok) {
                    const cr = data.complianceRegionRisk;
                    setComplianceSnapshotRisk(
                        cr != null && typeof cr === "object" ? cr : {}
                    );
                    setComplianceSnapshotIssues(Array.isArray(data.issues) ? data.issues : []);
                } else {
                    setComplianceSnapshotRisk(null);
                    setComplianceSnapshotIssues([]);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setComplianceSnapshotRisk(null);
                    setComplianceSnapshotIssues([]);
                }
            });
        return () => {
            cancelled = true;
            ac.abort();
        };
    }, [platformId, domainsApiHeaderForStats, fromDate, toDate, demoMode]);

    const mergedComplianceRegionRisk = useMemo(
        () => ({
            ...(complianceSnapshotRisk || {}),
            ...(complianceRegionRisk || {}),
        }),
        [complianceSnapshotRisk, complianceRegionRisk]
    );

    const complianceRegionStatus = useMemo(
        () => deriveComplianceRegionStatus(auditSampleRowsForCompliance, mergedComplianceRegionRisk),
        [auditSampleRowsForCompliance, mergedComplianceRegionRisk]
    );

    const sampleCountryCodesForMap = useMemo(() => {
        const out = new Set();
        for (const row of auditSampleRowsForCompliance) {
            const cc = String(row?.country_code ?? "")
                .toUpperCase()
                .trim();
            if (cc && cc !== "—" && cc.length === 2) out.add(cc);
        }
        return Array.from(out).sort().join(",");
    }, [auditSampleRowsForCompliance]);

    const [mapDetailSelection, setMapDetailSelection] = useState(null);

    useEffect(() => {
        setMapDetailSelection(null);
    }, [domainsApiHeaderForStats, fromDate, toDate, platformId]);

    const selectedMapCountry =
        mapDetailSelection?.kind === "country" ? mapDetailSelection.code : null;

    const auditSnapshotMeta = useMemo(() => {
        const rows = sortNewestFirst(Array.isArray(auditPreview) ? auditPreview : [], parseConsentTimestamp);
        const liveIso = getApproxLastInteractionIsoFromLiveData(liveData);
        const auditTs =
            rows[0]?.consents_timestamp ??
            activeData?.lastConsentRecorded ??
            activeData?.last_consent_at ??
            activeData?.latestConsentAt;

        const livePhrase = formatLastConsentAgo(liveIso);
        const auditPhrase = formatLastConsentAgo(auditTs);

        let lastConsentPhrase = null;
        let lastConsentSuffix = null;
        if (livePhrase) {
            lastConsentPhrase = livePhrase;
            lastConsentSuffix = "Live view (~30 min)";
        } else if (auditPhrase) {
            lastConsentPhrase = auditPhrase;
            lastConsentSuffix = "Audit log sample";
        }

        const verRaw =
            rows.find((r) => r?.code_version)?.code_version ??
            activeData?.code_version ??
            activeData?.codeVersion;
        const matching = consentSearch.trim() ? rows.filter((r) => matchesConsentId(r, consentSearch)) : rows.slice(0, DEFAULT_ROWS);
        let displayRows = matching.map((r) => ({
            key: String(r?.uid ?? r?.shopify_consent_id ?? `${r?.consents_timestamp}-${r?.country_code}`),
            id: consentIdOf(r),
            country: String(r?.country_code ?? "—").toUpperCase(),
            framework: shortenFramework(r?.regulation_applied),
            summary: auditRowChoiceSummary(r),
            ...auditRowChoices(r),
            time: formatAuditRowDateTime(r?.consents_timestamp, locale),
        }));
        const isDemoFeed = displayRows.length === 0 && demoMode && !consentSearch.trim();
        if (isDemoFeed) {
            displayRows = [
                { key: "demo-1", id: "demo-100001", country: "DE", framework: "GDPR", summary: "Accepted all", accepted: ["Marketing", "Statistics", "Functional"], declined: [], time: "3 Nov 2026, 12:47" },
                { key: "demo-2", id: "demo-100002", country: "DK", framework: "GDPR", summary: "Essential only", accepted: [], declined: ["Marketing", "Statistics", "Functional"], time: "3 Nov 2026, 11:36" },
                { key: "demo-3", id: "demo-100003", country: "US", framework: "CCPA", summary: "Opt-out", accepted: [], declined: ["Marketing"], time: "3 Nov 2026, 10:45" },
            ];
        }
        if (!lastConsentPhrase && isDemoFeed) {
            lastConsentPhrase = formatLastConsentAgo(new Date(Date.now() - 14 * 60 * 1000).toISOString());
            lastConsentSuffix = "Example";
        }
        const versionTag = formatVersionTag(verRaw) ?? (isDemoFeed ? "v1.4.0" : null);

        const showLastLoading = auditPreviewLoading && !lastConsentPhrase;

        return {
            displayRows,
            lastConsentPhrase,
            lastConsentSuffix,
            versionTag,
            isDemoFeed,
            showLastLoading,
        };
    }, [auditPreview, activeData, demoMode, liveData, auditPreviewLoading, locale, consentSearch]);

    if (!platformId) return null;

    const lastRecordedTitle = (() => {
        const s = auditSnapshotMeta.lastConsentSuffix;
        if (s === "Live view (~30 min)") return "Estimated from Live view activity (last ~30 minutes).";
        if (s === "Audit log sample") return "From the newest row in the audit log sample for your date range.";
        if (s === "Example") return "Example data for demo mode.";
        return undefined;
    })();

    const fullLogSearchPath = `${auditLogPath}/${encodeURIComponent(consentSearch.trim())}`;
    const cardStatusClass = `audit-snapshot-card--health-${systemHealth.level}`;

    return (
        <section
            className={`audit-snapshot-card ${cardStatusClass}`}
            aria-label={`Audit log. System status: ${systemHealth.label}. ${systemHealth.sub}`}
        >
            <div className="audit-snapshot-card__body">
                <div className="audit-snapshot-card__text">
                    <div className="audit-snapshot-card__title-row">
                        <h3 className="audit-snapshot-card__title">Audit log</h3>
                        <div
                            className={`audit-snapshot-card__health-pill audit-snapshot-card__health-pill--${systemHealth.level}`}
                            title={systemHealth.sub}
                        >
                            <span className="audit-snapshot-card__health-dot" aria-hidden />
                            <span className="audit-snapshot-card__health-label">{systemHealth.label}</span>
                        </div>
                    </div>
                    <p className="audit-snapshot-card__health-sub" role="status">
                        {systemHealth.sub}
                    </p>
                    <div className="audit-snapshot-card__meta-lines">
                        <p className="audit-snapshot-card__meta-line">
                            <span className="audit-snapshot-card__meta-label">Last consent recorded</span>
                            <span className="audit-snapshot-card__meta-value" title={lastRecordedTitle}>
                                {auditSnapshotMeta.showLastLoading
                                    ? "…"
                                    : auditSnapshotMeta.lastConsentPhrase ?? "No recent consent in this period"}
                            </span>
                            {auditSnapshotMeta.lastConsentSuffix ? (
                                <span className="audit-snapshot-card__meta-suffix">
                                    {auditSnapshotMeta.lastConsentSuffix}
                                </span>
                            ) : null}
                        </p>
                        <p className="audit-snapshot-card__meta-line">
                            <span className="audit-snapshot-card__meta-label">Version tracking</span>
                            <span className="audit-snapshot-card__meta-value">
                                {auditSnapshotMeta.versionTag
                                    ? `Active (${auditSnapshotMeta.versionTag})`
                                    : "Active"}
                            </span>
                        </p>
                    </div>
                    <div className="audit-snapshot-card__feed-map-row">
                        <div className="audit-snapshot-card__feed-col">
                            <input
                                type="search"
                                className="audit-snapshot-card__search"
                                aria-label="Search by consent ID"
                                placeholder="Search by consent ID"
                                value={consentSearch}
                                onChange={(e) => setConsentSearch(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && consentSearch.trim()) history.push(fullLogSearchPath);
                                }}
                            />
                            {auditSnapshotMeta.displayRows.length > 0 ? (
                                <ul
                                    className={
                                        "audit-snapshot-card__feed" +
                                        (auditSnapshotMeta.isDemoFeed ? " audit-snapshot-card__feed--demo" : "")
                                    }
                                    aria-label="Recent consent examples"
                                >
                                    {auditSnapshotMeta.isDemoFeed ? (
                                        <li className="audit-snapshot-card__feed-note" aria-hidden>
                                            Example layout
                                        </li>
                                    ) : null}
                                    {auditSnapshotMeta.displayRows.map((row) => {
                                        const canPick =
                                            row.country &&
                                            row.country !== "—" &&
                                            String(row.country).length === 2;
                                        const isSel = canPick && selectedMapCountry === row.country;
                                        return (
                                        <li
                                            key={row.key}
                                            className={
                                                "audit-snapshot-card__feed-row" +
                                                (canPick ? " audit-snapshot-card__feed-row--interactive" : "") +
                                                (isSel ? " audit-snapshot-card__feed-row--map-selected" : "")
                                            }
                                            role={canPick ? "button" : undefined}
                                            tabIndex={canPick ? 0 : undefined}
                                            onClick={
                                                canPick
                                                    ? (e) => {
                                                          e.preventDefault();
                                                          e.stopPropagation();
                                                          setMapDetailSelection((prev) =>
                                                              prev?.kind === "country" && prev.code === row.country
                                                                  ? null
                                                                  : { kind: "country", code: row.country }
                                                          );
                                                      }
                                                    : undefined
                                            }
                                            onKeyDown={
                                                canPick
                                                    ? (e) => {
                                                          if (e.key !== "Enter" && e.key !== " ") return;
                                                          e.preventDefault();
                                                          e.stopPropagation();
                                                          setMapDetailSelection((prev) =>
                                                              prev?.kind === "country" && prev.code === row.country
                                                                  ? null
                                                                  : { kind: "country", code: row.country }
                                                          );
                                                      }
                                                    : undefined
                                            }
                                            aria-pressed={canPick ? isSel : undefined}
                                            title={
                                                canPick
                                                    ? "Show this country on the map (click again to clear)"
                                                    : undefined
                                            }
                                        >
                                            <span className="audit-snapshot-card__feed-country">{row.country}</span>
                                            <span className="audit-snapshot-card__feed-sep" aria-hidden>
                                                ·
                                            </span>
                                            <span className="audit-snapshot-card__feed-fw">{row.framework}</span>
                                            <span className="audit-snapshot-card__feed-sep" aria-hidden>
                                                ·
                                            </span>
                                            <span className="audit-snapshot-card__feed-summary">{row.summary}</span>
                                            <span className="audit-snapshot-card__feed-sep" aria-hidden>
                                                ·
                                            </span>
                                            <span className="audit-snapshot-card__feed-time">{row.time}</span>
                                            <span className="audit-snapshot-card__feed-detail">
                                                {row.id && <code className="audit-snapshot-card__feed-id">{row.id}</code>}
                                                {row.accepted.length > 0 && <span>Accepted: {row.accepted.join(", ")}</span>}
                                                {row.declined.length > 0 && <span>Declined: {row.declined.join(", ")}</span>}
                                            </span>
                                        </li>
                                        );
                                    })}
                                </ul>
                            ) : !auditPreviewLoading ? (
                                <p className="audit-snapshot-card__hint">{consentSearch.trim() ? "No consent with that ID in this sample." : "No sample rows for this period yet."}</p>
                            ) : (
                                <p className="audit-snapshot-card__hint" aria-hidden>
                                    …
                                </p>
                            )}
                            {consentSearch.trim() && <Link className="audit-snapshot-card__full-search" to={fullLogSearchPath}>Search the full audit log for this ID</Link>}
                        </div>
                        <div className="audit-snapshot-card__map-col">
                            <AuditComplianceMiniMap
                                regionStatus={complianceRegionStatus}
                                loading={auditPreviewLoading}
                                demoMode={demoMode && auditSnapshotMeta.isDemoFeed}
                                sampleCountryCodesKey={sampleCountryCodesForMap}
                                selectedCountryCode={selectedMapCountry}
                                mapDetailSelection={mapDetailSelection}
                                complianceIssues={complianceSnapshotIssues}
                                locale={locale}
                                onCloseMapDetail={() => setMapDetailSelection(null)}
                                onSelectCountry={(updater) => {
                                    setMapDetailSelection((prev) => {
                                        const prevCode =
                                            prev?.kind === "country" ? prev.code : null;
                                        const next =
                                            typeof updater === "function"
                                                ? updater(prevCode)
                                                : updater;
                                        if (next == null) return null;
                                        return { kind: "country", code: next };
                                    });
                                }}
                                onSelectFramework={(fw) => {
                                    setMapDetailSelection((prev) =>
                                        prev?.kind === "framework" && prev.fw === fw
                                            ? null
                                            : { kind: "framework", fw }
                                    );
                                }}
                            />
                        </div>
                    </div>
                    {(activeData != null || observedCookies != null) ? (
                        <dl className="audit-snapshot-card__stats">
                            {activeData?.Total != null ? (
                                <div className="audit-snapshot-card__stat">
                                    <dt>Interactions</dt>
                                    <dd>{Number(activeData.Total).toLocaleString(locale)}</dd>
                                </div>
                            ) : null}
                            {activeData?.Accepted != null ? (
                                <div className="audit-snapshot-card__stat">
                                    <dt>Acceptance rate</dt>
                                    <dd>{Number(activeData.Accepted).toLocaleString(locale)}%</dd>
                                </div>
                            ) : null}
                            {(() => {
                                // Same sources as Home and the Compliance header — see cookieStats.js.
                                const pre = preConsentCookieStat(preConsentScan);
                                const post = postConsentCookieStat(observedCookies);
                                return (
                                    <>
                                        <div className="audit-snapshot-card__stat">
                                            <dt>Pre-consent cookies</dt>
                                            {pre.count != null ? <dd>{pre.count.toLocaleString(locale)}</dd> : <dd className="audit-snapshot-card__stat-nodata" title={pre.reason}><Icon name="info" size={14} />{pre.label}</dd>}
                                        </div>
                                        <div className="audit-snapshot-card__stat">
                                            <dt>Post-consent cookies</dt>
                                            {post.count != null ? <dd>{post.count.toLocaleString(locale)}</dd> : <dd className="audit-snapshot-card__stat-nodata" title={post.reason}><Icon name="info" size={14} />{post.label}</dd>}
                                        </div>
                                    </>
                                );
                            })()}
                        </dl>
                    ) : null}
                    <div className="audit-snapshot-card__cta-wrap">
                        <Link className="audit-snapshot-card__cta" to={auditLogPath}>Open audit log</Link>
                    </div>
                </div>
            </div>
        </section>
    );
}
