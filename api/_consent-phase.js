/**
 * Consent phase of scan results. The scanner (api/_scan-core.js) tags each
 * transfer and cookie with consentPhase "pre" (seen before it granted
 * consent) or "post". Scans recorded before that tagging carry no phase, so
 * the split is only "known" when every item has one.
 */
const hasPhase = (x) => x?.consentPhase === "pre" || x?.consentPhase === "post";

/**
 * Whether the scanner's accept step shows in the results: "accepted" when
 * something appeared after it, "none" when everything is pre-consent (the
 * scanner found no Intastellar banner to accept), "unknown" for untagged scans.
 */
export function scanConsentStep(transfers = [], cookies = []) {
    const items = [...transfers, ...cookies];
    if (!items.length || !items.every(hasPhase)) return "unknown";
    return items.some((x) => x.consentPhase === "post") ? "accepted" : "none";
}

const FIRST_VISIT_MAX_GAP_MS = 14 * 86400000;

/** A first-visit scan only speaks for an accept-all scan made around the same time. */
export function firstVisitApplies(scannedAt, visit) {
    if (!visit) return false;
    return Math.abs(new Date(scannedAt).getTime() - new Date(visit.scanned_at).getTime()) <= FIRST_VISIT_MAX_GAP_MS;
}

/**
 * Re-tags an accept-all scan from a first-visit scan: what that visit saw is
 * "pre", everything else "post". Items only the visit saw are added.
 */
export function applyFirstVisit(transfers, cookies, visit) {
    const merge = (items, seen, key) => {
        const seenKeys = new Set(seen.map(key));
        const itemKeys = new Set(items.map(key));
        return [
            ...items.map((x) => ({ ...x, consentPhase: seenKeys.has(key(x)) ? "pre" : "post" })),
            ...seen.filter((x) => !itemKeys.has(key(x))).map((x) => ({ ...x, consentPhase: "pre" })),
        ];
    };
    return {
        transfers: merge(transfers, visit.transfers || [], (t) => t.host),
        cookies: merge(cookies, visit.cookies || [], (c) => `${c.name}|${c.domain}`),
    };
}

export function summarizeConsentPhase(transfers = [], cookies = []) {
    const items = [...transfers, ...cookies];
    const known = items.length > 0 && items.every(hasPhase);
    return {
        consent_phase_known: known,
        pre_consent_only: known ? {
            transfers: transfers.filter((t) => t.consentPhase === "pre").length,
            cookies:   cookies.filter((c) => c.consentPhase === "pre").length,
        } : null,
    };
}
