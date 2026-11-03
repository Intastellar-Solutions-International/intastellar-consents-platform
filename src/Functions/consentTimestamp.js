/**
 * Parse a consent record's `consents_timestamp` into a Date.
 *
 * The consent API (php-backend/consents/collect.php) stores UTC wall-clock
 * time with no zone marker, e.g. "2026-11-03 14:30:05". `new Date()` reads
 * such a string as the *browser's* local time, which shifted every consent by
 * the viewer's UTC offset (an hour or two for Copenhagen) — e.g. "last consent
 * recorded" looked an hour older than it was. Zone-less strings are therefore
 * read as UTC; anything carrying its own zone (ISO "…Z", "+02:00") or a number
 * is passed through unchanged.
 *
 * Returns null for missing/unparsable input.
 */
export function parseConsentTimestamp(ts) {
    if (ts == null || ts === "") return null;
    let d;
    if (typeof ts === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(ts.trim())) {
        d = new Date(ts.trim().replace(" ", "T") + "Z");
    } else {
        d = new Date(ts);
    }
    return Number.isFinite(d.getTime()) ? d : null;
}
