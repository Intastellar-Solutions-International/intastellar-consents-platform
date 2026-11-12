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

/** Which part of the decision split each stored method counts towards. */
const METHOD_GROUP = {
    banner_accept_all: "accept",
    banner_reject_all: "reject",
    banner_essential_only: "reject",
    banner_granular: "custom",
    preferences_updated: "custom",
};

/** Decision split from { method: count }: accept, reject (incl. essential only), custom, other. */
export function decisionSplit(methods) {
    const split = { accept: 0, reject: 0, custom: 0, other: 0 };
    for (const [method, n] of Object.entries(methods || {})) split[METHOD_GROUP[method] || "other"] += Number(n) || 0;
    return split;
}

/** One count per UTC day from `from` to `to` (YYYY-MM-DD), days without records as 0. */
export function dailySeries(daily, from, to) {
    const out = [];
    const end = new Date(`${to}T00:00:00Z`);
    for (let d = new Date(`${from}T00:00:00Z`); d <= end && out.length < 1000; d.setUTCDate(d.getUTCDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        out.push({ day: key, n: Number(daily?.[key]) || 0 });
    }
    return out;
}

/** The server's summary shape, computed from loaded rows (demo mode). */
export function summarizeRows(rows) {
    const methods = {};
    const countries = {};
    const daily = {};
    for (const r of rows || []) {
        const m = String(r?.consent_method ?? "");
        methods[m] = (methods[m] || 0) + 1;
        const c = String(r?.country_code ?? "").toUpperCase();
        if (c && c !== "-") countries[c] = (countries[c] || 0) + 1;
        const d = String(r?.consents_timestamp ?? "").slice(0, 10);
        if (d) daily[d] = (daily[d] || 0) + 1;
    }
    const top = Object.entries(countries).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([code, n]) => ({ code, n }));
    const total = (rows || []).length;
    return { total, methods, countries: top, otherCountries: total - top.reduce((s, c) => s + c.n, 0), daily };
}

/** Milliseconds since epoch for a zone-less UTC "YYYY-MM-DD HH:MM:SS" (or any Date-parsable) timestamp. */
function timestampMs(ts) {
    if (ts == null || ts === "") return NaN;
    const s = String(ts).trim();
    return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s) ? Date.parse(`${s.replace(" ", "T")}Z`) : Date.parse(s);
}

/**
 * Rapid repeats by one visitor collapse into one entry: records with the same
 * UID within `windowMs` of the previous one in the group. The entry sits where
 * its first record was; `items` keeps every record in list order.
 */
export function groupRepeats(rows, windowMs = 60000) {
    const groups = [];
    const open = new Map();
    for (const row of rows || []) {
        const uid = String(row?.uid ?? "");
        const at = timestampMs(row?.consents_timestamp);
        const current = uid ? open.get(uid) : null;
        if (current && Number.isFinite(at) && Math.abs(at - current.lastAt) <= windowMs) {
            current.group.items.push(row);
            current.lastAt = at;
            continue;
        }
        const group = { row, items: [row] };
        groups.push(group);
        if (uid && Number.isFinite(at)) open.set(uid, { group, lastAt: at });
    }
    for (const g of groups) {
        const times = g.items.map((r) => timestampMs(r?.consents_timestamp)).filter(Number.isFinite);
        g.spanSeconds = times.length > 1 ? Math.round((Math.max(...times) - Math.min(...times)) / 1000) : 0;
    }
    return groups;
}

/**
 * Bursts that look automated without tripping the per-visitor checks: at least
 * `min` different visitors from the same country and state making the same
 * choice on the same page within `windowMs`. Returns Map(row → { count, seconds, where }).
 * A hint for the reader only; nothing is excluded because of it.
 */
export function findBursts(rows, { windowMs = 60000, min = 4 } = {}) {
    const byKey = new Map();
    for (const row of rows || []) {
        const at = timestampMs(row?.consents_timestamp);
        if (!Number.isFinite(at) || !row?.country_code || row.country_code === "-") continue;
        const key = [row.country_code, row.state_code || "", comparableUrl(row.url), row.consent_method || ""].join("|");
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push({ row, at });
    }
    const hits = new Map();
    for (const list of byKey.values()) {
        list.sort((a, b) => a.at - b.at);
        let start = 0;
        for (let end = 0; end < list.length; end++) {
            while (list[end].at - list[start].at > windowMs) start++;
            const slice = list.slice(start, end + 1);
            const visitors = new Set(slice.map((x) => String(x.row.uid ?? "")));
            if (visitors.size < min) continue;
            const info = {
                count: slice.length,
                seconds: Math.round((slice[slice.length - 1].at - slice[0].at) / 1000),
                where: [slice[0].row.country_code, slice[0].row.state_code].filter((v) => v && v !== "-").join(" · "),
            };
            for (const x of slice) {
                const prev = hits.get(x.row);
                if (!prev || prev.count < info.count) hits.set(x.row, info);
            }
        }
    }
    return hits;
}

export const BOT_REASON_LABELS = {
    datacenter_ip: "Sent from a datacenter IP address",
    conflicting_decisions: "Same visitor stored a different choice within one second",
    high_rate: "More than 5 decisions by this visitor within a minute",
};

/**
 * Outcome of collect.php's bot checks for one record: "flagged" with the
 * reason, "passed", or "unchecked" for records stored before the checks (or
 * before collect.php started writing "" for clean records).
 */
export function botCheck(row) {
    if (row?.is_suspected_bot) return { status: "flagged", label: BOT_REASON_LABELS[row.bot_reason] || "Flagged as automated traffic" };
    if (row?.bot_reason === "") return { status: "passed", label: "Passed the bot checks" };
    return { status: "unchecked", label: "Not checked: recorded before the bot checks were stored" };
}

const choiceWord = (state) => (state === "accepted" ? "accepted" : state === "declined" ? "declined" : "");

/** One flat record for CSV, JSON and receipts. Times are UTC. */
export function exportRecord(row) {
    const choices = Object.fromEntries(consentChoices(row?.consent).map((c) => [c.label.toLowerCase(), choiceWord(c.state)]));
    const transfer = transferSummary(row);
    const at = timestampMs(row?.consents_timestamp);
    const blank = (v) => (v == null || v === "-" ? "" : String(v));
    return {
        time_utc: Number.isFinite(at) ? new Date(at).toISOString().replace(/\.000Z$/, "Z") : "",
        uid: blank(row?.uid),
        domain: blank(row?.domain),
        country: blank(row?.country_code),
        state: blank(row?.state_code),
        language: blank(row?.language),
        method: methodLabel(row?.consent_method) || "",
        framework: blank(row?.regulation_applied),
        necessary: choices.necessary,
        functional: choices.functional,
        analytics: choices.analytics,
        marketing: choices.marketing,
        page: cleanUrl(row?.url),
        referrer: cleanUrl(row?.referrer),
        transfer: transfer ? transfer.full : "",
        banner_version: blank(row?.code_version),
        banner_config_version: blank(row?.banner_config_version),
        policy_schema: blank(row?.banner_policy_id),
        tcf_cmp_version: row?.tcf ? String(row.tcf.cmp_version) : "",
        tcf_policy_version: row?.tcf ? String(row.tcf.tcf_policy_version) : "",
        tcf_vendor_list_version: row?.tcf ? String(row.tcf.vendor_list_version) : "",
        shopify_consent_id: blank(row?.shopify_consent_id),
        bot_check: botCheck(row).status,
        bot_reason: row?.is_suspected_bot ? blank(row?.bot_reason) : "",
    };
}

/** CSV with a header row. Cells that a spreadsheet would run as a formula are prefixed with '. */
export function toCsv(records) {
    if (!records.length) return "";
    const keys = Object.keys(records[0]);
    const cell = (v) => {
        let s = String(v ?? "");
        if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [keys.join(","), ...records.map((r) => keys.map((k) => cell(r[k])).join(","))].join("\r\n");
}
