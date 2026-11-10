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
    const needOpen = ["start", "verify_identity", "extend", "complete", "reject"];
    if (needOpen.includes(action) && closed) return { error: "This request is closed. Reopen it first." };

    if (action === "start") {
        if (current.status !== "pending") return { error: "This request has already been started" };
        return { patch: { status: "in_progress" }, action, detail: { from: "pending", to: "in_progress" } };
    }
    if (action === "verify_identity") {
        if (current.identity_verified_at) return { error: "Identity is already verified" };
        return { patch: { identity_verified_at: now }, action, detail: {} };
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
        return { patch: { extended_until, extension_reason: reason }, action, detail: { extended_until: extended_until.toISOString() } };
    }
    if (action === "complete") {
        const outcome = clean(body.outcome, MAX_TEXT);
        if (!outcome) return { error: "Record how the request was answered" };
        return { patch: { status: "completed", outcome, rejection_reason: null, closed_at: now }, action, detail: { from: current.status, to: "completed" } };
    }
    if (action === "reject") {
        const reason = clean(body.reason, MAX_TEXT);
        if (!reason) return { error: "Record why the request was rejected" };
        return { patch: { status: "rejected", rejection_reason: reason, outcome: null, closed_at: now }, action, detail: { from: current.status, to: "rejected" } };
    }
    if (action === "reopen") {
        if (!closed) return { error: "This request is already open" };
        return { patch: { status: "in_progress", closed_at: null }, action, detail: { from: current.status, to: "in_progress" } };
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
    return { ...row, effective_due_at, overdue: !CLOSED.has(row.status) && new Date(effective_due_at).getTime() < now };
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

const NEW_COLUMNS = ["domain", "requester_name", "requester_email", "consent_id", "type", "regulation", "received_at", "due_at", "assignee", "notes"];

export async function createRequest(db, organisationId, actor, values) {
    const params = [organisationId, actor, ...NEW_COLUMNS.map((c) => values[c])];
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

const PATCHABLE = new Set(["status", "identity_verified_at", "extended_until", "extension_reason", "outcome", "rejection_reason", "closed_at", "domain", "requester_name", "requester_email", "consent_id", "assignee", "notes"]);

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
                notes = '', outcome = NULL, rejection_reason = NULL, extension_reason = NULL, anonymized_at = NOW()
          WHERE closed_at < NOW() - INTERVAL '${RETENTION_YEARS} years' AND anonymized_at IS NULL
          RETURNING id`
    );
    if (rows.length) {
        await db.query(`UPDATE dsr_events SET actor = NULL, detail = '{}' WHERE request_id = ANY($1)`, [rows.map((r) => r.id)]);
    }
    return rows.length;
}
