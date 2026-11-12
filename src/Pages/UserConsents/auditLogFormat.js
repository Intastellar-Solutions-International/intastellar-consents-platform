/**
 * Pure formatting for the audit log table and record drawer. No imports, so
 * test/audit-log-format.test.mjs can evaluate this file on its own.
 */

/** Categories in the order the table shows them; "statics" is stored for analytics. */
export const CHOICE_CATEGORIES = [
    { type: "necessary", label: "Necessary", short: "N" },
    { type: "functional", label: "Functional", short: "F" },
    { type: "statics", label: "Analytics", short: "A" },
    { type: "marketing", label: "Marketing", short: "M" },
];

const isAccepted = (v) => v === "checked" || v === "1" || v === 1 || v === true;

/**
 * Each category's choice: "accepted", "declined" or "missing" (not in the
 * record). Takes the banner's array of { type, checked }, its JSON text, or a
 * legacy { consent_type, consent_value } record. Necessary is always on.
 */
export function consentChoices(consent) {
    let value = consent;
    if (typeof value === "string") {
        try { value = JSON.parse(value); } catch { value = null; }
    }
    const items = Array.isArray(value)
        ? value.map((c) => ({ type: c?.type, accepted: isAccepted(c?.checked) }))
        : value && typeof value === "object" && value.consent_type
            ? [{ type: value.consent_type, accepted: isAccepted(value.consent_value) }]
            : [];
    const byType = {};
    for (const item of items) {
        const type = String(item.type || "").toLowerCase();
        if (type === "all") {
            for (const c of CHOICE_CATEGORIES) byType[c.type] = item.accepted ? "accepted" : "declined";
        } else if (type) {
            byType[type] = item.accepted ? "accepted" : "declined";
        }
    }
    return CHOICE_CATEGORIES.map((c) => ({
        ...c,
        state: c.type === "necessary" ? "accepted" : byType[c.type] || "missing",
    }));
}

/**
 * One time format for the whole page: "10 Nov 2026, 20:00:40" in the viewer's
 * time zone, the zone named, and ISO UTC for the hover text. Day and month name
 * can't be misread the way 10/11/2026 can.
 */
export function formatAuditTime(date, locale = "en-GB", timeZone) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
    const parts = {};
    const options = { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" };
    if (timeZone) options.timeZone = timeZone;
    let formatter;
    try { formatter = new Intl.DateTimeFormat(locale, options); } catch { formatter = new Intl.DateTimeFormat("en-GB", options); }
    for (const p of formatter.formatToParts(date)) parts[p.type] = p.value;
    const month = String(parts.month || "").replace(/\.$/, "");
    return {
        date: `${parts.day} ${month} ${parts.year}`,
        time: `${parts.hour}:${parts.minute}:${parts.second}`,
        zone: parts.timeZoneName || "",
        iso: date.toISOString().replace(/\.000Z$/, "Z"),
    };
}

const TRANSFER_BASIS_SHORT = {
    sccs: "SCCs",
    bcrs: "BCRs",
    adequacy: "Adequacy",
    certification: "Certification",
    consent: "Consent",
    intra_group: "Intra-group",
    derogation: "Derogation",
    none_required: "No transfer",
    disclosure_only: "Disclosure only",
};

/**
 * Data transfer basis as a short badge ("SCCs → EU") plus the full wording
 * for the tooltip and drawer. Falls back to the legacy single-string fields.
 * Returns null when nothing is known.
 */
export function transferSummary(row) {
    if (!row) return null;
    const basis = String(row.transfer_basis ?? "").trim().toLowerCase();
    const destination = String(row.transfer_destination ?? "").trim();
    const instrument = String(row.transfer_instrument ?? "").trim();
    const importer = String(row.transfer_data_importer ?? "").trim();
    const effective = String(row.transfer_effective_from ?? "").trim();
    if (basis || destination || instrument) {
        const label = TRANSFER_BASIS_SHORT[basis] || basis.replace(/_/g, " ");
        const short = [label, destination].filter(Boolean).join(" → ") || "—";
        const details = [instrument, importer, effective ? `since ${effective.slice(0, 10)}` : ""].filter(Boolean);
        return { short, full: details.length ? `${short} · ${details.join(" · ")}` : short, instrument, importer, effective: effective.slice(0, 10) };
    }
    const legacy = row.transfer_mechanism ?? row.data_transfer ?? row.data_residency ?? row.hosting_region ?? null;
    return legacy ? { short: String(legacy), full: String(legacy), instrument: "", importer: "", effective: "" } : null;
}

/** URL without query, hash, scheme, "www." or trailing slash, for comparing page and referrer. */
export function comparableUrl(url) {
    if (url == null) return "";
    return String(url).trim().split(/[?#]/)[0].replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase();
}

/** Page URL without query or hash. */
export function cleanUrl(url) {
    return url ? String(url).trim().split(/[?#]/)[0] : "";
}

/** Path shown in the table ("/integrations"); the host only when it isn't the record's domain. */
export function pageLabel(url, domain) {
    const clean = comparableUrl(url);
    if (!clean) return "";
    const slash = clean.indexOf("/");
    const host = slash === -1 ? clean : clean.slice(0, slash);
    const path = slash === -1 ? "/" : clean.slice(slash);
    const sameHost = domain && host === String(domain).toLowerCase().replace(/^www\./, "");
    return sameHost ? path : `${host}${path === "/" ? "" : path}`;
}

/** Long names for the drawer and filter menu. */
export const METHOD_NAMES = {
    banner_accept_all: "Accept all",
    banner_reject_all: "Reject all",
    banner_granular: "Custom",
    banner_essential_only: "Essential only",
    preferences_updated: "Preferences updated",
    preferences_withdrawn: "Preferences withdrawn",
    withdrawal: "Withdrawal",
    api_import: "API import",
};

export function methodLabel(method) {
    const s = String(method ?? "").trim();
    if (!s) return null;
    return METHOD_NAMES[s] || s.replace(/_/g, " ");
}

/** Readable language tag, e.g. "da-DK (Danish)". Null when missing. */
export function languageLabel(lang) {
    const raw = String(lang ?? "").trim();
    if (!raw) return null;
    const tag = raw.includes("-")
        ? raw.replace(/^([a-z]{2,3})-([a-z]{2})$/i, (_, l, r) => `${l.toLowerCase()}-${r.toUpperCase()}`)
        : raw.toLowerCase();
    try {
        const name = new Intl.DisplayNames(["en"], { type: "language" }).of(tag);
        if (name && name !== tag) return `${tag} (${name})`;
    } catch { /* invalid tag: show it as stored */ }
    return tag;
}
