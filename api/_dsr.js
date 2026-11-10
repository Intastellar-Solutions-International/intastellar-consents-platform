/**
 * Data subject requests: deadlines, the allowed workflow steps, storage and
 * retention. Free of request handling so the rules can be tested directly.
 */
export const REQUEST_TYPES = [
    { id: "access", label: "Access" },
    { id: "rectification", label: "Rectification" },
    { id: "erasure", label: "Erasure" },
    { id: "portability", label: "Portability" },
    { id: "restriction", label: "Restriction of processing" },
    { id: "objection", label: "Objection to processing" },
    { id: "opt_out", label: "Opt-out of sale / share" },
];

// GDPR counts in calendar months (Art. 12(3)); the others in days. Extensions
// are listed only where the law provides a fixed one.
const US_STATE = { days: 45, extendDays: 45 };
export const DEADLINE_RULES = {
    GDPR: { months: 1, extendMonths: 2 },
    UK_GDPR: { months: 1, extendMonths: 2 },
    LGPD: { days: 15 },
    PDPA: { days: 30 },
    POPIA: { days: 30 },
    CCPA: US_STATE, CDPA: US_STATE, CPA: US_STATE, UCPA: US_STATE, CTDPA: US_STATE,
    APA: { days: 30 },
    PDPL: { days: 30 },
    PIPEDA: { days: 30, extendDays: 30 },
    LAW25: { days: 30 },
};

const CLOSED = new Set(["completed", "rejected"]);
export const IDENTITY_METHODS = [
    { id: "email", label: "Confirmed from their email address" },
    { id: "account", label: "Signed in to their account" },
    { id: "document", label: "Checked an identity document" },
    { id: "other", label: "Another way" },
];
const TYPE_IDS = new Set(REQUEST_TYPES.map((t) => t.id));
const MAX_NAME = 255;
const MAX_TEXT = 4000;
const RETENTION_YEARS = 3;

const endOfDayUtc = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59));

function addMonths(date, months) {
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
    return target;
}

function addRule(date, months, days) {
    return endOfDayUtc(months ? addMonths(date, months) : new Date(date.getTime() + days * 86400000));
}

/** End of the day the response is due. */
export function dueDate(receivedAt, regulation) {
    const rule = DEADLINE_RULES[regulation] || { days: 30 };
    return addRule(new Date(receivedAt), rule.months, rule.days);
}

/** The latest date an extension may reach, or null when the law sets no fixed extension. */
export function latestExtension(dueAt, regulation) {
    const rule = DEADLINE_RULES[regulation];
    if (!rule?.extendMonths && !rule?.extendDays) return null;
    return addRule(new Date(dueAt), rule.extendMonths, rule.extendDays);
}

const clean = (value, max) => String(value ?? "").trim().slice(0, max);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

function validateContact(body) {
    const requester_name = clean(body.requester_name, MAX_NAME) || null;
    const requester_email = clean(body.requester_email, MAX_NAME).toLowerCase() || null;
    const consent_id = clean(body.consent_id, MAX_NAME) || null;
    if (!requester_name && !requester_email && !consent_id) return { error: "Add the requester's name, email or consent ID" };
    if (requester_email && !isEmail(requester_email)) return { error: "That email address doesn't look right" };
    return { requester_name, requester_email, consent_id };
}

/** Cleaned new request, or { error }. The deadline runs from when it was received, which can predate logging it. */
export function validateNewRequest(body, now = Date.now()) {
    const contact = validateContact(body || {});
    if (contact.error) return contact;
    if (!TYPE_IDS.has(body.type)) return { error: "Unknown request type" };
    if (!DEADLINE_RULES[body.regulation]) return { error: "Unknown regulation" };
    if (!isDay(body.received_at)) return { error: "Add the date the request was received" };
    const received_at = new Date(`${body.received_at}T00:00:00Z`);
    if (received_at.getTime() > now + 86400000) return { error: "The received date can't be in the future" };
    return {
        ...contact,
        type: body.type,
        regulation: body.regulation,
        received_at,
        due_at: dueDate(received_at, body.regulation),
        domain: clean(body.domain, MAX_NAME) || null,
        assignee: clean(body.assignee, MAX_NAME) || null,
        notes: clean(body.notes, MAX_TEXT),
    };
}

/**
 * One workflow step on a stored request. Returns { patch, action, detail } or
 * { error }. Personal values stay out of `detail`; it only names what changed.
 */
export function applyAction(current, body, now = new Date()) {
    if (current.anonymized_at) return { error: "This request has been anonymised and can't be changed" };
    const closed = CLOSED.has(current.status);
    const action = body?.action;
    const toldOn = (value) => isDay(value) && Date.parse(`${value}T00:00:00Z`) <= now.getTime() + 86400000;
    const needOpen = ["start", "verify_identity", "extend", "complete", "reject"];
    if (needOpen.includes(action) && closed) return { error: "This request is closed. Reopen it first." };

    if (action === "start") {
        if (current.status !== "pending") return { error: "This request has already been started" };
        if (!current.assignee) return { error: "Assign someone under Details before starting, so it's clear who owns it." };
        return { patch: { status: "in_progress" }, action, detail: { from: "pending", to: "in_progress" } };
    }
    if (action === "verify_identity") {
        if (current.identity_verified_at) return { error: "Identity is already verified" };
        if (!IDENTITY_METHODS.some((m) => m.id === body.method)) return { error: "Choose how identity was verified" };
        const note = clean(body.note, MAX_TEXT);
        if (!note) return { error: "Record what was checked" };
        return { patch: { identity_verified_at: now, identity_method: body.method, identity_note: note, identity_verified_by: clean(body.actor, MAX_NAME) || null }, action, detail: { method: body.method } };
    }
    if (action === "extend") {
        if (current.extended_until) return { error: "This deadline has already been extended" };
        const limit = latestExtension(current.due_at, current.regulation);
        if (!limit) return { error: "This regulation has no fixed extension" };
        const reason = clean(body.reason, MAX_TEXT);
        if (!reason) return { error: "Add the reason for the extension" };
        if (!isDay(body.extended_until)) return { error: "Choose the new deadline" };
        const extended_until = endOfDayUtc(new Date(`${body.extended_until}T00:00:00Z`));
        if (extended_until <= new Date(current.due_at)) return { error: "The new deadline must be after the current one" };
        if (extended_until > limit) return { error: "That is later than the law allows" };
        if (!toldOn(body.notified_on)) return { error: "Add the date the requester was told about the extension" };
        return { patch: { extended_until, extension_reason: reason, extension_notified_on: body.notified_on }, action, detail: { extended_until: extended_until.toISOString() } };
    }
    if (action === "complete") {
        const outcome = clean(body.outcome, MAX_TEXT);
        if (!outcome) return { error: "Record what was done" };
        if (!toldOn(body.notified_on)) return { error: "Add the date the requester was told" };
        return { patch: { status: "completed", outcome, rejection_reason: null, requester_notified_on: body.notified_on, complaint_notice_given: false, closed_at: now }, action, detail: { from: current.status, to: "completed" } };
    }
    if (action === "reject") {
        const reason = clean(body.reason, MAX_TEXT);
        if (!reason) return { error: "Record why the request was rejected" };
        if (!toldOn(body.notified_on)) return { error: "Add the date the requester was told" };
        if (body.complaint_notice !== true) return { error: "Confirm the requester was told they can complain to a supervisory authority" };
        return { patch: { status: "rejected", rejection_reason: reason, outcome: null, requester_notified_on: body.notified_on, complaint_notice_given: true, closed_at: now }, action, detail: { from: current.status, to: "rejected" } };
    }
    if (action === "reopen") {
        if (!closed) return { error: "This request is already open" };
        return { patch: { status: "in_progress", closed_at: null }, action, detail: { from: current.status, to: "in_progress" } };
    }
    if (action === "mark_test") {
        return { patch: { is_test: body.is_test === true }, action, detail: { is_test: body.is_test === true } };
    }
    if (action === "update") {
        const contact = validateContact({ ...current, ...body });
        if (contact.error) return contact;
        const next = {
            ...contact,
            domain: "domain" in body ? clean(body.domain, MAX_NAME) || null : current.domain ?? null,
            assignee: "assignee" in body ? clean(body.assignee, MAX_NAME) || null : current.assignee ?? null,
            notes: "notes" in body ? clean(body.notes, MAX_TEXT) : current.notes ?? "",
        };
        const patch = Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== (current[k] ?? (k === "notes" ? "" : null))));
        if (!Object.keys(patch).length) return { error: "Nothing changed" };
        return { patch, action, detail: { changed: Object.keys(patch) } };
    }
    return { error: "Unknown action" };
}

/** What the API returns for a row: the deadline in force and whether it has passed. */
export function requestView(row, now = Date.now()) {
    const effective_due_at = row.extended_until || row.due_at;
    return { ...row, effective_due_at, overdue: !CLOSED.has(row.status) && new Date(effective_due_at).getTime() < now, is_new: !row.first_opened_at && !CLOSED.has(row.status) };
}

let ready = false;
export async function ensureDsrTables(db) {
    if (ready) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS dsr_requests (
            id                   BIGSERIAL PRIMARY KEY,
            organisation_id      INTEGER NOT NULL,
            domain               TEXT,
            requester_name       TEXT,
            requester_email      TEXT,
            consent_id           TEXT,
            type                 TEXT NOT NULL,
            regulation           TEXT NOT NULL,
            status               TEXT NOT NULL DEFAULT 'pending',
            received_at          TIMESTAMPTZ NOT NULL,
            due_at               TIMESTAMPTZ NOT NULL,
            extended_until       TIMESTAMPTZ,
            extension_reason     TEXT,
            assignee             TEXT,
            identity_verified_at TIMESTAMPTZ,
            outcome              TEXT,
            rejection_reason     TEXT,
            notes                TEXT NOT NULL DEFAULT '',
            closed_at            TIMESTAMPTZ,
            anonymized_at        TIMESTAMPTZ,
            created_by           TEXT,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_dsr_requests_org ON dsr_requests (organisation_id, received_at DESC)`);
    await db.query(`
        CREATE TABLE IF NOT EXISTS dsr_events (
            id              BIGSERIAL PRIMARY KEY,
            request_id      BIGINT NOT NULL REFERENCES dsr_requests (id) ON DELETE CASCADE,
            organisation_id INTEGER NOT NULL,
            actor           TEXT,
            action          TEXT NOT NULL,
            detail          JSONB NOT NULL DEFAULT '{}',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_dsr_events_request ON dsr_events (request_id, created_at)`);
    await db.query(`ALTER TABLE dsr_requests ADD COLUMN IF NOT EXISTS source TEXT`);
    // The temporary default marks every existing request as already seen; new ones start empty.
    await db.query(`ALTER TABLE dsr_requests ADD COLUMN IF NOT EXISTS first_opened_at TIMESTAMPTZ DEFAULT NOW()`);
    await db.query(`ALTER TABLE dsr_requests ALTER COLUMN first_opened_at DROP DEFAULT`);
    await db.query(`
        ALTER TABLE dsr_requests
            ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS identity_method TEXT,
            ADD COLUMN IF NOT EXISTS identity_note TEXT,
            ADD COLUMN IF NOT EXISTS identity_verified_by TEXT,
            ADD COLUMN IF NOT EXISTS extension_notified_on DATE,
            ADD COLUMN IF NOT EXISTS requester_notified_on DATE,
            ADD COLUMN IF NOT EXISTS complaint_notice_given BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS dsr_vendor_notifications (
            id              BIGSERIAL PRIMARY KEY,
            request_id      BIGINT NOT NULL REFERENCES dsr_requests (id) ON DELETE CASCADE,
            organisation_id INTEGER NOT NULL,
            vendor          TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'to_notify',
            notified_at     TIMESTAMPTZ,
            method          TEXT,
            contact         TEXT,
            note            TEXT NOT NULL DEFAULT '',
            privacy_url     TEXT,
            deletion_ref    TEXT,
            updated_by      TEXT,
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (request_id, vendor)
        )
    `);
    await db.query(`ALTER TABLE dsr_vendor_notifications ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'vendor'`);
    await db.query(`
        CREATE TABLE IF NOT EXISTS dsr_vendor_credentials (
            organisation_id INTEGER NOT NULL,
            adapter         TEXT NOT NULL,
            ciphertext      TEXT NOT NULL,
            config          JSONB NOT NULL DEFAULT '{}',
            updated_by      TEXT,
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organisation_id, adapter)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS dsr_public_forms (
            token              TEXT PRIMARY KEY,
            organisation_id    INTEGER NOT NULL,
            company_name       TEXT NOT NULL,
            domain             TEXT,
            notify_email       TEXT,
            default_regulation TEXT NOT NULL DEFAULT 'GDPR',
            enabled            BOOLEAN NOT NULL DEFAULT TRUE,
            created_by         TEXT,
            created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`ALTER TABLE dsr_public_forms ADD COLUMN IF NOT EXISTS logo_data TEXT`);
    await db.query(`
        ALTER TABLE dsr_public_forms
            ADD COLUMN IF NOT EXISTS custom_domain TEXT,
            ADD COLUMN IF NOT EXISTS custom_domain_status TEXT,
            ADD COLUMN IF NOT EXISTS custom_domain_dns JSONB,
            ADD COLUMN IF NOT EXISTS custom_domain_checked_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS custom_domain_failed_since TIMESTAMPTZ
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_dsr_forms_custom_domain ON dsr_public_forms (custom_domain) WHERE custom_domain IS NOT NULL`);
    await db.query(`
        CREATE TABLE IF NOT EXISTS dsr_public_submissions (
            token_hash TEXT PRIMARY KEY,
            form_token TEXT NOT NULL REFERENCES dsr_public_forms (token) ON DELETE CASCADE,
            payload    JSONB NOT NULL,
            ip_hash    TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL
        )
    `);
    ready = true;
}

export async function listRequests(db, organisationId) {
    const { rows } = await db.query(`SELECT * FROM dsr_requests WHERE organisation_id = $1 ORDER BY received_at DESC, id DESC`, [organisationId]);
    return rows.map((r) => requestView(r));
}

export async function getRequest(db, organisationId, id) {
    const { rows } = await db.query(`SELECT * FROM dsr_requests WHERE id = $1 AND organisation_id = $2`, [id, organisationId]);
    if (!rows.length) return null;
    const { rows: events } = await db.query(
        `SELECT actor, action, detail, created_at FROM dsr_events WHERE request_id = $1 AND organisation_id = $2 ORDER BY created_at, id`,
        [id, organisationId]
    );
    return { request: requestView(rows[0]), events };
}

export async function markRequestOpened(db, organisationId, id) {
    await db.query(`UPDATE dsr_requests SET first_opened_at = NOW() WHERE id = $1 AND organisation_id = $2 AND first_opened_at IS NULL`, [id, organisationId]);
}

const NEW_COLUMNS = ["domain", "requester_name", "requester_email", "consent_id", "type", "regulation", "received_at", "due_at", "assignee", "notes", "source"];

export async function createRequest(db, organisationId, actor, values) {
    const params = [organisationId, actor, ...NEW_COLUMNS.map((c) => values[c] ?? null)];
    const { rows } = await db.query(
        `WITH created AS (
            INSERT INTO dsr_requests (organisation_id, created_by, ${NEW_COLUMNS.join(", ")})
            VALUES ($1, $2, ${NEW_COLUMNS.map((_, i) => `$${i + 3}`).join(", ")})
            RETURNING *
         ), logged AS (
            INSERT INTO dsr_events (request_id, organisation_id, actor, action) SELECT id, organisation_id, $2, 'created' FROM created
         )
         SELECT * FROM created`,
        params
    );
    return requestView(rows[0]);
}

const PATCHABLE = new Set(["status", "is_test", "identity_method", "identity_note", "identity_verified_by", "extension_notified_on", "requester_notified_on", "complaint_notice_given", "identity_verified_at", "extended_until", "extension_reason", "outcome", "rejection_reason", "closed_at", "domain", "requester_name", "requester_email", "consent_id", "assignee", "notes"]);

/** Saves a step and its history entry together. Null when the request changed underneath it. */
export async function saveAction(db, organisationId, actor, current, { patch, action, detail }) {
    const columns = Object.keys(patch).filter((c) => PATCHABLE.has(c));
    const params = [current.id, organisationId, current.status, actor, action, JSON.stringify(detail), ...columns.map((c) => patch[c])];
    const { rows } = await db.query(
        `WITH updated AS (
            UPDATE dsr_requests SET ${columns.map((c, i) => `${c} = $${i + 7}`).join(", ")}, updated_at = NOW()
             WHERE id = $1 AND organisation_id = $2 AND status = $3
            RETURNING *
         ), logged AS (
            INSERT INTO dsr_events (request_id, organisation_id, actor, action, detail)
            SELECT id, organisation_id, $4, $5, $6::jsonb FROM updated
         )
         SELECT * FROM updated`,
        params
    );
    return rows[0] ? requestView(rows[0]) : null;
}

/** Closed requests lose their personal details after the retention period; the anonymous record stays. */
export async function anonymizeExpiredRequests(db) {
    await ensureDsrTables(db);
    const { rows } = await db.query(
        `UPDATE dsr_requests
            SET requester_name = NULL, requester_email = NULL, consent_id = NULL, assignee = NULL, created_by = NULL,
                notes = '', outcome = NULL, rejection_reason = NULL, extension_reason = NULL, identity_note = NULL, identity_verified_by = NULL, anonymized_at = NOW()
          WHERE closed_at < NOW() - INTERVAL '${RETENTION_YEARS} years' AND anonymized_at IS NULL
          RETURNING id`
    );
    if (rows.length) {
        const ids = [rows.map((r) => r.id)];
        await db.query(`UPDATE dsr_events SET actor = NULL, detail = '{}' WHERE request_id = ANY($1)`, ids);
        await db.query(`UPDATE dsr_vendor_notifications SET note = '', contact = NULL, deletion_ref = NULL, updated_by = NULL WHERE request_id = ANY($1)`, ids);
    }
    await db.query(`DELETE FROM dsr_public_submissions WHERE expires_at < NOW()`);
    return rows.length;
}

// ── Telling recipients (GDPR Art. 19) ───────────────────────────────────────
export const VENDOR_STATUSES = [
    { id: "to_notify", label: "To notify" },
    { id: "notified", label: "Notified" },
    { id: "confirmed", label: "Confirmed" },
    { id: "cannot_identify", label: "Can't identify the person" },
    { id: "not_applicable", label: "Not applicable" },
];
const VENDOR_STATUS_IDS = new Set(VENDOR_STATUSES.map((s) => s.id));
const NOTIFIABLE_TYPES = new Set(["erasure", "rectification", "restriction"]);
// A CDN or font host holds no record of the person to correct or delete.
const NO_RECORD_CATEGORIES = new Set(["cdn", "cmp"]);

export const needsVendorNotice = (type) => NOTIFIABLE_TYPES.has(type);

/** The organisation's own places to act on first; they can add others. */
export const OWN_SYSTEMS = ["Consent log (Intastellar Consents)", "CRM or customer database", "Email and support inbox", "Backups"];

/**
 * One row per vendor from a scan: { vendor, privacy_url, no_record }.
 * no_record marks CDNs and CMPs, which rarely keep anything about one person.
 * They're listed as not applicable rather than left out, so the choice shows.
 */
export function vendorsFromTransfers(transfers) {
    const byVendor = new Map();
    for (const t of transfers || []) {
        const vendor = t.service || t.host;
        const noRecord = NO_RECORD_CATEGORIES.has(t.category);
        if (!byVendor.has(vendor)) byVendor.set(vendor, { vendor, privacy_url: t.privacyUrl || null, no_record: noRecord });
        else {
            const row = byVendor.get(vendor);
            row.privacy_url ||= t.privacyUrl || null;
            row.no_record &&= noRecord;
        }
    }
    return [...byVendor.values()];
}
const NO_RECORD_NOTE = "Content delivery or consent tool, which usually keeps no record of one person. Change this if it does.";

/**
 * Fills the checklist once, from the domain's latest scan or else the
 * organisation's vendor records. loadReclassify is passed in because this file
 * also reaches the browser bundle, and the scanner code must not.
 */
export async function seedVendorNotifications(db, organisationId, request, loadReclassify) {
    if (request.anonymized_at) return;
    const { rows: existing } = await db.query(`SELECT DISTINCT kind FROM dsr_vendor_notifications WHERE request_id = $1`, [request.id]);
    const has = (kind) => existing.some((r) => r.kind === kind);
    if (!has("system")) {
        for (const vendor of OWN_SYSTEMS) await addVendorNotification(db, organisationId, request.id, { vendor, kind: "system" });
    }
    if (!needsVendorNotice(request.type) || has("vendor")) return;
    let vendors = [];
    if (request.domain) {
        const { rows } = await db.query(
            `SELECT transfers FROM pre_consent_scans
              WHERE (domain = $1 OR domain = 'www.' || $1) AND (organisation_id = $2 OR organisation_id IS NULL)
                AND status = 'completed' AND COALESCE(scan_type, 'accept_all') <> 'first_visit'
              ORDER BY scanned_at DESC LIMIT 1`,
            [request.domain.replace(/^www\./, ""), organisationId]
        );
        if (rows[0]) {
            vendors = vendorsFromTransfers((rows[0].transfers || []).map(await loadReclassify()));
        }
    }
    if (!vendors.length) {
        const { rows } = await db.query(`SELECT vendor FROM vendor_compliance WHERE organisation_id = $1`, [organisationId]).catch(() => ({ rows: [] }));
        vendors = rows.map((r) => ({ vendor: r.vendor, privacy_url: null }));
    }
    for (const v of vendors) {
        await addVendorNotification(db, organisationId, request.id, { ...v, ...(v.no_record ? { status: "not_applicable", note: NO_RECORD_NOTE } : {}) });
    }
}

export async function addVendorNotification(db, organisationId, requestId, { vendor, privacy_url = null, kind = "vendor", status = "to_notify", note = "" }) {
    await db.query(
        `INSERT INTO dsr_vendor_notifications (request_id, organisation_id, vendor, privacy_url, kind, status, note) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (request_id, vendor) DO NOTHING`,
        [requestId, organisationId, vendor, privacy_url, kind, status, note]
    );
}

export async function listVendorNotifications(db, organisationId, requestId) {
    const { rows } = await db.query(`SELECT * FROM dsr_vendor_notifications WHERE request_id = $1 AND organisation_id = $2 ORDER BY vendor`, [requestId, organisationId]);
    return rows;
}

/** Cleaned checklist edit, or { error }. Marking a vendor notified stamps the date. */
export function validateVendorUpdate(body, current, now = new Date()) {
    if (!VENDOR_STATUS_IDS.has(body.status)) return { error: "Unknown status" };
    const told = body.status === "notified" || body.status === "confirmed";
    return {
        status: body.status,
        notified_at: told ? current?.notified_at || now : null,
        method: clean(body.method, MAX_NAME) || null,
        contact: clean(body.contact, MAX_NAME) || null,
        note: clean(body.note, MAX_TEXT),
    };
}

export async function saveVendorNotification(db, organisationId, actor, requestId, vendor, values) {
    const { rows } = await db.query(
        `WITH updated AS (
            UPDATE dsr_vendor_notifications
               SET status = $4, notified_at = $5, method = $6, contact = $7, note = $8, deletion_ref = COALESCE($9, deletion_ref), updated_by = $10, updated_at = NOW()
             WHERE request_id = $1 AND organisation_id = $2 AND vendor = $3
            RETURNING *
         ), logged AS (
            INSERT INTO dsr_events (request_id, organisation_id, actor, action, detail)
            SELECT request_id, organisation_id, $10, 'vendor_update', jsonb_build_object('vendor', vendor, 'status', status) FROM updated
         )
         SELECT * FROM updated`,
        [requestId, organisationId, vendor, values.status, values.notified_at, values.method, values.contact, values.note, values.deletion_ref ?? null, actor]
    );
    return rows[0] || null;
}

const MESSAGE_ACTION = {
    erasure: { subject: "erasure", ask: "erase the personal data you hold about this person, and confirm when that is done (GDPR Art. 17 and 19)" },
    rectification: { subject: "rectification", ask: "correct the personal data you hold about this person. Please contact us for the corrected details (GDPR Art. 16 and 19)" },
    restriction: { subject: "restriction of processing", ask: "restrict processing of the personal data you hold about this person, and confirm when that is done (GDPR Art. 18 and 19)" },
};

/** Ready-to-send notice. Holds only what the vendor needs to find the person. */
export function vendorMessage(request, vendor, companyName) {
    const action = MESSAGE_ACTION[request.type] || MESSAGE_ACTION.erasure;
    const ids = [request.requester_email && `Email: ${request.requester_email}`, request.consent_id && `Consent ID: ${request.consent_id}`].filter(Boolean);
    return {
        subject: `Data subject request: ${action.subject}`,
        body: [
            `Hello ${vendor} privacy team,`,
            "",
            `${companyName || "We"} received a data subject request from a person whose data you may process on our behalf or receive from us. Please ${action.ask}.`,
            "",
            ...ids,
            "",
            "If you can't identify this person from these details, please let us know.",
            "",
            "Kind regards,",
            companyName || "",
        ].join("\n").trim(),
    };
}

// ── Public request form ─────────────────────────────────────────────────────
export const PUBLIC_REGIONS = [
    { id: "GDPR", label: "EU or EEA" },
    { id: "UK_GDPR", label: "United Kingdom" },
    { id: "CCPA", label: "California, USA" },
    { id: "LGPD", label: "Brazil" },
    { id: "PIPEDA", label: "Canada" },
    { id: "default", label: "Somewhere else" },
];
const MIN_FILL_MS = 3000;
const MAX_LOGO_CHARS = 280000; // about 200 KB once decoded

/** A logo is kept as a data URI so the form loads nothing from third parties. Returns the URI, or { error }. */
export function validateLogo(value) {
    if (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/.test(String(value))) return { error: "Upload a PNG, JPEG, WebP or SVG logo" };
    if (String(value).length > MAX_LOGO_CHARS) return { error: "The logo must be under 200 KB" };
    return value;
}

/** Cleaned public submission, { error } with a key from _dsr-public-i18n.js, or { spam: true } to discard silently. */
export function validatePublicSubmission(body, form, now = Date.now()) {
    if (clean(body?.website, 50)) return { spam: true };
    const started = Number(body?.started);
    if (!started || now - started < MIN_FILL_MS) return { spam: true };
    const requester_email = clean(body.email, MAX_NAME).toLowerCase();
    if (!isEmail(requester_email)) return { error: "error_email" };
    if (!TYPE_IDS.has(body.type)) return { error: "error_type" };
    const regulation = DEADLINE_RULES[body.region] ? body.region : form.default_regulation;
    return { requester_email, requester_name: clean(body.name, MAX_NAME) || null, type: body.type, regulation, notes: clean(body.message, MAX_TEXT) };
}
