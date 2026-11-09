import { getPool } from "./_db.js";

/**
 * /api/vendor-compliance — what an organisation has recorded about each
 * vendor for GDPR Chapter V: the transfer mechanism and whether a DPA exists.
 * A contract is with the organisation, so records apply across its domains.
 *
 * GET   → { records: { [vendor]: { mechanism, dpa_status, notes, updated_at } } }
 * POST  { vendor, mechanism, dpa_status, notes } → saves; all empty clears it
 *
 * Headers: Authorization (Bearer), Organisation
 */
const MECHANISMS = new Set(["dpf", "sccs", "adequacy", "bcr", "none"]);
const DPA_STATES = new Set(["signed", "missing"]);
const MAX_VENDOR = 255;
const MAX_NOTES = 1000;
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
    tableReady = true;
}

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
}

function validateJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const parts = Buffer.from(match[1], "base64").toString("utf8").split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if ((payload.exp && payload.exp < now) || (payload.nbf && payload.nbf > now)) return null;
        return payload;
    } catch {
        return null;
    }
}

/** Cleaned record, or { error } when a value isn't one we accept. */
export function validateRecord(body) {
    const vendor = String(body?.vendor ?? "").trim();
    if (!vendor || vendor.length > MAX_VENDOR) return { error: "A vendor is required" };
    const mechanism = body.mechanism || null;
    const dpa_status = body.dpa_status || null;
    if (mechanism !== null && !MECHANISMS.has(mechanism)) return { error: "Unknown transfer mechanism" };
    if (dpa_status !== null && !DPA_STATES.has(dpa_status)) return { error: "Unknown DPA status" };
    return { vendor, mechanism, dpa_status, notes: String(body.notes ?? "").trim().slice(0, MAX_NOTES) };
}

export async function listRecords(db, organisationId) {
    const { rows } = await db.query(
        `SELECT vendor, mechanism, dpa_status, notes, updated_at FROM vendor_compliance WHERE organisation_id = $1`,
        [organisationId]
    );
    return Object.fromEntries(rows.map(({ vendor, ...record }) => [vendor, record]));
}

export async function saveRecord(db, organisationId, { vendor, mechanism, dpa_status, notes }) {
    if (!mechanism && !dpa_status && !notes) {
        await db.query(`DELETE FROM vendor_compliance WHERE organisation_id = $1 AND vendor = $2`, [organisationId, vendor]);
        return null;
    }
    const { rows } = await db.query(
        `INSERT INTO vendor_compliance (organisation_id, vendor, mechanism, dpa_status, notes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (organisation_id, vendor) DO UPDATE
            SET mechanism = EXCLUDED.mechanism, dpa_status = EXCLUDED.dpa_status, notes = EXCLUDED.notes, updated_at = NOW()
         RETURNING mechanism, dpa_status, notes, updated_at`,
        [organisationId, vendor, mechanism, dpa_status, notes]
    );
    return rows[0];
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET" && req.method !== "POST") {
        res.setHeader("Allow", "GET, POST, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    }
    if (!validateJwt(req.headers.authorization)) return res.status(401).json({ error: "Unauthorized" });
    const organisationId = parseInt(req.headers.organisation || "0", 10);
    if (!organisationId) return res.status(400).json({ error: "Missing Organisation header" });

    try {
        const db = getPool();
        await ensureTable(db);
        if (req.method === "GET") return res.json({ records: await listRecords(db, organisationId) });
        const record = validateRecord(req.body);
        if (record.error) return res.status(400).json({ error: record.error });
        return res.json({ record: await saveRecord(db, organisationId, record) });
    } catch (err) {
        console.error("[vendor-compliance]", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
