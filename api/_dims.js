// Custom dimensions sent by the tracker (api/a.js → intaAnalytics.set).

/**
 * Custom dimensions from the tracker (payload `cd`) → JSON string or null.
 * At most 5 keys of a-z, 0-9, _ (≤ 32), string values ≤ 100 characters.
 * Values that look like an e-mail address are dropped: dimensions are for
 * segments like "plan" or "logged_in", never for identifying people.
 */
export const MAX_DIMS = 5;
const DIM_KEY_RE = /^[a-z0-9_]{1,32}$/;
const EMAIL_LIKE_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
export function sanitizeDims(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
        if (Object.keys(out).length >= MAX_DIMS) break;
        if (!DIM_KEY_RE.test(key)) continue;
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") continue;
        const v = String(value).trim().slice(0, 100);
        if (!v || EMAIL_LIKE_RE.test(v)) continue;
        out[key] = v;
    }
    return Object.keys(out).length ? JSON.stringify(out) : null;
}
