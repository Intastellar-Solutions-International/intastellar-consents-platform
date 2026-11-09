/**
 * Reading audit-log rows for the snapshot card. A row's `consent` is JSON in
 * one of two shapes: [{ type, checked }] or [{ consent_type, consent_value }].
 */
const NECESSARY_TYPES = new Set(["necessary", "essential"]);
const CATEGORY_LABEL = { statistics: "Statistics", statics: "Statistics", analytics: "Analytics", marketing: "Marketing", functional: "Functional" };

function parseConsentEntries(row) {
    let c = row?.consent;
    if (c == null) return null;
    if (typeof c === "string") {
        try {
            c = JSON.parse(c);
        } catch {
            return null;
        }
    }
    if (Array.isArray(c)) return c;
    if (typeof c === "object" && (c.consent_type != null || c.type != null)) return [c];
    return null;
}

const isChecked = (v) => v === "checked" || v === "1" || v === true || v === 1;
const entryChecked = (x) => isChecked(x?.checked ?? x?.consent_value);
const entryType = (x) => String(x?.type ?? x?.consent_type ?? "").toLowerCase();
const isOptional = (x) => !NECESSARY_TYPES.has(entryType(x));

export function auditRowChoiceSummary(row) {
    const reg = String(row?.regulation_applied ?? "").toUpperCase();
    const isCcpa = reg.includes("CCPA") || reg.includes("CPRA");
    const arr = parseConsentEntries(row);
    if (!arr || arr.length === 0) return "—";
    if (arr.length === 1 && arr[0]?.consent_type != null) {
        const accepted = entryChecked(arr[0]);
        if (isCcpa) return accepted ? "Opt-in all" : "Opt-out";
        return accepted ? "Accepted all" : "Essential only";
    }
    const optional = arr.filter(isOptional);
    if (optional.length === 0) return isCcpa ? "Opt-out" : "Essential only";
    if (optional.every(entryChecked)) return isCcpa ? "Opt-in all" : "Accepted all";
    if (!optional.some(entryChecked)) return isCcpa ? "Opt-out" : "Essential only";
    return "Mixed choices";
}

/** The optional categories this row recorded as accepted and declined. Necessary is always on, so it's left out. */
export function auditRowChoices(row) {
    const optional = (parseConsentEntries(row) || []).filter((x) => isOptional(x) && entryType(x));
    const label = (x) => CATEGORY_LABEL[entryType(x)] || entryType(x).charAt(0).toUpperCase() + entryType(x).slice(1);
    return { accepted: optional.filter(entryChecked).map(label), declined: optional.filter((x) => !entryChecked(x)).map(label) };
}

export function consentIdOf(row) {
    return String(row?.uid ?? row?.shopify_consent_id ?? "");
}

export function matchesConsentId(row, query) {
    return consentIdOf(row).toLowerCase().includes(String(query).trim().toLowerCase());
}

/** Newest first; rows with an unreadable timestamp go last. parse: string → Date or null. */
export function sortNewestFirst(rows, parse) {
    const time = (row) => parse(row?.consents_timestamp)?.getTime() ?? -Infinity;
    return [...rows].sort((a, b) => time(b) - time(a));
}
