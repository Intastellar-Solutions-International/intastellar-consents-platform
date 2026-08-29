import { getPool } from "./_db.js";
/**
 * POST /api/ropa-update
 * Body: { id, activityName, controllerName, ... }
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

function cleanDomain(raw) {
    if (!raw) return null;
    return raw.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] || null;
}

function rowToEntry(row) {
    return {
        id:                     row.id,
        domain:                 row.domain,
        activityName:           row.activity_name,
        controllerName:         row.controller_name,
        controllerContact:      row.controller_contact,
        dpoContact:             row.dpo_contact,
        purpose:                row.purpose,
        framework:              row.framework,
        legalBasis:             row.legal_basis,
        dataSubjectCategories:  row.data_subject_categories || [],
        dataCategories:         row.data_categories || [],
        recipients:             row.recipients || [],
        thirdCountryTransfers:  row.third_country_transfers || [],
        retentionPeriod:        row.retention_period,
        securityMeasures:       row.security_measures,
        isDraft:                row.is_draft,
        source:                 row.source,
        createdAt:              row.created_at,
        updatedAt:              row.updated_at,
    };
}

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

    const e = req.body || {};
    const id = parseInt(e.id, 10);
    if (!id) return res.status(400).json({ error: "Missing id" });

    try {
        const db = getPool();
        await ensureTable(db);
        const { rows } = await db.query(
            `UPDATE ropa_entries SET
               domain                  = $1,
               activity_name           = $2,
               controller_name         = $3,
               controller_contact      = $4,
               dpo_contact             = $5,
               purpose                 = $6,
               framework               = $7,
               legal_basis             = $8,
               data_subject_categories = $9,
               data_categories         = $10,
               recipients              = $11,
               third_country_transfers = $12,
               retention_period        = $13,
               security_measures       = $14,
               is_draft                = $15,
               updated_at              = NOW()
             WHERE id = $16 AND organisation_id = $17
             RETURNING *`,
            [
                cleanDomain(e.domain) || null,
                e.activityName      || "Untitled activity",
                e.controllerName    || "",
                e.controllerContact || "",
                e.dpoContact        || "",
                e.purpose           || "analytics",
                e.framework         || "GDPR",
                e.legalBasis        || "",
                JSON.stringify(e.dataSubjectCategories || []),
                JSON.stringify(e.dataCategories        || []),
                JSON.stringify(e.recipients            || []),
                JSON.stringify(e.thirdCountryTransfers || []),
                e.retentionPeriod   || "",
                e.securityMeasures  || "",
                e.isDraft === true,
                id,
                organisationId,
            ]
        );

        if (!rows.length) return res.status(404).json({ error: "Entry not found" });
        return res.json({ ok: true, entry: rowToEntry(rows[0]) });
    } catch (err) {
        console.error("[ropa-update] Error:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
