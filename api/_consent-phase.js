/**
 * Consent phase of scan results. The scanner (api/_scan-core.js) tags each
 * transfer and cookie with consentPhase "pre" (seen before it granted
 * consent) or "post". Scans recorded before that tagging carry no phase, so
 * the split is only "known" when every item has one.
 */
const hasPhase = (x) => x?.consentPhase === "pre" || x?.consentPhase === "post";

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
