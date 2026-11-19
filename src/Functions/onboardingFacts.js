// Facts for the shared Getting started checklist (onboardingSteps.js), from
// both products. Every source loads in parallel; one that fails counts as
// "not done yet" instead of breaking the page — the checklist is guidance,
// and each step's own page shows the real error.
import API from "../API/api";
import Authentication from "../Authentication/Auth";
import { ScannerHost } from "../API/host.js";
import { readCachedDomains } from "./cachedDomains.js";
import { isDomainVerified } from "./domainVerification.js";
import { loadAuditReportIndex } from "./auditReportsStorage";
import { fetchJsonWithTimeout } from "./fetchWithTimeout.js";

const { useState, useEffect, useCallback, useMemo } = React;

const RECORDS_LOOKBACK_DAYS = 365;
const ymd = (d) => d.toISOString().split("T")[0];
// Ad Spend platforms — GA4/Search Console connections don't count as "an ad platform".
const AD_PLATFORMS = new Set(["google_ads", "meta_ads", "linkedin_ads", "microsoft_ads", "openai_ads"]);

async function countRecords(platform) {
    const api = API[platform].getInteractions;
    const data = await fetchJsonWithTimeout(api.url, {
        method: api.method,
        headers: { ...api.headers, Domains: "combined view", FromDate: ymd(new Date(Date.now() - RECORDS_LOOKBACK_DAYS * 86400000)), ToDate: ymd(new Date()) },
        body: JSON.stringify({ workspaceId: null }),
    });
    return Number(data?.Total) || 0;
}

async function countScans(platform, domains) {
    if (!domains.length) return 0;
    const api = API[platform].listPreConsentScans;
    const data = await fetchJsonWithTimeout(api.url, { method: api.method, headers: api.headers, body: JSON.stringify({ domains, pageSize: 1 }) });
    return Number(data?.total) || 0;
}

function scannerHeaders() {
    return { Authorization: Authentication.getToken(), Organisation: String(Authentication.getOrganisation() ?? ""), "Content-Type": "application/json" };
}

async function loadAnalyticsSites() {
    const data = await fetchJsonWithTimeout(`${ScannerHost}/api/analytics-site?list=1&withStatus=1`, { headers: scannerHeaders() });
    return Array.isArray(data?.sites) ? data.sites : [];
}

async function countAdConnections() {
    const data = await fetchJsonWithTimeout(`${ScannerHost}/api/ad-connections`, { headers: scannerHeaders() });
    return (data?.connections || []).filter((c) => AD_PLATFORMS.has(c.platform) && c.account_id).length;
}

/**
 * { facts, sites, loading, reload } — `sites` are the org's analytics sites
 * ({ domain, siteId, active, hasEvents, conversions }) so the page can build
 * per-domain install code. `platform` is the CMP platform id (e.g. "gdpr").
 */
export function useOnboardingFacts(platform) {
    const domains = useMemo(() => readCachedDomains(), []);
    const [state, setState] = useState({ loading: true, records: 0, scans: 0, sites: [], adConnections: 0 });
    const [tick, setTick] = useState(0);
    const reload = useCallback(() => setTick((t) => t + 1), []);

    useEffect(() => {
        let active = true;
        const settle = (p) => p.catch(() => null);
        Promise.all([
            platform ? settle(countRecords(platform)) : null,
            platform ? settle(countScans(platform, domains)) : null,
            settle(loadAnalyticsSites()),
            settle(countAdConnections()),
        ]).then(([records, scans, sites, adConnections]) => {
            if (!active) return;
            setState({ loading: false, records: records || 0, scans: scans || 0, sites: sites || [], adConnections: adConnections || 0 });
        });
        return () => { active = false; };
    }, [platform, domains, tick]);

    const orgId = Authentication.getOrganisation();
    const activeSites = state.sites.filter((s) => s.active !== false);
    const facts = {
        domains: domains.length,
        records: state.records,
        scans: state.scans,
        verified: domains.filter((d) => isDomainVerified(d, orgId)).length,
        reports: domains.reduce((n, d) => n + loadAuditReportIndex(orgId, d).length, 0),
        analyticsSites: activeSites.length,
        sitesWithEvents: activeSites.filter((s) => s.hasEvents).length,
        adConnections: state.adConnections,
        conversions: activeSites.reduce((n, s) => n + (s.conversions || 0), 0),
    };
    return { facts, domains, sites: state.sites, loading: state.loading, reload };
}
