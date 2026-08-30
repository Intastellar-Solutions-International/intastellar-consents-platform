import { useEffect } from "react";
import punycode from "punycode";

/** Domains that mean “all domains” / no specific host in the URL */
export function isCombinedOrClearDomain(domain) {
    if (domain == null || domain === "") return true;
    const s = String(domain).trim();
    return s === "combined view" || s === "Choose domain";
}

/**
 * Unicode domain label for consent/statistics APIs: URL :handle wins before context sync
 * (dashboard + reports).
 */
export function consentsDomainFromRoute(handle, contextDomain) {
    if (handle == null || handle === undefined) return contextDomain;
    const h = String(handle).trim();
    if (h === "") return contextDomain;
    if (h === "combined view") return "combined view";
    const decoded = decodeDomainPathSegment(handle);
    if (decoded == null || decoded === "combined view") return "combined view";
    return decoded;
}

/** HTTP `Domains` header value (ASCII punycode for real hosts). */
export function toDomainsApiHeader(domainLabel) {
    if (isCombinedOrClearDomain(domainLabel)) return "combined view";
    return punycode.toASCII(String(domainLabel).trim());
}

/**
 * Encode Unicode domain for a path segment (ASCII punycode + safe encoding).
 * Returns null when the selection should not appear in the URL.
 */
export function encodeDomainPathSegment(domain) {
    if (isCombinedOrClearDomain(domain)) return null;
    const ascii = punycode.toASCII(String(domain).trim());
    return encodeURIComponent(ascii).replace(/\./g, "%2E");
}

/** Decode :handle route param to Unicode domain label (or "combined view"). */
export function decodeDomainPathSegment(handleParam) {
    if (handleParam == null || handleParam === "") return null;
    const s = decodeURIComponent(String(handleParam).replace(/%2E/gi, "."));
    if (s === "combined view") return "combined view";
    return punycode.toUnicode(s);
}

/**
 * Extract raw :handle segment from pathname, or null.
 * Supports /:id/view/:handle, /:id/reports/view/:handle/..., and
 * /analytics/:handle(/marketing). Real domain segments always contain the
 * punycode-dot marker "%2E", so a bare reserved word like "marketing" in
 * the handle slot can never collide with an actual encoded domain.
 */
export function parseHandleFromPath(pathname) {
    const parts = String(pathname || "")
        .split("/")
        .filter(Boolean);
    if (parts.length >= 4 && parts[1] === "reports" && parts[2] === "view") {
        return parts[3];
    }
    if (parts.length >= 3 && parts[1] === "view") {
        return parts[2];
    }
    if (parts[0] === "analytics") {
        if (parts.length >= 3) return parts[1];
        if (parts.length === 2 && parts[1] !== "marketing") return parts[1];
        return null;
    }
    return null;
}

export function dashboardPath(platformId, domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return `/${platformId}/dashboard`;
    return `/${platformId}/view/${seg}`;
}

/** @param {string} leaf — "/user-consents" | "/audit-report" | "" */
export function reportsPath(platformId, domainUnicode, leaf) {
    const seg = encodeDomainPathSegment(domainUnicode);
    const suffix = leaf && leaf !== "/" ? (leaf.startsWith("/") ? leaf : `/${leaf}`) : "";
    if (!seg) {
        return `/${platformId}/reports${suffix}`;
    }
    return `/${platformId}/reports/view/${seg}${suffix}`;
}

export function getReportsUrlLeaf(pathname) {
    if (pathname.includes("/audit-report")) return "/audit-report";
    if (pathname.includes("/user-consents")) return "/user-consents";
    if (pathname.includes("/reconcile")) return "/reconcile";
    if (pathname.includes("/compliance")) return "/compliance";
    return "";
}

/** Site Analytics lives at its own top-level path, independent of platform id. */
export function analyticsPath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics";
    return `/analytics/${seg}`;
}

/** Channel Analytics (marketing/GA4) — part of the Analytics product, not the CMP. */
export function analyticsMarketingPath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/marketing";
    return `/analytics/${seg}/marketing`;
}

export function analyticsAudiencePath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/audience";
    return `/analytics/${seg}/audience`;
}

export function analyticsAcquisitionPath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/acquisition";
    return `/analytics/${seg}/acquisition`;
}

export function analyticsConsentPath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/consent";
    return `/analytics/${seg}/consent`;
}

export function analyticsHeatmapPath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/heatmap";
    return `/analytics/${seg}/heatmap`;
}

export function analyticsRecordingsPath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/recordings";
    return `/analytics/${seg}/recordings`;
}

export function analyticsBotsPath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/bots";
    return `/analytics/${seg}/bots`;
}

export function analyticsUserFlowPath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/user-flow";
    return `/analytics/${seg}/user-flow`;
}

/** section: omit (or "overview") for the base tab, or "deepdive" | "setup" for a specific one — see ConversionsOverview.js's SECTIONS. */
export function analyticsConversionsPath(domainUnicode, section) {
    const seg = encodeDomainPathSegment(domainUnicode);
    const suffix = section && section !== "overview" ? `/${section}` : "";
    if (!seg) return `/analytics/conversions${suffix}`;
    return `/analytics/${seg}/conversions${suffix}`;
}

export function analyticsAdSpendPath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/ad-spend";
    return `/analytics/${seg}/ad-spend`;
}

export function analyticsAttributionPath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/attribution";
    return `/analytics/${seg}/attribution`;
}

export function analyticsFormsPath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/forms";
    return `/analytics/${seg}/forms`;
}

export function analyticsPerformancePath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/performance";
    return `/analytics/${seg}/performance`;
}

export function analyticsPerformanceCountryPath(domainUnicode, countryCode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    const cc  = encodeURIComponent((countryCode || "").toUpperCase());
    if (!seg) return `/analytics/performance/country/${cc}`;
    return `/analytics/${seg}/performance/country/${cc}`;
}

export function analyticsSettingsPath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/settings";
    return `/analytics/${seg}/settings`;
}

export function analyticsGoogleAnalyticsPath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/google-analytics";
    return `/analytics/${seg}/google-analytics`;
}

export function analyticsSearchConsolePath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/search-console";
    return `/analytics/${seg}/search-console`;
}

export function analyticsPageExperimentsPath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/page-experiments";
    return `/analytics/${seg}/page-experiments`;
}

export function analyticsCohortPath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/cohorts";
    return `/analytics/${seg}/cohorts`;
}

export function analyticsAlertsPath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/alerts";
    return `/analytics/${seg}/alerts`;
}

export function analyticsReportsPath(domainUnicode) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return "/analytics/reports";
    return `/analytics/${seg}/reports`;
}

/** reportId omitted → "new" builder; provided → edit existing report. */
export function analyticsReportBuilderPath(domainUnicode, reportId) {
    const seg = encodeDomainPathSegment(domainUnicode);
    const suffix = reportId ? `/${reportId}` : "/new";
    if (!seg) return `/analytics/reports${suffix}`;
    return `/analytics/${seg}/reports${suffix}`;
}

/** Read-only view for a saved report. */
export function analyticsReportViewPath(domainUnicode, reportId) {
    const seg = encodeDomainPathSegment(domainUnicode);
    if (!seg) return `/analytics/reports/${reportId}/view`;
    return `/analytics/${seg}/reports/${reportId}/view`;
}

/** First arg is React Router v5 `useHistory()` (object with `.push(path)`). */
export function navigateWithDomain(history, platformId, domainUnicode, pathname) {
    if (String(pathname || "").indexOf("/analytics") === 0) {
        const leaf = ["/marketing", "/audience", "/acquisition", "/consent", "/heatmap", "/recordings", "/bots", "/user-flow", "/conversions", "/ad-spend", "/attribution", "/settings", "/google-analytics", "/search-console", "/page-experiments", "/cohorts", "/alerts", "/forms", "/performance"].find(s => pathname.includes(s));
        if (leaf === "/marketing")        history.push(analyticsMarketingPath(domainUnicode));
        else if (leaf === "/audience")    history.push(analyticsAudiencePath(domainUnicode));
        else if (leaf === "/acquisition") history.push(analyticsAcquisitionPath(domainUnicode));
        else if (leaf === "/consent")     history.push(analyticsConsentPath(domainUnicode));
        else if (leaf === "/heatmap")     history.push(analyticsHeatmapPath(domainUnicode));
        else if (leaf === "/recordings")  history.push(analyticsRecordingsPath(domainUnicode));
        else if (leaf === "/bots")        history.push(analyticsBotsPath(domainUnicode));
        else if (leaf === "/user-flow")   history.push(analyticsUserFlowPath(domainUnicode));
        else if (leaf === "/conversions") history.push(analyticsConversionsPath(domainUnicode));
        else if (leaf === "/ad-spend")    history.push(analyticsAdSpendPath(domainUnicode));
        else if (leaf === "/attribution") history.push(analyticsAttributionPath(domainUnicode));
        else if (leaf === "/settings")   history.push(analyticsSettingsPath(domainUnicode));
        else if (leaf === "/google-analytics") history.push(analyticsGoogleAnalyticsPath(domainUnicode));
        else if (leaf === "/search-console") history.push(analyticsSearchConsolePath(domainUnicode));
        else if (leaf === "/page-experiments") history.push(analyticsPageExperimentsPath(domainUnicode));
        else if (leaf === "/cohorts")     history.push(analyticsCohortPath(domainUnicode));
        else if (leaf === "/alerts")      history.push(analyticsAlertsPath(domainUnicode));
        else if (leaf === "/forms")       history.push(analyticsFormsPath(domainUnicode));
        else if (leaf === "/performance") history.push(analyticsPerformancePath(domainUnicode));
        else                              history.push(analyticsPath(domainUnicode));
        return;
    }
    const leaf = getReportsUrlLeaf(pathname);
    if (pathname.includes("/reports")) {
        history.push(reportsPath(platformId, domainUnicode, leaf));
        return;
    }
    history.push(dashboardPath(platformId, domainUnicode));
}

/** Which dashboard mode a pathname currently belongs to. */
export function detectDashboardMode(pathname) {
    return String(pathname || "").indexOf("/analytics") === 0 ? "analytics" : "cmp";
}

const ANALYTICS_SUBPATHS = ["/audience", "/acquisition", "/consent", "/marketing", "/heatmap", "/recordings", "/bots", "/user-flow", "/conversions", "/ad-spend", "/attribution", "/settings", "/google-analytics", "/search-console", "/page-experiments", "/cohorts", "/alerts", "/reports", "/forms", "/performance"];

/** True for the Analytics overview ("Reports snapshot") page itself, false for any sub-report under it. */
export function isAnalyticsOverviewPath(pathname) {
    const path = String(pathname || "");
    if (path.indexOf("/analytics") !== 0) return false;
    return !ANALYTICS_SUBPATHS.some(s => path.includes(s));
}

/**
 * Which analytics icon-rail "section" a pathname belongs to. Mirrors the
 * group dividers in SideNavLinks' analyticsLinks, so the rail's icon and the
 * secondary sidebar's expanded group always agree on where you are.
 */
export function analyticsRailSection(pathname) {
    const path = String(pathname || "");
    if (isAnalyticsOverviewPath(path)) return "overview";
    if (path.includes("/audience") || path.includes("/consent")) return "audience";
    if (path.includes("/acquisition") || path.includes("/marketing") || path.includes("/ad-spend") || path.includes("/google-analytics") || path.includes("/search-console")) return "acquisition";
    if (path.includes("/heatmap") || path.includes("/recordings") || path.includes("/bots") || path.includes("/user-flow") || path.includes("/performance")) return "behavior";
    if (path.includes("/conversions") || path.includes("/page-experiments")) return "conversions";
    if (path.includes("/cohorts") || path.includes("/alerts")) return "insights";
    if (path.includes("/reports")) return "reports";
    return null;
}

/** Path for a dashboard mode ("cmp" | "analytics") at the given domain. */
export function modePath(mode, platformId, domainUnicode) {
    if (mode === "analytics") {
        return analyticsPath(domainUnicode);
    }
    return dashboardPath(platformId, domainUnicode);
}

/** Keep DomainContext aligned with :handle on report + dashboard routes */
export function useSyncDomainFromRoute(handle, setCurrentDomain) {
    useEffect(() => {
        if (handle == null || handle === undefined) {
            setCurrentDomain("combined view");
            return;
        }
        if (String(handle) === "combined view") {
            setCurrentDomain("combined view");
            return;
        }
        const decoded = decodeDomainPathSegment(handle);
        if (decoded === "combined view" || decoded == null) {
            setCurrentDomain("combined view");
            return;
        }
        setCurrentDomain(decoded);
    }, [handle, setCurrentDomain]);
}
