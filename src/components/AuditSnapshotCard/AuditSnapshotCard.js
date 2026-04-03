const { useState, useEffect, useMemo } = React;
import API from "../../API/api.js";
import { isJson } from "../../Functions/isJson.js";
import {
    reportsPath,
    consentsDomainFromRoute,
    toDomainsApiHeader,
} from "../../Functions/domainPathSegments.js";
import { getApproxLastInteractionIsoFromLiveData } from "../LiveView/liveInteractionTimestamp.js";
import "./AuditSnapshotCard.css";

const Link = window.ReactRouterDOM.Link;

const NECESSARY_TYPES = new Set(["necessary", "essential"]);

function parseConsentEntries(row) {
    let c = row?.consent;
    if (c == null) return null;
    if (typeof c === "string") {
        if (isJson(c)) {
            try {
                c = JSON.parse(c);
            } catch {
                return null;
            }
        } else {
            return null;
        }
    }
    if (Array.isArray(c)) return c;
    if (typeof c === "object" && (c.consent_type != null || c.type != null)) return [c];
    return null;
}

function consentChecked(v) {
    return v === "checked" || v === "1" || v === true || v === 1;
}

function auditRowChoiceSummary(row) {
    const reg = String(row?.regulation_applied ?? "").toUpperCase();
    const isCcpa = reg.includes("CCPA") || reg.includes("CPRA");
    const arr = parseConsentEntries(row);
    if (!arr || arr.length === 0) return "—";
    const first = arr[0];
    if (arr.length === 1 && first?.consent_type != null) {
        const accepted = consentChecked(first?.consent_value);
        if (isCcpa) return accepted ? "Opt-in all" : "Opt-out";
        return accepted ? "Accepted all" : "Essential only";
    }
    const optional = arr.filter((x) => !NECESSARY_TYPES.has(String(x?.type || "").toLowerCase()));
    if (optional.length === 0) return isCcpa ? "Opt-out" : "Essential only";
    const allOn = optional.every((x) => consentChecked(x?.checked));
    const allOff = optional.every((x) => !consentChecked(x?.checked));
    if (allOn) return isCcpa ? "Opt-in all" : "Accepted all";
    if (allOff) return isCcpa ? "Opt-out" : "Essential only";
    return "Mixed choices";
}

function shortenFramework(reg) {
    const u = String(reg || "").toUpperCase();
    if (u.includes("CCPA") || u.includes("CPRA")) return "CCPA";
    if (u.includes("GDPR")) return "GDPR";
    if (!reg || String(reg).trim() === "") return "—";
    return String(reg).length > 14 ? `${String(reg).slice(0, 12)}…` : String(reg);
}

function formatAuditRowClock(ts) {
    if (ts == null || ts === "") return "—";
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return "—";
    return d.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Copenhagen",
    });
}

function formatLastConsentAgo(ts) {
    if (ts == null || ts === "") return null;
    const d = new Date(ts);
    const ms = d.getTime();
    if (!Number.isFinite(ms)) return null;
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
 */
export default function AuditSnapshotCard(props) {
    const {
        platformId,
        handle,
        currentDomain,
        fromDate,
        toDate,
        activeData,
        demoMode,
        liveData,
    } = props;

    const auditLogPath = useMemo(() => {
        if (!platformId) return "/";
        return reportsPath(platformId, currentDomain, "/user-consents");
    }, [platformId, currentDomain]);

    const domainsApiHeaderForStats = useMemo(() => {
        const label = consentsDomainFromRoute(handle, currentDomain);
        return toDomainsApiHeader(label);
    }, [handle, currentDomain]);

    const [auditPreview, setAuditPreview] = useState([]);
    const [auditPreviewLoading, setAuditPreviewLoading] = useState(false);

    useEffect(() => {
        if (!platformId || !API[platformId]?.getDomainsUrl) return undefined;
        const ac = new AbortController();
        setAuditPreviewLoading(true);
        const fd = fromDate.toISOString().split("T")[0];
        const td = toDate.toISOString().split("T")[0];
        const hdrs = {
            ...API[platformId].getDomainsUrl.headers,
            Domains: domainsApiHeaderForStats,
            Offset: "0",
            Limit: "3",
            FromDate: fd,
            ToDate: td,
            SortOrder: "desc",
        };
        fetch(API[platformId].getDomainsUrl.url, {
            method: API[platformId].getDomainsUrl.method,
            headers: hdrs,
            signal: ac.signal,
        })
            .then((res) => res.json())
            .then((data) => {
                if (data === "Err_Login_Expired") {
                    localStorage.removeItem("globals");
                    window.location.href = "/login";
                    return;
                }
                if (!Array.isArray(data)) {
                    setAuditPreview([]);
                    return;
                }
                setAuditPreview(data);
            })
            .catch((err) => {
                if (err?.name !== "AbortError") setAuditPreview([]);
            })
            .finally(() => {
                if (!ac.signal.aborted) setAuditPreviewLoading(false);
            });
        return () => ac.abort();
    }, [platformId, fromDate, toDate, domainsApiHeaderForStats]);

    const auditSnapshotMeta = useMemo(() => {
        const rows = Array.isArray(auditPreview) ? auditPreview : [];
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
        let displayRows = rows.slice(0, 3).map((r) => ({
            key: String(r?.uid ?? r?.shopify_consent_id ?? `${r?.consents_timestamp}-${r?.country_code}`),
            country: String(r?.country_code ?? "—").toUpperCase(),
            framework: shortenFramework(r?.regulation_applied),
            summary: auditRowChoiceSummary(r),
            time: formatAuditRowClock(r?.consents_timestamp),
        }));
        const isDemoFeed = displayRows.length === 0 && demoMode;
        if (isDemoFeed) {
            displayRows = [
                { key: "demo-1", country: "DE", framework: "GDPR", summary: "Accepted all", time: "12:47" },
                { key: "demo-2", country: "DK", framework: "GDPR", summary: "Essential only", time: "11:36" },
                { key: "demo-3", country: "US", framework: "CCPA", summary: "Opt-out", time: "10:45" },
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
    }, [auditPreview, activeData, demoMode, liveData, auditPreviewLoading]);

    if (!platformId) return null;

    const lastRecordedTitle = (() => {
        const s = auditSnapshotMeta.lastConsentSuffix;
        if (s === "Live view (~30 min)") return "Estimated from Live view activity (last ~30 minutes).";
        if (s === "Audit log sample") return "From the newest row in the audit log sample for your date range.";
        if (s === "Example") return "Example data for demo mode.";
        return undefined;
    })();

    return (
        <Link
            className="audit-snapshot-card"
            to={auditLogPath}
            aria-label="Open audit log with individual consent records"
        >
            <div className="audit-snapshot-card__body">
                <div className="audit-snapshot-card__text">
                    <h3 className="audit-snapshot-card__title">Audit Snapshot</h3>
                    <p className="audit-snapshot-card__desc">
                        Jump to the audit log for per-user consent records, timestamps, and choices for the same domain
                        and filters you use here.
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
                            {auditSnapshotMeta.displayRows.map((row) => (
                                <li key={row.key} className="audit-snapshot-card__feed-row">
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
                                </li>
                            ))}
                        </ul>
                    ) : !auditPreviewLoading ? (
                        <p className="audit-snapshot-card__hint">No sample rows for this period yet.</p>
                    ) : null}
                    {activeData != null ? (
                        <dl className="audit-snapshot-card__stats">
                            {activeData.Total != null ? (
                                <div className="audit-snapshot-card__stat">
                                    <dt>Interactions (this period)</dt>
                                    <dd>{Number(activeData.Total).toLocaleString("de-DE")}</dd>
                                </div>
                            ) : null}
                            {activeData.Accepted != null ? (
                                <div className="audit-snapshot-card__stat">
                                    <dt>Acceptance rate</dt>
                                    <dd>{Number(activeData.Accepted).toLocaleString("de-DE")}%</dd>
                                </div>
                            ) : null}
                        </dl>
                    ) : (
                        <p className="audit-snapshot-card__hint">
                            Metrics load as soon as the dashboard finishes loading.
                        </p>
                    )}
                </div>
                <span className="audit-snapshot-card__cta">Open audit log</span>
            </div>
        </Link>
    );
}
