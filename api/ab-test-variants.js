/**
 * POST   /api/ab-test-variants   body: { testId, variantKey, label? } → add a variant
 * PUT    /api/ab-test-variants?variantId=<id>   body: { changes: [...], label? } → the visual
 *          editor's Save action — full-replaces the variant's `changes` array
 * DELETE /api/ab-test-variants?variantId=<id>   → remove a variant (blocked for the
 *          control, and for the last remaining variant on a test)
 *
 * `changes` is an ordered array of DOM edits applied by the visual editor / the
 * (future) runtime script:
 *   { selector: string, type: "text"|"html"|"style"|"attribute"|"remove"|"class",
 *     property?: string, value?: string }
 * Always read/written as a whole — never queried by individual entry — so it's
 * stored as one JSONB column rather than a normalized per-edit table, same
 * shape as ad_platform_connections/cookie_banner/jurisdiction_config/RoPA's
 * JSONB list columns elsewhere in this codebase.
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

const VARIANT_KEY_RE = /^[a-z0-9_-]{1,64}$/;
const ALLOWED_CHANGE_TYPES = new Set(["text", "html", "style", "attribute", "remove", "class"]);
const MAX_CHANGES = 500;

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "POST,PUT,DELETE,OPTIONS");
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

// Not trusting the editor's client-side JS to only ever send well-formed
// edits — these get replayed into a live customer page by the (future)
// runtime script, so a malformed/oversized changes array is rejected here
// rather than persisted and failing later, silently or otherwise.
function validateChanges(changes) {
    if (!Array.isArray(changes)) return "changes must be an array";
    if (changes.length > MAX_CHANGES) return `changes cannot exceed ${MAX_CHANGES} entries`;
    for (const c of changes) {
        if (!c || typeof c !== "object") return "each change must be an object";
        if (typeof c.selector !== "string" || !c.selector.trim() || c.selector.length > 500) {
            return "each change needs a non-empty selector (max 500 chars)";
        }
        if (!ALLOWED_CHANGE_TYPES.has(c.type)) {
            return `change type must be one of: ${Array.from(ALLOWED_CHANGE_TYPES).join(", ")}`;
        }
        if (c.value !== undefined && (typeof c.value !== "string" || c.value.length > 10000)) {
            return "change value must be a string under 10000 characters";
        }
    }
    return null;
}

async function ensureTables(db) {
    // Same tables api/ab-tests.js creates — kept idempotent/duplicated here
    // (not imported) since every API file in this codebase self-migrates its
    // own schema independently rather than sharing a migration module.
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
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const db = getPool();
    await ensureTables(db);

    // Verifies the parent test belongs to the caller's org — every write
    // below has to cross this check before touching a variant row, same
    // ownership-via-parent pattern as api/ab-tests.js.
    async function loadOwnedTest(testId) {
        const { rows } = await db.query(
            `SELECT id FROM ab_tests WHERE id = $1 AND organisation_id = $2 LIMIT 1`,
            [testId, orgId]
        ).catch(() => ({ rows: [] }));
        return rows[0] || null;
    }

    async function loadOwnedVariant(variantId) {
        const { rows } = await db.query(
            `SELECT v.id, v.test_id, v.variant_key, v.is_control, t.status AS test_status
             FROM ab_test_variants v
             JOIN ab_tests t ON t.id = v.test_id
             WHERE v.id = $1 AND t.organisation_id = $2 LIMIT 1`,
            [variantId, orgId]
        ).catch(() => ({ rows: [] }));
        return rows[0] || null;
    }

    // ── POST: add a variant to an existing test ────────────────────────────────
    if (req.method === "POST") {
        let body;
        try {
            body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body || "{}");
        } catch {
            return res.status(400).json({ error: "Invalid body" });
        }

        const testId = parseInt(body.testId, 10);
        const variantKey = String(body.variantKey || "").trim().toLowerCase();
        const label = body.label ? String(body.label).trim().slice(0, 120) : null;

        if (!testId) return res.status(400).json({ error: "testId is required" });
        if (!VARIANT_KEY_RE.test(variantKey)) {
            return res.status(400).json({ error: "variantKey must be 1-64 lowercase letters, numbers, - or _" });
        }

        const test = await loadOwnedTest(testId);
        if (!test) return res.status(404).json({ error: "Test not found" });

        const { rows } = await db.query(
            `INSERT INTO ab_test_variants (test_id, variant_key, label, is_control)
             VALUES ($1, $2, $3, false)
             RETURNING id, variant_key, label, is_control, changes, created_at, updated_at`,
            [testId, variantKey, label]
        ).catch((e) => {
            if (e?.constraint?.includes("variant_key") || e?.code === "23505") return { rows: null, dup: true };
            throw e;
        });

        if (!rows) return res.status(409).json({ error: "A variant with this key already exists on this test" });

        const v = rows[0];
        return res.status(201).json({
            variant: {
                id: v.id, variantKey: v.variant_key, label: v.label,
                isControl: v.is_control, changes: v.changes,
                createdAt: v.created_at, updatedAt: v.updated_at,
            },
        });
    }

    // ── PUT: save the visual editor's edits for a variant ──────────────────────
    if (req.method === "PUT") {
        const variantId = parseInt(req.query.variantId || "", 10);
        if (!variantId) return res.status(400).json({ error: "variantId is required" });

        const existing = await loadOwnedVariant(variantId);
        if (!existing) return res.status(404).json({ error: "Variant not found" });

        let body;
        try {
            body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body || "{}");
        } catch {
            return res.status(400).json({ error: "Invalid body" });
        }

        const changesError = validateChanges(body.changes);
        if (changesError) return res.status(400).json({ error: changesError });

        const label = body.label !== undefined ? String(body.label).trim().slice(0, 120) || null : undefined;

        const { rows } = await db.query(
            label === undefined
                ? `UPDATE ab_test_variants SET changes = $1, updated_at = NOW()
                   WHERE id = $2 RETURNING id, variant_key, label, is_control, changes, created_at, updated_at`
                : `UPDATE ab_test_variants SET changes = $1, label = $3, updated_at = NOW()
                   WHERE id = $2 RETURNING id, variant_key, label, is_control, changes, created_at, updated_at`,
            label === undefined
                ? [JSON.stringify(body.changes), variantId]
                : [JSON.stringify(body.changes), variantId, label]
        );

        const v = rows[0];
        return res.status(200).json({
            variant: {
                id: v.id, variantKey: v.variant_key, label: v.label,
                isControl: v.is_control, changes: v.changes,
                createdAt: v.created_at, updatedAt: v.updated_at,
            },
        });
    }

    // ── DELETE: remove a variant ────────────────────────────────────────────────
    if (req.method === "DELETE") {
        const variantId = parseInt(req.query.variantId || "", 10);
        if (!variantId) return res.status(400).json({ error: "variantId is required" });

        const existing = await loadOwnedVariant(variantId);
        if (!existing) return res.status(200).json({ ok: true });

        if (existing.is_control) {
            return res.status(400).json({ error: "Cannot delete the control variant" });
        }

        const { rows: countRows } = await db.query(
            `SELECT COUNT(*) AS n FROM ab_test_variants WHERE test_id = $1`,
            [existing.test_id]
        );
        const variantCount = Number(countRows[0]?.n || 0);
        if (variantCount <= 1) {
            return res.status(400).json({ error: "Cannot delete the last remaining variant" });
        }
        // A running test needs 2+ variants (enforced when it was launched,
        // in api/ab-tests.js's PATCH handler) — deleting down to 1 would
        // silently turn it into a control-only page with nothing erroring
        // anywhere else, so the same floor applies here while it's running.
        if (existing.test_status === "running" && variantCount <= 2) {
            return res.status(400).json({ error: "A running test needs at least 2 variants — pause it first to remove this one" });
        }

        await db.query(`DELETE FROM ab_test_variants WHERE id = $1`, [variantId]).catch(() => {});
        return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
}
