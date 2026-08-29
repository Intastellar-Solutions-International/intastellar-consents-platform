import { getPool } from "./_db.js";
/**
 * POST /api/ropa-export
 * Returns a CSV file of all RoPA entries for the organisation.
 *
 * Headers:
 *   Authorization  Bearer <token>
 *   Organisation   <organisation_id>
 */
let tableReady = false;
async function ensureTable(db) {
    if (tableReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS ropa_entries (
            id                      SERIAL PRIMARY KEY,
            organisation_id         INTEGER NOT NULL,
            activity_name           TEXT NOT NULL,
            controller_name         TEXT DEFAULT '',
            controller_contact      TEXT DEFAULT '',
            dpo_contact             TEXT DEFAULT '',
            purpose                 TEXT DEFAULT 'analytics',
            framework               TEXT DEFAULT 'GDPR',
            legal_basis             TEXT DEFAULT '',
            data_subject_categories JSONB DEFAULT '[]',
            data_categories         JSONB DEFAULT '[]',
            recipients              JSONB DEFAULT '[]',
            third_country_transfers JSONB DEFAULT '[]',
            retention_period        TEXT DEFAULT '',
            security_measures       TEXT DEFAULT '',
            is_draft                BOOLEAN DEFAULT false,
            source                  TEXT DEFAULT 'manual',
            created_at              TIMESTAMPTZ DEFAULT NOW(),
            updated_at              TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    await db.query(`ALTER TABLE ropa_entries ADD COLUMN IF NOT EXISTS domain VARCHAR(255) DEFAULT NULL`);
    await db.query(`CREATE INDEX IF NOT EXISTS ropa_entries_org_idx ON ropa_entries(organisation_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS ropa_entries_domain_idx ON ropa_entries(domain)`);
    tableReady = true;
}

const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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

function csvEscape(value) {
    if (value == null) return "";
    const str = String(value);
    if (str.includes('"') || str.includes(",") || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function jsonArrayToText(val) {
    if (!Array.isArray(val)) return "";
    return val.map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "object" && item !== null) {
            return Object.values(item).filter(Boolean).join(" / ");
        }
        return String(item);
    }).join("; ");
}

const CSV_HEADERS = [
    "ID",
    "Domain",
    "Activity Name",
    "Controller Name",
    "Controller Contact",
    "DPO Contact",
    "Purpose",
    "Framework",
    "Legal Basis",
    "Data Subject Categories",
    "Data Categories",
    "Recipients",
    "Third Country Transfers",
    "Retention Period",
    "Security Measures",
    "Draft",
    "Source",
    "Created At",
    "Updated At",
];

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    }

    if (!validateJwt(req.headers["authorization"])) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const organisationId = parseInt(req.headers["organisation"] || "0", 10);
    if (!organisationId) return res.status(400).json({ error: "Missing Organisation header" });

    try {
        const db = getPool();
        await ensureTable(db);
        const { rows } = await db.query(
            `SELECT * FROM ropa_entries WHERE organisation_id = $1 ORDER BY created_at DESC`,
            [organisationId]
        );

        const lines = [CSV_HEADERS.map(csvEscape).join(",")];
        for (const row of rows) {
            lines.push([
                csvEscape(row.id),
                csvEscape(row.domain || ""),
                csvEscape(row.activity_name),
                csvEscape(row.controller_name),
                csvEscape(row.controller_contact),
                csvEscape(row.dpo_contact),
                csvEscape(row.purpose),
                csvEscape(row.framework),
                csvEscape(row.legal_basis),
                csvEscape(jsonArrayToText(row.data_subject_categories)),
                csvEscape(jsonArrayToText(row.data_categories)),
                csvEscape(jsonArrayToText(row.recipients)),
                csvEscape(jsonArrayToText(row.third_country_transfers)),
                csvEscape(row.retention_period),
                csvEscape(row.security_measures),
                csvEscape(row.is_draft ? "Yes" : "No"),
                csvEscape(row.source),
                csvEscape(row.created_at ? new Date(row.created_at).toISOString() : ""),
                csvEscape(row.updated_at ? new Date(row.updated_at).toISOString() : ""),
            ].join(","));
        }

        const csv = lines.join("\r\n");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="ropa-export-${new Date().toISOString().slice(0, 10)}.csv"`);
        return res.status(200).send(csv);
    } catch (err) {
        console.error("[ropa-export] Error:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
