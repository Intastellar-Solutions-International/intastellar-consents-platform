/**
 * A requester's consent history, by consent ID, from the consent log. Used to
 * show what they agreed to and to narrow who needs telling about their request.
 *
 * The banner records a custom choice as one row for one category, so a row
 * often says nothing about the others. A category only counts as declined
 * when the records actually show it, and if it was never accepted in any of them.
 */
const CONSENT_API = "https://apis.intastellarsolutions.com/analytics/gdpr/getDomainStatistics";
const CACHE_MS = 60 * 1000;
const cache = new Map();

const NORMAL = { statics: "statistics", analytics: "statistics", statistics: "statistics", marketing: "marketing", advertising: "marketing", functional: "functional" };
const ALL = ["functional", "statistics", "marketing"];
const isOn = (v) => v === "checked" || v === "1" || v === 1 || v === true;

function entries(row) {
    let value = row?.consent;
    if (typeof value === "string") {
        try { value = JSON.parse(value); } catch { return []; }
    }
    if (Array.isArray(value)) return value;
    return value && typeof value === "object" ? [value] : [];
}

/** { found, count, first_at, last_at, accepted[], declined[], partial }. */
export function summarizeConsentRows(rows) {
    if (!rows?.length) return { found: false, count: 0, accepted: [], declined: [], partial: false };
    const accepted = new Set(), declined = new Set();
    let partial = false;
    for (const row of rows) {
        for (const e of entries(row)) {
            const type = String(e?.type ?? e?.consent_type ?? "").toLowerCase();
            const on = isOn(e?.checked ?? e?.consent_value);
            if (type === "all") {
                for (const c of ALL) (on ? accepted : declined).add(c);
                continue;
            }
            const category = NORMAL[type];
            if (!category) continue;
            if (on) accepted.add(category); else declined.add(category);
            // One row naming one category leaves the others unknown.
            if (e?.consent_type != null) partial = true;
        }
    }
    const times = rows.map((r) => r?.consents_timestamp).filter(Boolean).sort();
    return {
        found: true,
        count: rows.length,
        first_at: times[0] || null,
        last_at: times[times.length - 1] || null,
        accepted: ALL.filter((c) => accepted.has(c)),
        declined: ALL.filter((c) => declined.has(c) && !accepted.has(c)),
        partial,
    };
}

/** Uses the caller's own credentials, so the consent API decides what they may read. Never throws. */
export async function fetchConsentRecord(req, request, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
    if (!request.consent_id) return null;
    const key = `${req.headers.organisation}|${request.domain}|${request.consent_id}`;
    const cached = cache.get(key);
    if (cached && cached.until > now) return cached.value;
    try {
        const response = await fetchImpl(CONSENT_API, {
            headers: {
                Authorization: req.headers.authorization, Organisation: req.headers.organisation,
                Domains: request.domain || "combined view", UID: request.consent_id,
                Offset: "0", Limit: "200", FromDate: "2020-01-01", ToDate: new Date(now + 86400000).toISOString().slice(0, 10), SortOrder: "desc",
            },
            signal: AbortSignal.timeout(6000),
        });
        if (!response.ok) return { available: false };
        const rows = await response.json();
        const value = { available: true, ...summarizeConsentRows(Array.isArray(rows) ? rows : []) };
        cache.set(key, { value, until: now + CACHE_MS });
        return value;
    } catch {
        return { available: false };
    }
}
