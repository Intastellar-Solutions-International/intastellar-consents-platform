/**
 * Pre- and post-consent cookie counts, from one source per number so Home,
 * Compliance and the audit snapshot card always agree.
 *
 * - Pre-consent: the latest completed cookie scan (/api/pre-consent-transfers,
 *   `pre_consent_cookies`). Compliance used to read the banner's
 *   observed-cookies report here instead, and showed "—" while Home showed
 *   the scan's count. Despite its name that list also holds cookies set after
 *   the scanner accepted, so only those tagged "pre" count once a scan has tags.
 * - Post-consent: the banner's observed-cookies report (`consent.count`) — a
 *   scan only sees the page before consent, so it can't provide this one.
 *
 * Returns { count, label, reason, source } per stat: `count` is a number when
 * known (0 is a real answer, not "missing"); otherwise `count` is null and
 * `label` + `reason` say why there is no number.
 */
export function preConsentCookieStat(scan) {
    if (scan && !scan.error && scan.scanned_at && Array.isArray(scan.pre_consent_cookies)) {
        return {
            count: scan.consent_phase_known === true
                ? scan.pre_consent_cookies.filter((c) => c.consentPhase === "pre").length
                : scan.pre_consent_cookies.length,
            label: null,
            reason: null,
            source: "Cookie scan",
            scannedAt: scan.scanned_at,
        };
    }
    const attempt = scan?.latest_attempt;
    let reason = "No cookie scan has run for this domain yet. Run a scan to see them.";
    if (attempt?.status === "in_progress" || attempt?.status === "pending") {
        reason = "A cookie scan is running for this domain. Check back in a minute.";
    } else if (attempt?.status === "failed") {
        reason = "The last cookie scan couldn't load the site" + (attempt.error ? ` (${String(attempt.error).split("\n")[0].slice(0, 80)})` : "") + ".";
    } else if (scan == null) {
        reason = "Cookie scan results couldn't be loaded.";
    }
    return { count: null, label: "Not scanned", reason, source: "Cookie scan", scannedAt: null };
}

export function postConsentCookieStat(observed) {
    const count = observed?.consent?.count;
    if (typeof count === "number" && count > 0) {
        return { count, label: null, reason: null, source: "Reported by the banner on real visits" };
    }
    return {
        count: null,
        label: "Not observed yet",
        reason: "Cookies set after consent are reported by the banner from real visits. None have been reported for this period.",
        source: "Reported by the banner on real visits",
    };
}
