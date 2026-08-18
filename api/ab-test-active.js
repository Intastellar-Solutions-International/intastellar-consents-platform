/**
 * GET /api/ab-test-active?site=<siteKey>&path=<pathname>
 *
 * Public, unauthenticated — same trust model as GET /api/a and
 * analytics-site-config.js (the site key is already embeddable/public).
 * Read by the embed script UNCONDITIONALLY on every pageload, regardless of
 * consent tier — variant application is rendering, not tracking, so it has
 * to work for every visitor. Only the exposure record (POST /api/a, t:'ab')
 * is consent-gated. This is why this is a separate endpoint rather than an
 * extension of analytics-site-config.js, which is only ever fetched for
 * full-consent visitors (via bootstrapSiteFeatures()).
 *
 * Degrades to `{ test: null }` on any bad input or DB error — this fires on
 * every pageload across every customer site, so it must never surface as a
 * client-visible failure.
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
            connectionTimeoutMillis: 5000,
        });
    }
    return pool;
}

// Strips a single trailing slash (but never the bare root) so a test saved
// as "/pricing" still matches a visit to "/pricing/" — same normalization
// applied to targetPath on write in api/ab-tests.js.
function normalizePath(p) {
    if (typeof p !== "string" || !p.startsWith("/")) return "/";
    if (p.length > 2000) return "/";
    return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

async function ensureTables(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS ab_tests (
            id               BIGSERIAL    PRIMARY KEY,
            organisation_id  INTEGER      NOT NULL,
            domain           TEXT         NOT NULL,
            name             VARCHAR(120) NOT NULL,
            target_path      TEXT         NOT NULL DEFAULT '/',
            status           VARCHAR(16)  NOT NULL DEFAULT 'draft',
            created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
    `).catch(() => {});
    await db.query(`ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS traffic_split JSONB NOT NULL DEFAULT '{}'`).catch(() => {});
    await db.query(`ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ`).catch(() => {});
    await db.query(`
        CREATE TABLE IF NOT EXISTS ab_test_variants (
            id               BIGSERIAL    PRIMARY KEY,
            test_id          BIGINT       NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
            variant_key      VARCHAR(64)  NOT NULL,
            label            VARCHAR(120),
            is_control       BOOLEAN      NOT NULL DEFAULT false,
            changes          JSONB        NOT NULL DEFAULT '[]',
            created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            UNIQUE (test_id, variant_key)
        )
    `).catch(() => {});
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).end();

    const siteId = String(req.query.site || "").slice(0, 32);
    if (!siteId) return res.status(400).end();

    const path = normalizePath(String(req.query.path || "/"));

    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

    const db = getPool();
    await ensureTables(db);

    try {
        const { rows: siteRows } = await db.query(
            `SELECT domain FROM analytics_sites WHERE id = $1 AND active = true LIMIT 1`,
            [siteId]
        ).catch(() => ({ rows: [] }));
        if (!siteRows.length) return res.status(200).json({ test: null });

        const domain = siteRows[0].domain;

        const { rows } = await db.query(
            `SELECT t.id, t.target_path, t.traffic_split,
                    v.id AS variant_id, v.variant_key, v.is_control, v.changes
             FROM ab_tests t
             JOIN ab_test_variants v ON v.test_id = t.id
             WHERE t.domain = $1 AND t.status = 'running' AND t.target_path = $2
               AND (t.ends_at IS NULL OR t.ends_at > NOW())
             ORDER BY t.updated_at DESC, v.is_control DESC, v.id ASC`,
            [domain, path]
        ).catch(() => ({ rows: [] }));

        if (!rows.length) return res.status(200).json({ test: null });

        // Defensive against the partial-unique-index invariant somehow not
        // holding (e.g. mid-migration) — keep only the first test.id seen.
        const testId = rows[0].id;
        const variantRows = rows.filter(r => r.id === testId);

        const split = variantRows[0].traffic_split || {};
        const hasValidSplit = variantRows.every(r => {
            const w = split[r.variant_key];
            return typeof w === "number" && isFinite(w) && w >= 0;
        }) && variantRows.some(r => Number(split[r.variant_key]) > 0);

        let variants;
        if (hasValidSplit) {
            const total = variantRows.reduce((s, r) => s + Number(split[r.variant_key]), 0);
            variants = variantRows.map(r => ({
                id: r.variant_id, variantKey: r.variant_key, isControl: r.is_control,
                changes: r.changes, weight: Number(split[r.variant_key]) / total,
            }));
        } else {
            const equal = 1 / variantRows.length;
            variants = variantRows.map(r => ({
                id: r.variant_id, variantKey: r.variant_key, isControl: r.is_control,
                changes: r.changes, weight: equal,
            }));
        }

        return res.status(200).json({
            test: { id: testId, targetPath: variantRows[0].target_path, variants },
        });
    } catch {
        return res.status(200).json({ test: null });
    }
}
