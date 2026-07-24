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
 * Supports /:id/view/:handle and /:id/reports/view/:handle/...
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
    if (pathname.includes("/marketing")) return "/marketing";
    if (pathname.includes("/compliance")) return "/compliance";
    return "";
}

/** First arg is React Router v5 `useHistory()` (object with `.push(path)`). */
export function navigateWithDomain(history, platformId, domainUnicode, pathname) {
    const leaf = getReportsUrlLeaf(pathname);
    if (pathname.includes("/reports")) {
        history.push(reportsPath(platformId, domainUnicode, leaf));
        return;
    }
    history.push(dashboardPath(platformId, domainUnicode));
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
