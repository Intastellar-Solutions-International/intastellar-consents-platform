/**
 * Canonical form of a domain for everything keyed on it by the cookie banner:
 * pre_consent_scans rows, cookie_overrides rows, and the public
 * /api/cookie-banner + /api/cookie-banner-scan lookups.
 *
 * These must all agree — an override saved as "www.example.com" was
 * previously never applied, because the banner endpoints strip "www." and
 * looked up "example.com". Accepts a bare domain or a URL.
 */
export function normalizeBannerDomain(raw) {
    return String(raw || "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .split(/[/?#]/)[0]
        .replace(/:\d+$/, "")      // port
        .replace(/\.+$/, "")       // trailing dot(s) — "example.com." is the same host
        .replace(/^www\./, "");
}

/**
 * Whether a request's Origin/Referer host may act for `domain`: the domain
 * itself, one of its subdomains, or a parent of it. Compares whole labels —
 * the previous "last two labels" check treated every *.co.uk site as the
 * same site.
 */
export function originMatchesDomain(originOrReferer, domain) {
    const host = normalizeBannerDomain(originOrReferer);
    if (!host || !domain) return false;
    return host === domain || host.endsWith("." + domain) || domain.endsWith("." + host);
}
