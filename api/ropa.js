/**
 * GET  /api/ropa          — list all RoPA entries for the organisation
 * GET  /api/ropa?id=123   — get a single entry
 * POST /api/ropa          — create one or more entries (body: entry | { entries: [] })
 * POST /api/ropa?action=auto-populate — seed draft entries from pre-consent scan data
 *
 * Headers:
 *   Authorization  Bearer <token>
 *   Organisation   <organisation_id>
 *
 * Table DDL (run once in Neon console):
 *
 *   CREATE TABLE IF NOT EXISTS ropa_entries (
 *     id                      SERIAL PRIMARY KEY,
 *     organisation_id         INTEGER NOT NULL,
 *     activity_name           TEXT NOT NULL,
 *     controller_name         TEXT DEFAULT '',
 *     controller_contact      TEXT DEFAULT '',
 *     dpo_contact             TEXT DEFAULT '',
 *     purpose                 TEXT DEFAULT 'analytics',
 *     framework               TEXT DEFAULT 'GDPR',
 *     legal_basis             TEXT DEFAULT '',
 *     data_subject_categories JSONB DEFAULT '[]',
 *     data_categories         JSONB DEFAULT '[]',
 *     recipients              JSONB DEFAULT '[]',
 *     third_country_transfers JSONB DEFAULT '[]',
 *     retention_period        TEXT DEFAULT '',
 *     security_measures       TEXT DEFAULT '',
 *     is_draft                BOOLEAN DEFAULT false,
 *     source                  TEXT DEFAULT 'manual',
 *     created_at              TIMESTAMPTZ DEFAULT NOW(),
 *     updated_at              TIMESTAMPTZ DEFAULT NOW()
 *   );
 *   CREATE INDEX IF NOT EXISTS ropa_entries_org_idx ON ropa_entries(organisation_id);
 */

import pkg from "pg";
const { Pool } = pkg;

let pool;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 3,
        });
    }
    return pool;
}

const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

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
        if (payload.iss !== "Intastellar Account" || (payload.nbf || 0) > now || (payload.exp || 0) < now) return null;
        return payload;
    } catch {
        return null;
    }
}

function rowToEntry(row) {
    return {
        id:                     row.id,
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

async function insertEntry(db, organisationId, e) {
    const { rows } = await db.query(
        `INSERT INTO ropa_entries
           (organisation_id, activity_name, controller_name, controller_contact, dpo_contact,
            purpose, framework, legal_basis, data_subject_categories, data_categories,
            recipients, third_country_transfers, retention_period, security_measures,
            is_draft, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING *`,
        [
            organisationId,
            e.activityName     || "Untitled activity",
            e.controllerName   || "",
            e.controllerContact|| "",
            e.dpoContact       || "",
            e.purpose          || "analytics",
            e.framework        || "GDPR",
            e.legalBasis       || "",
            JSON.stringify(e.dataSubjectCategories || []),
            JSON.stringify(e.dataCategories        || []),
            JSON.stringify(e.recipients            || []),
            JSON.stringify(e.thirdCountryTransfers || []),
            e.retentionPeriod  || "",
            e.securityMeasures || "",
            e.isDraft === true,
            e.source           || "manual",
        ]
    );
    return rows[0];
}

async function handleAutoPopulate(db, organisationId, res) {
    // Get the latest scan per domain for this org
    const { rows: scans } = await db.query(
        `SELECT DISTINCT ON (domain) domain, transfers
           FROM pre_consent_scans
          WHERE organisation_id = $1
            AND scanned_at > NOW() - INTERVAL '30 days'
          ORDER BY domain, scanned_at DESC`,
        [organisationId]
    );

    if (!scans.length) {
        return res.status(200).json({ created: 0, message: "No recent scans found for this organisation." });
    }

    // Collect unique services across all scans
    const serviceMap = new Map();
    for (const scan of scans) {
        const transfers = Array.isArray(scan.transfers) ? scan.transfers : [];
        for (const t of transfers) {
            const name = (t.service || t.host || "Unknown processor").trim();
            if (serviceMap.has(name)) continue;
            const isNonEu = (t.dataRegion || "").toLowerCase() !== "eu" && t.dataCountry;
            serviceMap.set(name, {
                activityName:          name,
                purpose:               t.category || "analytics",
                recipients:            [{ name, host: t.host || "" }],
                thirdCountryTransfers: isNonEu ? [{ country: t.dataCountry, mechanism: "SCC" }] : [],
                isDraft:               true,
                source:                "scan",
            });
        }
    }

    if (!serviceMap.size) {
        return res.status(200).json({ created: 0, message: "No services detected in recent scan data." });
    }

    // Skip services that already have a RoPA entry
    const { rows: existing } = await db.query(
        `SELECT activity_name FROM ropa_entries WHERE organisation_id = $1`,
        [organisationId]
    );
    const existingNames = new Set(existing.map((r) => r.activity_name));
    const toCreate = [...serviceMap.values()].filter((e) => !existingNames.has(e.activityName));

    if (!toCreate.length) {
        return res.status(200).json({ created: 0, message: "All detected services already have RoPA entries." });
    }

    const created = [];
    for (const e of toCreate) {
        const row = await insertEntry(db, organisationId, e);
        created.push(rowToEntry(row));
    }

    return res.status(201).json({ created: created.length, entries: created });
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    if (!validateJwt(req.headers["authorization"])) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const organisationId = parseInt(req.headers["organisation"] || "0", 10);
    if (!organisationId) return res.status(400).json({ error: "Missing Organisation header" });

    const db = getPool();

    try {
        if (req.method === "GET") {
            const id = req.query.id ? parseInt(req.query.id, 10) : null;
            if (id) {
                const { rows } = await db.query(
                    `SELECT * FROM ropa_entries WHERE id = $1 AND organisation_id = $2`,
                    [id, organisationId]
                );
                if (!rows.length) return res.status(404).json({ error: "Entry not found" });
                return res.json(rowToEntry(rows[0]));
            }
            const { rows } = await db.query(
                `SELECT * FROM ropa_entries WHERE organisation_id = $1 ORDER BY created_at DESC`,
                [organisationId]
            );
            return res.json(rows.map(rowToEntry));
        }

        if (req.method === "POST") {
            if (req.query.action === "auto-populate") {
                return await handleAutoPopulate(db, organisationId, res);
            }
            const body = req.body || {};
            const entries = Array.isArray(body.entries) ? body.entries : [body];
            const created = [];
            for (const e of entries) {
                created.push(rowToEntry(await insertEntry(db, organisationId, e)));
            }
            return res.status(201).json(created.length === 1 ? created[0] : created);
        }

        res.setHeader("Allow", "GET, POST, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("[ropa] Error:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
