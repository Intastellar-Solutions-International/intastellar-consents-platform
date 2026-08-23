/**
 * GET    /api/ab-tests?domain=<domain>                        → list tests for a domain
 * GET    /api/ab-tests?domain=<domain>&testId=<id>             → single test + its variants (editor payload)
 * POST   /api/ab-tests   body: { domain, name, targetPath }    → create a test (auto-creates a "control" variant)
 * PATCH  /api/ab-tests?testId=<id>   body: { name?, targetPath?, status?, trafficSplit? } → update test metadata
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
            max: 1,
            idleTimeoutMillis: 10_000,
            connectionTimeoutMillis: 5_000,
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

const ALLOWED_STATUSES = new Set(["draft", "running", "paused", "archived", "completed"]);
const GOAL_EVENT_RE = /^[a-z0-9_-]{1,64}$/i;
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
    // "*" is only meaningful as a trailing wildcard segment — "/*" (whole
    // site) or "/blog/*" (that path and everything under it). Anywhere else
    // it's just a literal character nothing will ever match, which almost
    // certainly isn't what the caller meant.
    if (p.includes("*") && !p.endsWith("/*")) return false;
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
    await db.query(`ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ`).catch(() => {});
    await db.query(`ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS goal_event_name VARCHAR(64)`).catch(() => {});
    await db.query(`ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS test_type VARCHAR(16) NOT NULL DEFAULT 'visual'`).catch(() => {});
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
            `SELECT id, organisation_id, domain, name, target_path, status,
                    ends_at, goal_event_name, test_type, traffic_split, created_at, updated_at
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
                    testType: test.test_type || "visual",
                    trafficSplit: test.traffic_split || {},
                    endsAt: test.ends_at, goalEventName: test.goal_event_name,
                    createdAt: test.created_at, updatedAt: test.updated_at,
                },
                variants: variants.map(v => ({
                    id: v.id, variantKey: v.variant_key, label: v.label,
                    isControl: v.is_control, changes: v.changes,
                    redirectUrl: v.redirect_url || null,
                    createdAt: v.created_at, updatedAt: v.updated_at,
                })),
            });
        }

        const { rows } = await db.query(
            `SELECT t.id, t.name, t.target_path, t.status, t.test_type, t.created_at, t.updated_at,
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
                testType: t.test_type || "visual",
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
        const testType = String(body.testType || "visual");

        if (!domain) return res.status(400).json({ error: "domain is required" });
        if (!NAME_RE.test(name)) return res.status(400).json({ error: "name must be 1-120 characters" });
        if (!isSafeTargetPath(targetPathRaw)) return res.status(400).json({ error: "targetPath must be a same-site path starting with /" });
        if (testType !== "visual" && testType !== "url_split") return res.status(400).json({ error: "testType must be 'visual' or 'url_split'" });
        const targetPath = normalizeTargetPath(targetPathRaw);

        const client = await db.connect();
        try {
            await client.query("BEGIN");
            const { rows: testRows } = await client.query(
                `INSERT INTO ab_tests (organisation_id, domain, name, target_path, test_type)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id, domain, name, target_path, status, test_type, created_at, updated_at`,
                [orgId, domain, name, targetPath, testType]
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
                    testType: test.test_type || "visual",
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
        // Whether THIS call is explicitly setting status:'running' — distinct
        // from "status resolves to running" (which is also true for an
        // unrelated metadata edit on an already-running test, since status
        // defaults to existing.status above). Only an explicit launch should
        // recompute ends_at; an unrelated edit must leave it untouched.
        const isLaunchingNow = body.status !== undefined && status === "running";

        if (!NAME_RE.test(name)) return res.status(400).json({ error: "name must be 1-120 characters" });
        if (!isSafeTargetPath(targetPathRaw)) return res.status(400).json({ error: "targetPath must be a same-site path starting with /" });
        if (!ALLOWED_STATUSES.has(status)) return res.status(400).json({ error: "status must be draft, running, paused, archived, or completed" });
        const targetPath = normalizeTargetPath(targetPathRaw);

        let durationDays = null;
        if (body.durationDays !== undefined && body.durationDays !== null && body.durationDays !== "") {
            durationDays = parseInt(body.durationDays, 10);
            if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
                return res.status(400).json({ error: "durationDays must be an integer between 1 and 365" });
            }
        }

        let goalEventName = existing.goal_event_name;
        if (body.goalEventName !== undefined) {
            const v = String(body.goalEventName || "").trim().toLowerCase();
            if (v === "") goalEventName = null;
            else if (!GOAL_EVENT_RE.test(v)) return res.status(400).json({ error: "goalEventName must be 1-64 letters, numbers, - or _" });
            else goalEventName = v;
        }

        // trafficSplit is keyed by variant_key (matching how api/ab-test-active.js
        // reads it at runtime) — an empty object explicitly resets to an equal
        // split; anything else must supply a non-negative weight for EVERY
        // current variant, so an incomplete split can't silently fall back to
        // equal-split behavior for whichever variant got left out (that's a
        // wrong result presented as if it were the split the caller asked for).
        let trafficSplit = existing.traffic_split || {};
        if (body.trafficSplit !== undefined) {
            const raw = body.trafficSplit;
            if (raw === null || (typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).length === 0)) {
                trafficSplit = {};
            } else if (typeof raw !== "object" || Array.isArray(raw)) {
                return res.status(400).json({ error: "trafficSplit must be an object of variantKey -> weight" });
            } else {
                const { rows: variantRows } = await db.query(
                    `SELECT variant_key FROM ab_test_variants WHERE test_id = $1`,
                    [testId]
                ).catch(() => ({ rows: [] }));
                let total = 0;
                for (const { variant_key: key } of variantRows) {
                    const w = raw[key];
                    if (typeof w !== "number" || !isFinite(w) || w < 0) {
                        return res.status(400).json({ error: `trafficSplit must include a non-negative weight for variant "${key}"` });
                    }
                    total += w;
                }
                if (total <= 0) return res.status(400).json({ error: "trafficSplit needs at least one variant with weight > 0" });
                trafficSplit = raw;
            }
        }

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
                `UPDATE ab_tests SET name = $1, target_path = $2, status = $3, goal_event_name = $4, traffic_split = $8,
                     ends_at = CASE
                         WHEN $6::boolean = false THEN ends_at
                         WHEN $5::int IS NOT NULL THEN NOW() + ($5::int * INTERVAL '1 day')
                         ELSE NULL
                     END,
                     updated_at = NOW()
                 WHERE id = $7
                 RETURNING id, domain, name, target_path, status, ends_at, goal_event_name, test_type, traffic_split, created_at, updated_at`,
                [name, targetPath, status, goalEventName, durationDays, isLaunchingNow, testId, JSON.stringify(trafficSplit)]
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
                testType: test.test_type || "visual",
                trafficSplit: test.traffic_split || {},
                endsAt: test.ends_at, goalEventName: test.goal_event_name,
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
