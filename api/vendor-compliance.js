import { createHash } from "crypto";
import { Readable } from "stream";
import { getPool } from "./_db.js";
import { requireMember } from "./_member-auth.js";

/**
 * /api/vendor-compliance — what an organisation has recorded about each
 * vendor for GDPR Chapter V: the transfer mechanism and when it was confirmed,
 * the DPA status, an owner, notes and evidence.
 * A contract is with the organisation, so records apply across its domains.
 *
 * GET                → { records: { [vendor]: record } }
 * GET ?evidence=name → the uploaded evidence file for that vendor
 * POST { vendor, mechanism, mechanism_confirmed_at, dpa_status, owner, notes, evidence_url }
 *                    → saves; all empty clears it
 * POST { action: "upload_evidence", vendor, filename, content_type, data (base64) }
 * POST { action: "delete_evidence", vendor }
 *
 * Headers: Authorization (Bearer), Organisation, X-User-Email
 */
const MECHANISMS = new Set(["dpf", "sccs", "adequacy", "bcr", "none"]);
const DPA_STATES = new Set(["unknown", "requested", "signed", "not_required"]);
const MAX_VENDOR = 255;
const MAX_NOTES = 1000;
const MAX_OWNER = 255;
const MAX_URL = 2000;
// Vercel rejects request bodies over 4.5 MB, and base64 adds a third.
const MAX_EVIDENCE_BYTES = 3 * 1024 * 1024;
const EVIDENCE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const RECORD_COLUMNS = `mechanism, to_char(mechanism_confirmed_at, 'YYYY-MM-DD') AS mechanism_confirmed_at, dpa_status, owner, notes, evidence_url, evidence_blob_path, updated_at`;
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

let tableReady = false;
async function ensureTable(db) {
    if (tableReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS vendor_compliance (
            organisation_id INTEGER NOT NULL,
            vendor          TEXT NOT NULL,
            mechanism       TEXT,
            dpa_status      TEXT,
            notes           TEXT NOT NULL DEFAULT '',
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organisation_id, vendor)
        )
    `);
    await db.query(`
        ALTER TABLE vendor_compliance
            ADD COLUMN IF NOT EXISTS mechanism_confirmed_at DATE,
            ADD COLUMN IF NOT EXISTS owner TEXT,
            ADD COLUMN IF NOT EXISTS evidence_url TEXT,
            ADD COLUMN IF NOT EXISTS evidence_blob_path TEXT
    `);
    await db.query(`UPDATE vendor_compliance SET dpa_status = 'unknown' WHERE dpa_status = 'missing'`);
    tableReady = true;
}

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, Content-Type, X-User-Email");
    res.setHeader("Access-Control-Max-Age", "86400");
}

/** Cleaned record, or { error } when a value isn't one we accept. */
export function validateRecord(body) {
    const vendor = String(body?.vendor ?? "").trim();
    if (!vendor || vendor.length > MAX_VENDOR) return { error: "A vendor is required" };
    const mechanism = body.mechanism || null;
    const dpa_status = body.dpa_status || null;
    if (mechanism !== null && !MECHANISMS.has(mechanism)) return { error: "Unknown transfer mechanism" };
    if (dpa_status !== null && !DPA_STATES.has(dpa_status)) return { error: "Unknown DPA status" };
    const mechanism_confirmed_at = body.mechanism_confirmed_at || null;
    if (mechanism_confirmed_at !== null && !isDate(mechanism_confirmed_at)) return { error: "Invalid confirmation date" };
    const evidence_url = String(body.evidence_url ?? "").trim() || null;
    if (evidence_url !== null && !isWebUrl(evidence_url)) return { error: "The evidence link must start with http:// or https://" };
    return {
        vendor, mechanism, mechanism_confirmed_at, dpa_status, evidence_url,
        owner: String(body.owner ?? "").trim().slice(0, MAX_OWNER),
        notes: String(body.notes ?? "").trim().slice(0, MAX_NOTES),
    };
}

function isDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isWebUrl(value) {
    try {
        return value.length <= MAX_URL && ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
        return false;
    }
}

/** Decoded upload, or { error } when it isn't a file we keep. */
export function validateEvidence(body) {
    const vendor = String(body?.vendor ?? "").trim();
    if (!vendor || vendor.length > MAX_VENDOR) return { error: "A vendor is required" };
    if (!EVIDENCE_TYPES.has(body.content_type)) return { error: "Upload a PDF, PNG or JPEG file" };
    const data = Buffer.from(String(body.data ?? ""), "base64");
    if (!data.length) return { error: "The file is empty" };
    if (data.length > MAX_EVIDENCE_BYTES) return { error: "The file is larger than 3 MB" };
    const filename = String(body.filename ?? "evidence").replace(/[^\w.-]+/g, "_").slice(-100) || "evidence";
    return { vendor, data, filename, contentType: body.content_type };
}

/** Private store path: scoped to the organisation, so one can never name another's file. */
export function evidencePath(organisationId, vendor, filename, now = Date.now()) {
    return `vendor-evidence/${organisationId}/${createHash("sha256").update(vendor).digest("hex").slice(0, 32)}/${now}-${filename}`;
}

export async function listRecords(db, organisationId) {
    const { rows } = await db.query(
        `SELECT vendor, ${RECORD_COLUMNS} FROM vendor_compliance WHERE organisation_id = $1`,
        [organisationId]
    );
    return Object.fromEntries(rows.map(({ vendor, ...record }) => [vendor, record]));
}

export async function saveRecord(db, organisationId, { vendor, mechanism, mechanism_confirmed_at, dpa_status, owner = "", notes, evidence_url = null }) {
    if (!mechanism && !mechanism_confirmed_at && (!dpa_status || dpa_status === "unknown") && !owner && !notes && !evidence_url) {
        // A record holding an uploaded file stays, so the file isn't orphaned.
        const { rows: deleted } = await db.query(
            `DELETE FROM vendor_compliance WHERE organisation_id = $1 AND vendor = $2 AND evidence_blob_path IS NULL RETURNING vendor`,
            [organisationId, vendor]
        );
        if (deleted.length) return null;
        const { rows: kept } = await db.query(`SELECT 1 FROM vendor_compliance WHERE organisation_id = $1 AND vendor = $2`, [organisationId, vendor]);
        if (!kept.length) return null;
    }
    const { rows } = await db.query(
        `INSERT INTO vendor_compliance (organisation_id, vendor, mechanism, mechanism_confirmed_at, dpa_status, owner, notes, evidence_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (organisation_id, vendor) DO UPDATE
            SET mechanism = EXCLUDED.mechanism, mechanism_confirmed_at = EXCLUDED.mechanism_confirmed_at, dpa_status = EXCLUDED.dpa_status,
                owner = EXCLUDED.owner, notes = EXCLUDED.notes, evidence_url = EXCLUDED.evidence_url, updated_at = NOW()
         RETURNING ${RECORD_COLUMNS}`,
        [organisationId, vendor, mechanism, mechanism_confirmed_at, dpa_status, owner, notes, evidence_url]
    );
    return rows[0];
}

async function evidenceBlobPath(db, organisationId, vendor) {
    const { rows } = await db.query(`SELECT evidence_blob_path FROM vendor_compliance WHERE organisation_id = $1 AND vendor = $2`, [organisationId, vendor]);
    return rows[0]?.evidence_blob_path || null;
}

async function uploadEvidence(db, organisationId, { vendor, data, filename, contentType }) {
    const { put, del } = await import("@vercel/blob");
    const previous = await evidenceBlobPath(db, organisationId, vendor);
    const path = evidencePath(organisationId, vendor, filename);
    await put(path, data, { access: "private", contentType, addRandomSuffix: false });
    const { rows } = await db.query(
        `INSERT INTO vendor_compliance (organisation_id, vendor, evidence_blob_path)
         VALUES ($1, $2, $3)
         ON CONFLICT (organisation_id, vendor) DO UPDATE SET evidence_blob_path = EXCLUDED.evidence_blob_path, updated_at = NOW()
         RETURNING ${RECORD_COLUMNS}`,
        [organisationId, vendor, path]
    );
    if (previous) await del(previous).catch((err) => console.error("[vendor-compliance] old evidence not removed:", err.message));
    return rows[0];
}

async function deleteEvidence(db, organisationId, vendor) {
    const path = await evidenceBlobPath(db, organisationId, vendor);
    if (path) {
        const { del } = await import("@vercel/blob");
        await del(path);
    }
    const { rows } = await db.query(
        `UPDATE vendor_compliance SET evidence_blob_path = NULL, updated_at = NOW() WHERE organisation_id = $1 AND vendor = $2 RETURNING ${RECORD_COLUMNS}`,
        [organisationId, vendor]
    );
    return rows[0] || null;
}

async function sendEvidence(res, db, organisationId, vendor) {
    const path = await evidenceBlobPath(db, organisationId, vendor);
    if (!path) return res.status(404).json({ error: "No evidence file for this vendor" });
    const { get } = await import("@vercel/blob");
    const result = await get(path, { access: "private" });
    if (!result?.stream) return res.status(404).json({ error: "No evidence file for this vendor" });
    res.setHeader("Content-Type", result.blob?.contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${path.split("/").pop()}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    return Readable.fromWeb(result.stream).pipe(res);
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET" && req.method !== "POST") {
        res.setHeader("Allow", "GET, POST, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    }
    const member = await requireMember(req);
    if (member.error) return res.status(member.status).json({ error: member.error });
    const { organisationId } = member;

    try {
        const db = getPool();
        await ensureTable(db);
        if (req.method === "GET") {
            if (req.query?.evidence) return await sendEvidence(res, db, organisationId, String(req.query.evidence));
            return res.json({ records: await listRecords(db, organisationId) });
        }
        if (req.body?.action === "upload_evidence") {
            const upload = validateEvidence(req.body);
            if (upload.error) return res.status(400).json({ error: upload.error });
            return res.json({ record: await uploadEvidence(db, organisationId, upload) });
        }
        if (req.body?.action === "delete_evidence") {
            return res.json({ record: await deleteEvidence(db, organisationId, String(req.body.vendor ?? "").trim()) });
        }
        const record = validateRecord(req.body);
        if (record.error) return res.status(400).json({ error: record.error });
        return res.json({ record: await saveRecord(db, organisationId, record) });
    } catch (err) {
        console.error("[vendor-compliance]", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
