/**
 * /api/admin-cookie-discoveries
 *
 * Internal admin API — accessible to organisation 1 only.
 *
 * GET  → { discoveries: [...], definitions: [...] }
 *
 * POST body { action: "promote", name, is_prefix, vendor, category,
 *             description, privacy_url, legal_basis, transfer_mechanism }
 *      → Inserts/upserts into cookie_definitions, marks discovery as promoted
 *
 * POST body { action: "dismiss", name }
 *      → Marks discovery as dismissed
 *
 * POST body { action: "delete_definition", name }
 *      → Removes entry from cookie_definitions
 *
 * Auth: requires Authorization header (user token) + Organisation: "1" header.
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

function requireAdminOrg(req, res) {
    const org  = req.headers["organisation"] || req.headers["Organization"];
    const auth = req.headers["authorization"];
    if (!auth || String(org) !== "1") {
        res.status(403).json({ error: "Forbidden — admin org only" });
        return false;
    }
    return true;
}

async function ensureSchema(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS cookie_definitions (
            name               TEXT        PRIMARY KEY,
            is_prefix          BOOLEAN     NOT NULL DEFAULT FALSE,
            vendor             TEXT,
            category           TEXT,
            description        TEXT,
            privacy_url        TEXT,
            legal_basis        TEXT,
            transfer_mechanism TEXT,
            promoted_by_org    INTEGER,
            promoted_at        TIMESTAMPTZ DEFAULT NOW()
        )
    `).catch(() => {});

    await db.query(`
        ALTER TABLE cookie_discoveries
            ADD COLUMN IF NOT EXISTS status             TEXT    DEFAULT 'pending',
            ADD COLUMN IF NOT EXISTS cookie_domains     TEXT[]  DEFAULT '{}',
            ADD COLUMN IF NOT EXISTS enriched_vendor    TEXT,
            ADD COLUMN IF NOT EXISTS enriched_category  TEXT,
            ADD COLUMN IF NOT EXISTS enriched_description TEXT,
            ADD COLUMN IF NOT EXISTS enriched_source    TEXT
    `).catch(() => {});
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "https://platform.intastellarconsents.com");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Organisation");

    if (req.method === "OPTIONS") return res.status(204).end();
    if (!requireAdminOrg(req, res)) return;

    const db = getPool();
    await ensureSchema(db);

    // ── GET — list all discoveries + promoted definitions ──────────────────────
    if (req.method === "GET") {
        const [discRes, defRes] = await Promise.all([
            db.query(`
                SELECT name, times_seen, first_seen_at, last_seen_at,
                       example_sites, cookie_domains,
                       has_vendor, has_category,
                       enriched_vendor, enriched_category,
                       enriched_description, enriched_source,
                       status
                  FROM cookie_discoveries
                 WHERE status != 'dismissed'
                 ORDER BY times_seen DESC, last_seen_at DESC
            `),
            db.query(`
                SELECT name, is_prefix, vendor, category, description,
                       privacy_url, legal_basis, transfer_mechanism, promoted_at
                  FROM cookie_definitions
                 ORDER BY promoted_at DESC
            `),
        ]);

        return res.json({
            discoveries: discRes.rows,
            definitions: defRes.rows,
        });
    }

    // ── POST — actions ─────────────────────────────────────────────────────────
    if (req.method === "POST") {
        const { action, name } = req.body ?? {};
        if (!action || !name) {
            return res.status(400).json({ error: "action and name are required" });
        }

        // Promote discovery → cookie_definitions
        if (action === "promote") {
            const { is_prefix = false, vendor, category, description,
                    privacy_url, legal_basis, transfer_mechanism } = req.body;

            await db.query(`
                INSERT INTO cookie_definitions
                    (name, is_prefix, vendor, category, description,
                     privacy_url, legal_basis, transfer_mechanism, promoted_by_org)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)
                ON CONFLICT (name) DO UPDATE SET
                    is_prefix          = EXCLUDED.is_prefix,
                    vendor             = EXCLUDED.vendor,
                    category           = EXCLUDED.category,
                    description        = EXCLUDED.description,
                    privacy_url        = EXCLUDED.privacy_url,
                    legal_basis        = EXCLUDED.legal_basis,
                    transfer_mechanism = EXCLUDED.transfer_mechanism,
                    promoted_at        = NOW()
            `, [name, !!is_prefix, vendor || null, category || null,
                description || null, privacy_url || null,
                legal_basis || null, transfer_mechanism || null]);

            await db.query(
                `UPDATE cookie_discoveries SET status = 'promoted' WHERE name = $1`,
                [name]
            );

            return res.json({ ok: true, action: "promoted", name });
        }

        // Dismiss discovery
        if (action === "dismiss") {
            await db.query(
                `UPDATE cookie_discoveries SET status = 'dismissed' WHERE name = $1`,
                [name]
            );
            return res.json({ ok: true, action: "dismissed", name });
        }

        // Delete a promoted definition (reverts to discoverable again)
        if (action === "delete_definition") {
            await db.query(`DELETE FROM cookie_definitions WHERE name = $1`, [name]);
            await db.query(
                `UPDATE cookie_discoveries SET status = 'pending' WHERE name = $1`,
                [name]
            );
            return res.json({ ok: true, action: "deleted_definition", name });
        }

        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
}
