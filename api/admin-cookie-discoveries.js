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
import { describeCookie, vendorFromCookieName, categoryFromCookieName } from "./_scan-core.js";

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
        CREATE TABLE IF NOT EXISTS cookie_discoveries (
            name             TEXT        PRIMARY KEY,
            times_seen       INTEGER     NOT NULL DEFAULT 1,
            first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            example_sites    TEXT[]      NOT NULL DEFAULT '{}',
            has_description  BOOLEAN     NOT NULL DEFAULT FALSE,
            has_vendor       BOOLEAN     NOT NULL DEFAULT FALSE,
            has_category     BOOLEAN     NOT NULL DEFAULT FALSE,
            status           TEXT                 DEFAULT 'pending',
            cookie_domains   TEXT[]               DEFAULT '{}',
            enriched_vendor  TEXT,
            enriched_category TEXT,
            enriched_description TEXT,
            enriched_source  TEXT
        )
    `).catch(() => {});

    // Add any columns that may be missing from older table versions
    await db.query(`
        ALTER TABLE cookie_discoveries
            ADD COLUMN IF NOT EXISTS status               TEXT    DEFAULT 'pending',
            ADD COLUMN IF NOT EXISTS cookie_domains       TEXT[]  DEFAULT '{}',
            ADD COLUMN IF NOT EXISTS enriched_vendor      TEXT,
            ADD COLUMN IF NOT EXISTS enriched_category    TEXT,
            ADD COLUMN IF NOT EXISTS enriched_description TEXT,
            ADD COLUMN IF NOT EXISTS enriched_source      TEXT
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
        try {
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
        } catch (err) {
            console.error("[admin-cookie-discoveries] GET error:", err.message);
            return res.status(500).json({ error: "Failed to load data", discoveries: [], definitions: [] });
        }
    }

    // ── POST — actions ─────────────────────────────────────────────────────────
    if (req.method === "POST") {
        const { action, name } = req.body ?? {};
        if (!action) {
            return res.status(400).json({ error: "action is required" });
        }

        // Backfill cookie_discoveries from historical pre_consent_scans
        if (action === "backfill") {
            try {
                const { rows: scans } = await db.query(`
                    SELECT domain, cookies
                      FROM pre_consent_scans
                     WHERE status = 'completed'
                       AND cookies IS NOT NULL
                       AND jsonb_array_length(cookies::jsonb) > 0
                     ORDER BY scanned_at DESC
                `);

                let scansProcessed = 0;
                let cookiesUpserted = 0;

                for (const scan of scans) {
                    const cookies = Array.isArray(scan.cookies) ? scan.cookies : [];
                    const unknown = cookies.filter(c =>
                        c.name &&
                        typeof c.name === "string" &&
                        c.name.length <= 100 &&
                        !describeCookie(c.name)
                    );
                    if (!unknown.length) continue;

                    for (const c of unknown) {
                        const hasVendor   = !!vendorFromCookieName(c.name);
                        const hasCategory = !!categoryFromCookieName(c.name);
                        const cookieDomain = c.domain ? c.domain.replace(/^\./, "") : null;

                        await db.query(`
                            INSERT INTO cookie_discoveries
                                (name, example_sites, cookie_domains, has_vendor, has_category)
                            VALUES ($1, ARRAY[$2::text], $3, $4, $5)
                            ON CONFLICT (name) DO UPDATE SET
                                times_seen     = cookie_discoveries.times_seen + 1,
                                last_seen_at   = NOW(),
                                has_vendor     = $4 OR cookie_discoveries.has_vendor,
                                has_category   = $5 OR cookie_discoveries.has_category,
                                example_sites  = CASE
                                    WHEN $2 = ANY(cookie_discoveries.example_sites)              THEN cookie_discoveries.example_sites
                                    WHEN array_length(cookie_discoveries.example_sites, 1) >= 10 THEN cookie_discoveries.example_sites
                                    ELSE array_append(cookie_discoveries.example_sites, $2::text)
                                END,
                                cookie_domains = CASE
                                    WHEN $6::text IS NULL                                               THEN cookie_discoveries.cookie_domains
                                    WHEN $6::text = ANY(cookie_discoveries.cookie_domains)              THEN cookie_discoveries.cookie_domains
                                    WHEN array_length(cookie_discoveries.cookie_domains, 1) >= 10 THEN cookie_discoveries.cookie_domains
                                    ELSE array_append(cookie_discoveries.cookie_domains, $6::text)
                                END
                        `, [c.name, scan.domain,
                            cookieDomain ? `{${cookieDomain}}` : '{}',
                            hasVendor, hasCategory, cookieDomain]);

                        cookiesUpserted++;
                    }
                    scansProcessed++;
                }

                console.log(`[admin-cookie-discoveries] backfill: ${scansProcessed} scans, ${cookiesUpserted} cookie upserts`);
                return res.json({ ok: true, action: "backfill", scansProcessed, cookiesUpserted });
            } catch (err) {
                console.error("[admin-cookie-discoveries] backfill error:", err.message);
                return res.status(500).json({ error: "Backfill failed: " + err.message });
            }
        }

        if (!name) {
            return res.status(400).json({ error: "name is required" });
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
