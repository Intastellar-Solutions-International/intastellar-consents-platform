// Each product shows the other's key number for the same domain and period,
// so they read as one system (and the two different consent rates explain
// each other). Failures stay quiet — the bridge card just doesn't render;
// the page's own data is the main content.
import API from "../API/api";
import Authentication from "../Authentication/Auth";
import { ScannerHost } from "../API/host.js";
import { fetchJsonWithTimeout } from "./fetchWithTimeout.js";
import { useExcludeBots } from "./botFilter.js";

const { useState, useEffect } = React;

/** CMP: banner acceptance for one domain — { rate, decisions } | null while loading/unavailable. */
export function useCmpAcceptance(platform, domain, fromIso, toIso) {
    const [result, setResult] = useState(null);
    const [excludeBots] = useExcludeBots();
    useEffect(() => {
        const api = API[platform]?.getInteractions;
        if (!api || !domain || !fromIso || !toIso) { setResult(null); return undefined; }
        const ac = new AbortController();
        setResult(null);
        fetchJsonWithTimeout(api.url, {
            method: api.method,
            // Spread evaluates the ExcludeBots getter → the current preference.
            headers: { ...api.headers, Domains: domain, FromDate: fromIso, ToDate: toIso },
            body: JSON.stringify({ workspaceId: null }),
        }, { signal: ac.signal })
            .then((d) => {
                const decisions = Number(d?.Total) || 0;
                setResult(decisions > 0 ? { rate: Number(d.Accepted), decisions } : { rate: null, decisions: 0 });
            })
            .catch(() => { /* bridge stays hidden */ });
        return () => ac.abort();
    }, [platform, domain, fromIso, toIso, excludeBots]);
    return result;
}

/**
 * Analytics: headline numbers for one domain —
 * { noSite } | { activeUsers, events, statisticsConsent } | null while loading/unavailable.
 */
export function useAnalyticsSnapshot(domain, fromIso, toIso) {
    const [result, setResult] = useState(null);
    useEffect(() => {
        if (!domain || !fromIso || !toIso) { setResult(null); return undefined; }
        const ac = new AbortController();
        setResult(null);
        const qs = new URLSearchParams({ domain: domain.toLowerCase(), from: fromIso, to: toIso }).toString();
        fetchJsonWithTimeout(`${ScannerHost}/api/analytics-report?${qs}`, {
            headers: { Authorization: Authentication.getToken(), Organisation: String(Authentication.getOrganisation() ?? "") },
        }, { signal: ac.signal })
            .then((d) => {
                if (d?.noSiteKey) { setResult({ noSite: true }); return; }
                if (!d?.totals) return;
                setResult({
                    activeUsers: d.totals.engagedUsers ?? null,
                    events: d.totals.total ?? null,
                    statisticsConsent: d.totals.consentRate ?? null,
                });
            })
            .catch(() => { /* bridge stays hidden */ });
        return () => ac.abort();
    }, [domain, fromIso, toIso]);
    return result;
}
