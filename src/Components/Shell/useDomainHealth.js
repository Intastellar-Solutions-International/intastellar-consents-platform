import punycode from "punycode";
import API from "../../API/api";
import { fetchJsonWithTimeout } from "../../Functions/fetchWithTimeout.js";
import { parseConsentTimestamp } from "../../Functions/consentTimestamp.js";
import { isCombinedOrClearDomain } from "../../Functions/domainPathSegments.js";
import { t } from "../../i18n/index.js";

const { useState, useEffect } = React;
const HOUR = 3600e3, DAY = 24 * HOUR;

function ago(ms) {
    if (ms < HOUR) return t("{n} min ago", { n: Math.max(1, Math.round(ms / 60000)) });
    if (ms < DAY) return t("{n} h ago", { n: Math.round(ms / HOUR) });
    return t("{n} days ago", { n: Math.round(ms / DAY) });
}

/**
 * Health checks for the top-bar pill, from data the dashboard already loads
 * elsewhere (read-only; no new endpoints):
 *   Logging   — newest audit-log record: ok ≤ 24 h, warning ≤ 7 days, else error
 *   Last scan — latest completed cookie scan: ok ≤ 14 days (Home's stale threshold), else warning
 * A check whose request fails is "unknown", never a guess.
 */
export function buildHealthChecks({ lastConsentAt, lastScanAt, consentFailed, scanFailed, now = Date.now() }) {
    const checks = [];
    if (consentFailed) checks.push({ label: t("Logging"), status: "unknown", detail: t("couldn't check") });
    else if (!lastConsentAt) checks.push({ label: t("Logging"), status: "error", detail: t("no consent recorded in 30 days") });
    else {
        const age = now - lastConsentAt.getTime();
        checks.push({ label: t("Logging"), status: age <= DAY ? "ok" : age <= 7 * DAY ? "warning" : "error", detail: t("last consent {ago}", { ago: ago(age) }) });
    }
    if (scanFailed) checks.push({ label: t("Last scan"), status: "unknown", detail: t("couldn't check") });
    else if (!lastScanAt) checks.push({ label: t("Last scan"), status: "warning", detail: t("not scanned yet") });
    else {
        const age = now - lastScanAt.getTime();
        checks.push({ label: t("Last scan"), status: age <= 14 * DAY ? "ok" : "warning", detail: ago(age) });
    }
    return checks;
}

export default function useDomainHealth(domain) {
    const [checks, setChecks] = useState(null);
    useEffect(() => {
        const platform = localStorage.getItem("platform") || "gdpr";
        const api = API[platform];
        if (!api?.getDomainsUrl || isCombinedOrClearDomain(domain)) { setChecks(null); return undefined; }
        const ac = new AbortController();
        let ascii = domain;
        try { ascii = punycode.toASCII(String(domain)); } catch { /* keep */ }
        const to = new Date(), from = new Date(Date.now() - 30 * DAY);
        const ymd = (d) => d.toISOString().split("T")[0];
        const consent = fetchJsonWithTimeout(api.getDomainsUrl.url, {
            method: api.getDomainsUrl.method,
            headers: { ...api.getDomainsUrl.headers, Domains: ascii, Offset: "0", Limit: "1", FromDate: ymd(from), ToDate: ymd(to), SortOrder: "desc" },
        }, { signal: ac.signal })
            .then((d) => ({ at: Array.isArray(d) ? parseConsentTimestamp(d[0]?.consents_timestamp) : null }))
            .catch((e) => (e.kind === "aborted" ? null : { failed: true }));
        const scan = api.getPreConsentTransfers
            ? fetch(`${api.getPreConsentTransfers.url}?domain=${encodeURIComponent(domain)}`, { headers: api.getPreConsentTransfers.headers, signal: ac.signal })
                .then((r) => r.json().catch(() => null))
                .then((d) => ({ at: d && d.scanned_at ? new Date(d.scanned_at) : null }))
                .catch((e) => (e.name === "AbortError" ? null : { failed: true }))
            : Promise.resolve({ failed: true });
        Promise.all([consent, scan]).then(([c, s]) => {
            if (ac.signal.aborted || !c || !s) return;
            setChecks(buildHealthChecks({ lastConsentAt: c.at, lastScanAt: s.at, consentFailed: c.failed, scanFailed: s.failed }));
        });
        return () => ac.abort();
    }, [domain]);
    return checks;
}
