/**
 * Derive an approximate ISO timestamp for the most recent interaction from Live view payload.
 * Uses explicit server fields when present, otherwise the smallest `minutes` / `seconds` in `visitsOverTime`
 * (same semantics as the 30‑minute bar chart in LiveView).
 */
export function getApproxLastInteractionIsoFromLiveData(liveData) {
    if (liveData == null || typeof liveData !== "object") return null;
    if (Number(liveData.count) === 0) return null;

    const direct =
        liveData.lastInteractionAt ??
        liveData.last_interaction_at ??
        liveData.lastConsentAt ??
        liveData.last_consent_at ??
        liveData.updatedAt;
    if (direct != null && direct !== "") {
        const d = new Date(direct);
        if (Number.isFinite(d.getTime())) return d.toISOString();
    }

    const arr = liveData.visitsOverTime;
    if (!Array.isArray(arr) || arr.length === 0) return null;

    let bestMinutes = Infinity;
    for (const ev of arr) {
        const m = Number(ev?.minutes);
        if (Number.isFinite(m) && m >= 0) {
            bestMinutes = Math.min(bestMinutes, m);
            continue;
        }
        const s = Number(ev?.seconds);
        if (Number.isFinite(s) && s >= 0) {
            bestMinutes = Math.min(bestMinutes, s / 60);
        }
    }
    if (!Number.isFinite(bestMinutes) || bestMinutes === Infinity) return null;

    return new Date(Date.now() - bestMinutes * 60 * 1000).toISOString();
}
