/**
 * GET /api/cron-ab-test-lifecycle  (invoked by Vercel Cron, daily at 06:00 UTC)
 *
 * Flips expired Page Experiments from 'running' to 'completed'. This is a
 * cosmetic cleanup only — the actual stopping of live traffic is enforced
 * instantly and independently by lazy expiration checks in
 * api/ab-test-active.js (the visitor-facing lookup) and api/a.js (the
 * exposure-write validation), both of which already treat a test with a
 * past ends_at as not-running regardless of what this row's `status`
 * column still says. A day's delay here before the dashboard reflects
 * "Completed" is harmless.
 */

import pkg from "pg";
const { Pool } = pkg;

let pool;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 2,
        });
    }
    return pool;
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
    await db.query(`ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ`).catch(() => {});
}

export default async function handler(req, res) {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const db = getPool();
    await ensureTables(db);

    try {
        const { rowCount } = await db.query(`
            UPDATE ab_tests SET status = 'completed', updated_at = NOW()
            WHERE status = 'running' AND ends_at IS NOT NULL AND ends_at <= NOW()
        `);

        return res.json({ completed: rowCount });
    } catch (err) {
        console.error("[cron-ab-test-lifecycle] error:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
