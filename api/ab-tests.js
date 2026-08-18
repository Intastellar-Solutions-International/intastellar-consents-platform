/**
 * GET    /api/ab-tests?domain=<domain>                        → list tests for a domain
 * GET    /api/ab-tests?domain=<domain>&testId=<id>             → single test + its variants (editor payload)
 * POST   /api/ab-tests   body: { domain, name, targetPath }    → create a test (auto-creates a "control" variant)
 * PATCH  /api/ab-tests?testId=<id>   body: { name?, targetPath?, status? } → update test metadata
 * DELETE /api/ab-tests?testId=<id>                             → delete a test (cascades its variants)
 *
 * Scoped by organisation_id + domain directly (not site_id / analytics_sites)
 * — a Page Experiment shouldn't require a first-party analytics site key to
 * already exist, same reasoning as ad_platform_connections.
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

const ALLOWED_STATUSES = new Set(["draft", "running", "paused", "archived"]);
const NAME_RE = /^.{1,120}$/;

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
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

// Blocks the target page path from being pointed off-domain (e.g. "//evil.com/x"
// or "https://evil.com") — the proxy builds a request URL from domain + this
// path, so an absolute/scheme-relative path here would let the proxy fetch
// an arbitrary third-party URL under the guise of "this org's test".
function isSafeTargetPath(p) {
    if (typeof p !== "string" || !p.startsWith("/") || p.startsWith("//")) return false;
    if (p.length > 512) return false;
    try { new URL(p, "https://example.com"); } catch { return false; }
    return true;
}

// Strips a single trailing slash (never the bare root) so a test saved as
// "/pricing" still matches a visit to "/pricing/" — api/ab-test-active.js
// applies the same normalization to the runtime lookup's path param.
function normalizeTargetPath(p) {
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
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ab_tests_org_domain ON ab_tests (organisation_id, domain)`).catch(() => {});
    await db.query(`ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS traffic_split JSONB NOT NULL DEFAULT '{}'`).catch(() => {});
    // Keeps "which test is active for this domain+path" a guaranteed fact
    // for the runtime lookup (api/ab-test-active.js) rather than a
    // coincidence — without this, two simultaneously-running tests on the
    // same path is silent undefined behavior for which variant a visitor
    // sees. The PATCH handler below catches the resulting 23505 and
    // returns 409 when launching a second test onto an already-active path.
    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ab_tests_one_running_per_path
        ON ab_tests (domain, target_path) WHERE status = 'running'
    `).catch(() => {});

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
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ab_variants_test ON ab_test_variants (test_id)`).catch(() => {});
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const db = getPool();
    await ensureTables(db);

    // Ownership check shared by every write below — a testId that exists but
    // belongs to a different organisation reads as "not found", not "forbidden",
    // same convention as resolveSiteId elsewhere in this codebase.
    async function loadOwnedTest(testId) {
        const { rows } = await db.query(
            `SELECT id, organisation_id, domain, name, target_path, status, created_at, updated_at
             FROM ab_tests WHERE id = $1 AND organisation_id = $2 LIMIT 1`,
            [testId, orgId]
        ).catch(() => ({ rows: [] }));
        return rows[0] || null;
    }

    // ── GET: list tests, or a single test + its variants ──────────────────────
    if (req.method === "GET") {
        const domain = (req.query.domain || "").trim().toLowerCase();
        if (!domain) return res.status(400).json({ error: "domain is required" });

        const testId = parseInt(req.query.testId || "", 10) || null;

        if (testId) {
            const test = await loadOwnedTest(testId);
            if (!test) return res.status(404).json({ error: "Test not found" });

            const { rows: variants } = await db.query(
                `SELECT id, variant_key, label, is_control, changes, created_at, updated_at
                 FROM ab_test_variants WHERE test_id = $1 ORDER BY is_control DESC, created_at ASC`,
                [testId]
            ).catch(() => ({ rows: [] }));

            return res.status(200).json({
                test: {
                    id: test.id, domain: test.domain, name: test.name,
                    targetPath: test.target_path, status: test.status,
                    createdAt: test.created_at, updatedAt: test.updated_at,
                },
                variants: variants.map(v => ({
                    id: v.id, variantKey: v.variant_key, label: v.label,
                    isControl: v.is_control, changes: v.changes,
                    createdAt: v.created_at, updatedAt: v.updated_at,
                })),
            });
        }

        const { rows } = await db.query(
            `SELECT t.id, t.name, t.target_path, t.status, t.created_at, t.updated_at,
                    COUNT(v.id) AS variant_count
             FROM ab_tests t
             LEFT JOIN ab_test_variants v ON v.test_id = t.id
             WHERE t.organisation_id = $1 AND t.domain = $2
             GROUP BY t.id ORDER BY t.updated_at DESC`,
            [orgId, domain]
        ).catch(() => ({ rows: [] }));

        return res.status(200).json({
            tests: rows.map(t => ({
                id: t.id, name: t.name, targetPath: t.target_path, status: t.status,
                variantCount: Number(t.variant_count || 0),
                createdAt: t.created_at, updatedAt: t.updated_at,
            })),
        });
    }

    // ── POST: create a test + its auto-created "control" variant ──────────────
    if (req.method === "POST") {
        let body;
        try {
            body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body || "{}");
        } catch {
            return res.status(400).json({ error: "Invalid body" });
        }

        const domain = (body.domain || "").trim().toLowerCase();
        const name = (body.name || "").trim();
        const targetPathRaw = (body.targetPath || "/").trim();

        if (!domain) return res.status(400).json({ error: "domain is required" });
        if (!NAME_RE.test(name)) return res.status(400).json({ error: "name must be 1-120 characters" });
        if (!isSafeTargetPath(targetPathRaw)) return res.status(400).json({ error: "targetPath must be a same-site path starting with /" });
        const targetPath = normalizeTargetPath(targetPathRaw);

        const client = await db.connect();
        try {
            await client.query("BEGIN");
            const { rows: testRows } = await client.query(
                `INSERT INTO ab_tests (organisation_id, domain, name, target_path)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, domain, name, target_path, status, created_at, updated_at`,
                [orgId, domain, name, targetPath]
            );
            const test = testRows[0];
            const { rows: variantRows } = await client.query(
                `INSERT INTO ab_test_variants (test_id, variant_key, label, is_control)
                 VALUES ($1, 'control', 'Control', true)
                 RETURNING id, variant_key, label, is_control, changes, created_at, updated_at`,
                [test.id]
            );
            await client.query("COMMIT");

            return res.status(201).json({
                test: {
                    id: test.id, domain: test.domain, name: test.name,
                    targetPath: test.target_path, status: test.status,
                    createdAt: test.created_at, updatedAt: test.updated_at,
                },
                variants: variantRows.map(v => ({
                    id: v.id, variantKey: v.variant_key, label: v.label,
                    isControl: v.is_control, changes: v.changes,
                    createdAt: v.created_at, updatedAt: v.updated_at,
                })),
            });
        } catch (e) {
            await client.query("ROLLBACK").catch(() => {});
            return res.status(500).json({ error: "Could not create test" });
        } finally {
            client.release();
        }
    }

    // ── PATCH: update test metadata (name / targetPath / status) ──────────────
    if (req.method === "PATCH") {
        const testId = parseInt(req.query.testId || "", 10);
        if (!testId) return res.status(400).json({ error: "testId is required" });

        const existing = await loadOwnedTest(testId);
        if (!existing) return res.status(404).json({ error: "Test not found" });

        let body;
        try {
            body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body || "{}");
        } catch {
            return res.status(400).json({ error: "Invalid body" });
        }

        const name = body.name !== undefined ? String(body.name).trim() : existing.name;
        const targetPathRaw = body.targetPath !== undefined ? String(body.targetPath).trim() : existing.target_path;
        const status = body.status !== undefined ? String(body.status) : existing.status;

        if (!NAME_RE.test(name)) return res.status(400).json({ error: "name must be 1-120 characters" });
        if (!isSafeTargetPath(targetPathRaw)) return res.status(400).json({ error: "targetPath must be a same-site path starting with /" });
        if (!ALLOWED_STATUSES.has(status)) return res.status(400).json({ error: "status must be draft, running, paused, or archived" });
        const targetPath = normalizeTargetPath(targetPathRaw);

        if (status === "running") {
            const { rows: countRows } = await db.query(
                `SELECT COUNT(*) AS n FROM ab_test_variants WHERE test_id = $1`,
                [testId]
            );
            if (Number(countRows[0]?.n || 0) < 2) {
                return res.status(400).json({ error: "A test needs at least 2 variants to run" });
            }
        }

        let rows;
        try {
            ({ rows } = await db.query(
                `UPDATE ab_tests SET name = $1, target_path = $2, status = $3, updated_at = NOW()
                 WHERE id = $4 RETURNING id, domain, name, target_path, status, created_at, updated_at`,
                [name, targetPath, status, testId]
            ));
        } catch (e) {
            if (e?.code === "23505") {
                return res.status(409).json({ error: "Another test is already running on this path" });
            }
            return res.status(500).json({ error: "Could not update test" });
        }

        const test = rows[0];
        return res.status(200).json({
            test: {
                id: test.id, domain: test.domain, name: test.name,
                targetPath: test.target_path, status: test.status,
                createdAt: test.created_at, updatedAt: test.updated_at,
            },
        });
    }

    // ── DELETE: remove a test (cascades its variants) ──────────────────────────
    if (req.method === "DELETE") {
        const testId = parseInt(req.query.testId || "", 10);
        if (!testId) return res.status(400).json({ error: "testId is required" });

        const existing = await loadOwnedTest(testId);
        if (!existing) return res.status(200).json({ ok: true });

        await db.query(`DELETE FROM ab_tests WHERE id = $1`, [testId]).catch(() => {});
        return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
}
