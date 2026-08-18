/**
 * GET /api/ab-test-results?testId=<id>
 *
 * Per-variant results for a Page Experiment: exposures, unique sessions,
 * and — only if the test has a goal event set — conversions/conversionRate
 * against that event, reusing the existing conversion-tracking pipeline
 * (analytics_custom_events, the same table window.intaAnalytics.track()
 * writes to) rather than building a parallel one.
 *
 * A conversion only counts if it happened at-or-after the session's first
 * exposure to that variant — pre-existing behavior from before a visitor
 * ever saw a variant shouldn't be attributed to it.
 *
 * Requires headers: Authorization: Bearer <token>   Organisation: <org_id>
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
    "https://www.consentsmanagement.com",
    "https://analytics.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Organisation,Content-Type");
}

function validateJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const decoded = Buffer.from(match[1], "base64").toString("utf8");
        const parts = decoded.split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if (payload.iss !== "Intastellar Account") return null;
        if ((payload.nbf && payload.nbf > now) || (payload.exp && payload.exp < now)) return null;
        return payload;
    } catch { return null; }
}

// Defensive re-declaration of tables this file queries but doesn't own —
// same duplication convention as api/ab-test-proxy.js / api/a.js.
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
    await db.query(`ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS goal_event_name VARCHAR(64)`).catch(() => {});
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
    await db.query(`
        CREATE TABLE IF NOT EXISTS ab_test_assignments (
            id          BIGSERIAL   PRIMARY KEY,
            test_id     BIGINT      NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
            variant_id  BIGINT      NOT NULL REFERENCES ab_test_variants(id) ON DELETE CASCADE,
            domain      TEXT        NOT NULL,
            session_id  VARCHAR(64) NOT NULL,
            assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `).catch(() => {});
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const testId = parseInt(req.query.testId || "", 10);
    if (!testId) return res.status(400).json({ error: "testId is required" });

    const db = getPool();
    await ensureTables(db);

    const { rows: testRows } = await db.query(
        `SELECT id, domain, goal_event_name FROM ab_tests WHERE id = $1 AND organisation_id = $2 LIMIT 1`,
        [testId, orgId]
    ).catch(() => ({ rows: [] }));
    if (!testRows.length) return res.status(404).json({ error: "Test not found" });

    const test = testRows[0];
    const goalEventName = test.goal_event_name || null;

    // A Page Experiment doesn't require a first-party analytics site key to
    // exist (see api/ab-tests.js's own doc comment) — if one was never
    // generated for this domain, conversions simply aren't available,
    // handled the same as "no goal set" below, not as an error.
    const { rows: siteRows } = await db.query(
        `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND domain = $2 AND active = true LIMIT 1`,
        [orgId, test.domain]
    ).catch(() => ({ rows: [] }));
    const siteId = siteRows[0]?.id || null;

    const hasGoal = !!goalEventName && !!siteId;

    const { rows } = await db.query(
        `WITH exposures AS (
            SELECT variant_id, session_id, MIN(assigned_at) AS first_assigned_at, COUNT(*) AS exposure_count
            FROM ab_test_assignments
            WHERE test_id = $1
            GROUP BY variant_id, session_id
         )
         SELECT
             v.id AS variant_id, v.variant_key, v.label, v.is_control,
             COALESCE(SUM(e.exposure_count), 0) AS exposures,
             COUNT(DISTINCT e.session_id) AS unique_sessions,
             COUNT(DISTINCT e.session_id) FILTER (
                 WHERE $2::text IS NOT NULL AND $3::text IS NOT NULL AND EXISTS (
                     SELECT 1 FROM analytics_custom_events ce
                     WHERE ce.site_id = $3 AND ce.session_id = e.session_id
                       AND ce.name = $2 AND ce.received_at >= e.first_assigned_at
                 )
             ) AS converted_sessions
         FROM ab_test_variants v
         LEFT JOIN exposures e ON e.variant_id = v.id
         WHERE v.test_id = $1
         GROUP BY v.id, v.variant_key, v.label, v.is_control
         ORDER BY v.is_control DESC, v.id ASC`,
        [testId, goalEventName, siteId]
    ).catch(() => ({ rows: [] }));

    return res.status(200).json({
        test: { id: test.id, domain: test.domain, goalEventName },
        variants: rows.map(r => {
            const uniqueSessions = Number(r.unique_sessions || 0);
            const conversions = hasGoal ? Number(r.converted_sessions || 0) : null;
            const conversionRate = !hasGoal || uniqueSessions === 0 ? null : conversions / uniqueSessions;
            return {
                variantId: r.variant_id, variantKey: r.variant_key, label: r.label, isControl: r.is_control,
                exposures: Number(r.exposures || 0), uniqueSessions, conversions, conversionRate,
            };
        }),
    });
}
