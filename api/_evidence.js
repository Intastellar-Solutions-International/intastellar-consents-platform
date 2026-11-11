import { createHash, randomBytes } from "crypto";

/**
 * Evidence catalog: compliance documents per vendor (one current DPA, older ones kept as
 * history, plus SCCs, DPF certificates, TIAs …) and organisation-wide documents, all in the
 * private Blob store. External control persons get read-only access through an invite,
 * an emailed one-time sign-in link and a short session; everything they open is logged.
 */

export const VENDOR_TYPES = [
    { id: "dpa", label: "DPA" },
    { id: "sccs", label: "SCCs" },
    { id: "dpf", label: "DPF certificate" },
    { id: "tia", label: "Transfer impact assessment" },
    { id: "other", label: "Other" },
];
export const ORGANISATION_TYPES = [
    { id: "privacy_policy", label: "Privacy policy" },
    { id: "cookie_policy", label: "Cookie policy" },
    { id: "dpia", label: "DPIA" },
    { id: "ropa", label: "RoPA export" },
    { id: "toms", label: "TOMs" },
    { id: "other", label: "Other" },
];
export const typeLabel = (vendor, type) => (vendor ? VENDOR_TYPES : ORGANISATION_TYPES).find((t) => t.id === type)?.label || type;

// Vercel rejects request bodies over 4.5 MB, and base64 adds a third.
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
/** Checked against the file's first bytes too: these are shown inline, so the type has to be true. */
const SIGNATURES = {
    "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],
    "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "image/jpeg": [0xff, 0xd8, 0xff],
};
export const INVITE_MAX_DAYS = 180;
export const LOGIN_MINUTES = 15;
export const SESSION_HOURS = 8;
export const LOGIN_LINKS_PER_HOUR = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const sha = (value) => createHash("sha256").update(value).digest("hex");
export const newSecret = () => randomBytes(32).toString("base64url");
export const validId = (id) => /^\d{1,18}$/.test(String(id ?? ""));
const clean = (value, max) => String(value ?? "").trim().slice(0, max);

let tablesReady = false;
export async function ensureEvidenceTables(db) {
    if (tablesReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS compliance_documents (
            id              BIGSERIAL   PRIMARY KEY,
            organisation_id BIGINT      NOT NULL,
            vendor          TEXT,
            doc_type        TEXT        NOT NULL,
            title           TEXT        NOT NULL,
            filename        TEXT        NOT NULL,
            content_type    TEXT        NOT NULL,
            size_bytes      INTEGER     NOT NULL,
            sha256          TEXT        NOT NULL,
            blob_path       TEXT        NOT NULL,
            uploaded_by     TEXT,
            uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            superseded_at   TIMESTAMPTZ
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS compliance_documents_org ON compliance_documents (organisation_id, vendor)`);
    // One current DPA per vendor; replacing it marks the old one superseded.
    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS compliance_documents_current_dpa
            ON compliance_documents (organisation_id, vendor) WHERE doc_type = 'dpa' AND superseded_at IS NULL
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS evidence_invites (
            id                BIGSERIAL   PRIMARY KEY,
            organisation_id   BIGINT      NOT NULL,
            organisation_name TEXT        NOT NULL DEFAULT '',
            email             TEXT        NOT NULL,
            name              TEXT        NOT NULL DEFAULT '',
            note              TEXT        NOT NULL DEFAULT '',
            token_hash        TEXT        NOT NULL UNIQUE,
            expires_at        TIMESTAMPTZ NOT NULL,
            revoked_at        TIMESTAMPTZ,
            created_by        TEXT,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_access_at    TIMESTAMPTZ
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS evidence_logins (
            code_hash  TEXT        PRIMARY KEY,
            invite_id  BIGINT      NOT NULL REFERENCES evidence_invites (id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            used_at    TIMESTAMPTZ
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS evidence_sessions (
            session_hash TEXT        PRIMARY KEY,
            invite_id    BIGINT      NOT NULL REFERENCES evidence_invites (id) ON DELETE CASCADE,
            expires_at   TIMESTAMPTZ NOT NULL
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS evidence_access_log (
            id              BIGSERIAL   PRIMARY KEY,
            organisation_id BIGINT      NOT NULL,
            invite_id       BIGINT      REFERENCES evidence_invites (id) ON DELETE SET NULL,
            document_id     BIGINT,
            action          TEXT        NOT NULL,
            at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await migrateVendorEvidence(db);
    tablesReady = true;
}

/** The single evidence file vendor_compliance used to hold becomes an "Other" document. Runs once per file. */
async function migrateVendorEvidence(db) {
    const exists = await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'vendor_compliance' AND column_name = 'evidence_blob_path'`);
    if (!exists.rows.length) return;
    await db.query(`
        INSERT INTO compliance_documents (organisation_id, vendor, doc_type, title, filename, content_type, size_bytes, sha256, blob_path, uploaded_at)
        SELECT v.organisation_id, v.vendor, 'other', 'Evidence',
               regexp_replace(split_part(v.evidence_blob_path, '/', 4), '^\\d+-', ''),
               CASE WHEN v.evidence_blob_path ~* '\\.pdf$' THEN 'application/pdf'
                    WHEN v.evidence_blob_path ~* '\\.png$' THEN 'image/png' ELSE 'image/jpeg' END,
               0, '', v.evidence_blob_path, v.updated_at
          FROM vendor_compliance v
         WHERE v.evidence_blob_path IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM compliance_documents d WHERE d.blob_path = v.evidence_blob_path)
    `);
    await db.query(`UPDATE vendor_compliance SET evidence_blob_path = NULL WHERE evidence_blob_path IS NOT NULL`);
}

/** Decoded upload, or { error } for the page to show. */
export function validateUpload(body) {
    const vendor = clean(body?.vendor, 255) || null;
    const types = vendor ? VENDOR_TYPES : ORGANISATION_TYPES;
    if (!types.some((t) => t.id === body?.doc_type)) return { error: "Choose a document type" };
    const signature = SIGNATURES[body?.content_type];
    if (!signature) return { error: "Upload a PDF, PNG or JPEG file" };
    const data = Buffer.from(String(body?.data ?? ""), "base64");
    if (!data.length) return { error: "The file is empty" };
    if (data.length > MAX_FILE_BYTES) return { error: "The file is larger than 3 MB" };
    if (!signature.every((byte, i) => data[i] === byte)) return { error: "The file's content doesn't match its type" };
    const filename = String(body?.filename ?? "document").replace(/[^\w.-]+/g, "_").slice(-100) || "document";
    const title = clean(body?.title, 160) || typeLabel(vendor, body.doc_type);
    return { vendor, docType: body.doc_type, title, filename, contentType: body.content_type, data };
}

/** Private store path, scoped to the organisation so one can never name another's file. */
export function documentPath(organisationId, vendor, filename, now = Date.now()) {
    const folder = vendor ? sha(vendor).slice(0, 32) : "organisation";
    return `evidence/${organisationId}/${folder}/${now}-${randomBytes(4).toString("hex")}-${filename}`;
}

const DOC_COLUMNS = `id, vendor, doc_type, title, filename, content_type, size_bytes, uploaded_by, uploaded_at, superseded_at`;

export async function listDocuments(db, organisationId) {
    const { rows } = await db.query(
        `SELECT ${DOC_COLUMNS} FROM compliance_documents WHERE organisation_id = $1
          ORDER BY vendor NULLS FIRST, superseded_at NULLS FIRST, uploaded_at DESC`,
        [organisationId]
    );
    return rows;
}

export async function getDocument(db, organisationId, id) {
    if (!validId(id)) return null;
    const { rows } = await db.query(`SELECT * FROM compliance_documents WHERE organisation_id = $1 AND id = $2`, [organisationId, id]);
    return rows[0] || null;
}

/** Stores the file, then the row; a new DPA supersedes the vendor's current one in the same transaction. */
export async function saveDocument(db, organisationId, upload, email, put) {
    const path = documentPath(organisationId, upload.vendor, upload.filename);
    await put(path, upload.data, { access: "private", contentType: upload.contentType, addRandomSuffix: false });
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        if (upload.docType === "dpa") {
            await client.query(
                `UPDATE compliance_documents SET superseded_at = NOW()
                  WHERE organisation_id = $1 AND vendor = $2 AND doc_type = 'dpa' AND superseded_at IS NULL`,
                [organisationId, upload.vendor]
            );
        }
        const { rows } = await client.query(
            `INSERT INTO compliance_documents (organisation_id, vendor, doc_type, title, filename, content_type, size_bytes, sha256, blob_path, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${DOC_COLUMNS}`,
            [organisationId, upload.vendor, upload.docType, upload.title, upload.filename, upload.contentType, upload.data.length, sha(upload.data), path, email]
        );
        await client.query("COMMIT");
        return rows[0];
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

/** Deletes one document and its file. Deleting the current DPA doesn't bring back an older one. */
export async function deleteDocument(db, organisationId, id, del) {
    const doc = await getDocument(db, organisationId, id);
    if (!doc) return false;
    await db.query(`DELETE FROM compliance_documents WHERE organisation_id = $1 AND id = $2`, [organisationId, doc.id]);
    await del(doc.blob_path).catch((err) => console.error("[evidence] file not removed:", err.message));
    return true;
}

/** Headers for a stored file: inline for the preview, attachment for a download. */
export function fileHeaders(doc, download) {
    const name = doc.filename.replace(/"/g, "");
    return {
        "Content-Type": doc.content_type,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
    };
}

/** Cleaned invite, or { error }. Expiry is a date, at most INVITE_MAX_DAYS ahead. */
export function validateInvite(body, now = Date.now()) {
    const email = clean(body?.email, 254).toLowerCase();
    if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address" };
    const expires = Date.parse(`${body?.expires_on}T23:59:59Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body?.expires_on)) || Number.isNaN(expires)) return { error: "Choose when access ends" };
    if (expires < now) return { error: "The end date has to be in the future" };
    if (expires > now + INVITE_MAX_DAYS * 86400000) return { error: `Access can last at most ${INVITE_MAX_DAYS} days` };
    return {
        email, expiresAt: new Date(expires),
        name: clean(body?.name, 120), note: clean(body?.note, 500), organisationName: clean(body?.organisation_name, 160),
    };
}

const INVITE_COLUMNS = `id, email, name, note, expires_at, revoked_at, created_by, created_at, last_access_at`;

export async function createInvite(db, organisationId, invite, email) {
    const token = newSecret();
    const { rows } = await db.query(
        `INSERT INTO evidence_invites (organisation_id, organisation_name, email, name, note, token_hash, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${INVITE_COLUMNS}`,
        [organisationId, invite.organisationName, invite.email, invite.name, invite.note, sha(token), invite.expiresAt, email]
    );
    return { invite: rows[0], token };
}

/** A new link for an existing invite; the old one stops working. */
export async function renewInviteToken(db, organisationId, id) {
    if (!validId(id)) return null;
    const token = newSecret();
    const { rows } = await db.query(
        `UPDATE evidence_invites SET token_hash = $3 WHERE organisation_id = $1 AND id = $2 AND revoked_at IS NULL AND expires_at > NOW()
         RETURNING ${INVITE_COLUMNS}, organisation_name`,
        [organisationId, id, sha(token)]
    );
    return rows[0] ? { invite: rows[0], token } : null;
}

export async function revokeInvite(db, organisationId, id) {
    if (!validId(id)) return false;
    const { rows } = await db.query(
        `UPDATE evidence_invites SET revoked_at = NOW() WHERE organisation_id = $1 AND id = $2 AND revoked_at IS NULL RETURNING id`,
        [organisationId, id]
    );
    if (rows.length) await db.query(`DELETE FROM evidence_sessions WHERE invite_id = $1`, [id]);
    return rows.length > 0;
}

export async function listInvites(db, organisationId) {
    const { rows } = await db.query(`SELECT ${INVITE_COLUMNS} FROM evidence_invites WHERE organisation_id = $1 ORDER BY created_at DESC`, [organisationId]);
    return rows;
}

export async function listAccessLog(db, organisationId, limit = 200) {
    const { rows } = await db.query(
        `SELECT l.id, l.action, l.at, l.document_id, i.email, d.title, d.vendor
           FROM evidence_access_log l
           LEFT JOIN evidence_invites i ON i.id = l.invite_id
           LEFT JOIN compliance_documents d ON d.id = l.document_id
          WHERE l.organisation_id = $1 ORDER BY l.at DESC LIMIT $2`,
        [organisationId, limit]
    );
    return rows;
}

export async function logAccess(db, invite, action, documentId = null) {
    await db.query(
        `INSERT INTO evidence_access_log (organisation_id, invite_id, document_id, action) VALUES ($1, $2, $3, $4)`,
        [invite.organisation_id, invite.id, documentId, action]
    );
    await db.query(`UPDATE evidence_invites SET last_access_at = NOW() WHERE id = $1`, [invite.id]);
}

/** The invite behind a room link, if it can still be used. */
export async function inviteByToken(db, token) {
    if (!token || String(token).length > 100) return null;
    const { rows } = await db.query(`SELECT * FROM evidence_invites WHERE token_hash = $1`, [sha(String(token))]);
    const invite = rows[0];
    if (!invite) return null;
    return { invite, usable: !invite.revoked_at && new Date(invite.expires_at) > new Date() };
}

/** A one-time sign-in code for the invite, or null once LOGIN_LINKS_PER_HOUR were sent. */
export async function createLoginCode(db, invite) {
    const { rows } = await db.query(
        `SELECT COUNT(*)::int AS n FROM evidence_logins WHERE invite_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
        [invite.id]
    );
    if (rows[0].n >= LOGIN_LINKS_PER_HOUR) return null;
    const code = newSecret();
    await db.query(
        `INSERT INTO evidence_logins (code_hash, invite_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '${LOGIN_MINUTES} minutes')`,
        [sha(code), invite.id]
    );
    return code;
}

/** Spends a sign-in code and opens a session. Null when the code is unknown, used, expired or for another invite. */
export async function redeemLoginCode(db, invite, code) {
    const { rows } = await db.query(
        `UPDATE evidence_logins SET used_at = NOW()
          WHERE code_hash = $1 AND invite_id = $2 AND used_at IS NULL AND expires_at > NOW() RETURNING invite_id`,
        [sha(String(code ?? "")), invite.id]
    );
    if (!rows.length) return null;
    const session = newSecret();
    await db.query(
        `INSERT INTO evidence_sessions (session_hash, invite_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '${SESSION_HOURS} hours')`,
        [sha(session), invite.id]
    );
    await db.query(`DELETE FROM evidence_sessions WHERE expires_at < NOW()`);
    return session;
}

export async function sessionValid(db, invite, session) {
    if (!session) return false;
    const { rows } = await db.query(
        `SELECT 1 FROM evidence_sessions WHERE session_hash = $1 AND invite_id = $2 AND expires_at > NOW()`,
        [sha(String(session)), invite.id]
    );
    return rows.length > 0;
}

/** "jane.doe@firm.com" → "ja•••@firm.com", so the room page doesn't print the full address to whoever holds the link. */
export function maskEmail(email) {
    const [user, domain] = String(email).split("@");
    return `${user.slice(0, 2)}•••@${domain}`;
}
