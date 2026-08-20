/**
 * GET    /api/analytics-funnels?domain=<domain>                                → list funnels
 * GET    /api/analytics-funnels?domain=&id=&compute=1&from=&to=&device=        → compute one funnel
 * POST   /api/analytics-funnels   body: { domain, name, steps }                → create a funnel
 * PUT    /api/analytics-funnels?id=   body: { domain, name, steps }            → update a funnel
 * DELETE /api/analytics-funnels?id=&domain=                                    → delete a funnel
 *
 * User-defined, savable, ORDER-ENFORCED conversion funnels. Each step is
 * either a pathname (exact or prefix match) or a registered custom event
 * (matched by analytics_event_defs.name — not `kind`, since `kind` defaults
 * to 'custom' and is shared by every non-ecommerce event a site registers;
 * keying a general-purpose funnel off it would silently merge unrelated
 * events together). The compute query enforces true funnel semantics: step
 * N only counts a session if steps 0..N-1 ALL matched first, in order — not
 * just "step N happened after step N-1" (see buildFunnelSql's doc comment).
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

const MAX_STEPS = 10;
const MIN_STEPS = 2;

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
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

function safeDate(str, fallback) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? fallback : d.toISOString().slice(0, 10);
}

async function ensureTable(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_funnels (
            id              BIGSERIAL    PRIMARY KEY,
            site_id         VARCHAR(32)  NOT NULL,
            organisation_id INTEGER      NOT NULL,
            name            VARCHAR(120) NOT NULL,
            steps           JSONB        NOT NULL,
            is_default      BOOLEAN      NOT NULL DEFAULT false,
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_af_site ON analytics_funnels (site_id);
    `).catch(() => {});
}

// Validates step shape and, for event steps, that the event name is
// actually registered for this site — an unregistered event name would
// silently compute to "0 sessions ever hit this step" with no indication
// why, which reads as a broken funnel rather than a typo in the builder.
async function validateSteps(db, siteId, steps) {
    if (!Array.isArray(steps) || steps.length < MIN_STEPS || steps.length > MAX_STEPS) {
        return `steps must be an array of ${MIN_STEPS}-${MAX_STEPS} entries`;
    }

    const { rows: eventRows } = await db.query(
        `SELECT name FROM analytics_event_defs WHERE site_id = $1`,
        [siteId]
    ).catch(() => ({ rows: [] }));
    const registeredEvents = new Set(eventRows.map(r => r.name));

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step || typeof step !== "object") return `step ${i + 1} is invalid`;

        if (step.type === "pathname") {
            if (typeof step.match !== "string" || !step.match.startsWith("/") || step.match.length > 500) {
                return `step ${i + 1}: pathname match must start with "/" (max 500 chars)`;
            }
            if (step.matchMode !== "exact" && step.matchMode !== "prefix") {
                return `step ${i + 1}: matchMode must be "exact" or "prefix"`;
            }
        } else if (step.type === "event") {
            if (typeof step.value !== "string" || !step.value) {
                return `step ${i + 1}: event value is required`;
            }
            if (!registeredEvents.has(step.value)) {
                return `step ${i + 1}: "${step.value}" is not a registered event for this site`;
            }
        } else {
            return `step ${i + 1}: type must be "pathname" or "event"`;
        }
    }
    return null;
}

function sanitizeSteps(steps) {
    return steps.map(step => step.type === "pathname"
        ? { type: "pathname", match: step.match, matchMode: step.matchMode }
        : { type: "event", value: step.value });
}

// Same fixed e-commerce sequence + "2+ registered" trigger condition
// ConversionFunnel.js used to check client-side (FUNNEL_ORDER, api/analytics-
// events.js's ALLOWED_KINDS) — seeds one real, order-enforced funnel the
// first time a site qualifies, so sites that already had the old kind-based
// "funnel" (an independent-count approximation, not true session sequencing)
// get an equivalent one in the new engine without losing continuity. Runs
// lazily on the list read rather than as a one-off migration script, so it
// naturally covers sites created after this shipped too. Never overwrites or
// duplicates — only fires when the site has zero funnels yet.
const LEGACY_FUNNEL_ORDER = ["view_basket", "begin_checkout", "checkout", "purchase"];

async function seedDefaultFunnelIfEligible(db, siteId, orgId) {
    const { rows: existing } = await db.query(
        `SELECT 1 FROM analytics_funnels WHERE site_id = $1 LIMIT 1`, [siteId]
    ).catch(() => ({ rows: [] }));
    if (existing.length) return;

    // Event steps key off the registered event's `name` (see the module doc
    // comment for why), not `kind` — a site's "purchase"-kind event could be
    // named anything (e.g. "complete_order"). Two events can share a kind;
    // pick the earliest-registered name per kind for a deterministic seed
    // rather than trying to represent every name sharing that kind.
    const { rows: eventRows } = await db.query(
        `SELECT name, kind FROM analytics_event_defs
         WHERE site_id = $1 AND kind = ANY($2::text[])
         ORDER BY created_at ASC`,
        [siteId, LEGACY_FUNNEL_ORDER]
    ).catch(() => ({ rows: [] }));
    const nameByKind = new Map();
    for (const r of eventRows) if (!nameByKind.has(r.kind)) nameByKind.set(r.kind, r.name);
    const orderedKinds = LEGACY_FUNNEL_ORDER.filter(k => nameByKind.has(k));
    if (orderedKinds.length < MIN_STEPS) return;

    const steps = orderedKinds.map(kind => ({ type: "event", value: nameByKind.get(kind) }));
    await db.query(
        `INSERT INTO analytics_funnels (site_id, organisation_id, name, steps, is_default)
         VALUES ($1,$2,$3,$4,true)`,
        [siteId, orgId, "Checkout funnel", JSON.stringify(steps)]
    ).catch(() => {});
}

function stepLabel(step) {
    if (step.type === "pathname") return step.matchMode === "prefix" ? `${step.match}*` : step.match;
    return step.value;
}

// Ordered-funnel SQL: one CTE per step (first-touch timestamp per session
// for that step's criteria), then a progression CTE that chains each step's
// timestamp through a CASE requiring EVERY prior step to have matched, not
// just the immediately preceding one. A flatter `step_N.ts >= step_(N-1).ts`
// without threading through the prior CASE would only enforce pairwise
// ordering (a session could skip step 1 and still count for step 2 as long
// as timestamps happen to increase) — this is the one thing that has to be
// exactly right for the funnel numbers to mean what they claim to mean.
// `>=` not `>`: a pathname step and an event step can legitimately share a
// timestamp (e.g. a `purchase` custom event fired on the same pageload that
// landed on `/checkout/confirm`).
function buildFunnelSql(siteId, fromDate, toDateExclusive, steps) {
    const params = [siteId, fromDate, toDateExclusive];
    const stepCtes = [];

    steps.forEach((step, i) => {
        if (step.type === "pathname") {
            params.push(step.matchMode === "prefix" ? `${step.match}%` : step.match);
            const cmp = step.matchMode === "prefix" ? "LIKE" : "=";
            stepCtes.push(`step_${i} AS (
                SELECT session_id, MIN(received_at) AS ts
                FROM analytics_events
                WHERE site_id = $1 AND session_id IS NOT NULL
                  AND received_at >= $2 AND received_at < $3
                  AND pathname ${cmp} $${params.length}
                GROUP BY session_id
            )`);
        } else {
            params.push(step.value);
            stepCtes.push(`step_${i} AS (
                SELECT session_id, MIN(received_at) AS ts
                FROM analytics_custom_events
                WHERE site_id = $1 AND session_id IS NOT NULL
                  AND received_at >= $2 AND received_at < $3
                  AND name = $${params.length}
                GROUP BY session_id
            )`);
        }
    });

    const tExprs = steps.map((_, i) => {
        if (i === 0) return "step_0.ts AS t0";
        const conditions = ["step_0.ts IS NOT NULL"];
        for (let j = 1; j <= i; j++) conditions.push(`step_${j}.ts >= step_${j - 1}.ts`);
        return `CASE WHEN ${conditions.join(" AND ")} THEN step_${i}.ts END AS t${i}`;
    });

    const joins = steps.map((_, i) => `LEFT JOIN step_${i} ON step_${i}.session_id = s.session_id`).join("\n            ");
    const selectCounts = steps.map((_, i) => `COUNT(t${i}) AS step_${i}_sessions`).join(", ");

    const sql = `
        WITH sessions AS (
            SELECT DISTINCT session_id FROM analytics_events
            WHERE site_id = $1 AND session_id IS NOT NULL
              AND received_at >= $2 AND received_at < $3
            UNION
            SELECT DISTINCT session_id FROM analytics_custom_events
            WHERE site_id = $1 AND session_id IS NOT NULL
              AND received_at >= $2 AND received_at < $3
        ),
        ${stepCtes.join(",\n        ")},
        progression AS (
            SELECT s.session_id, ${tExprs.join(", ")}
            FROM sessions s
            ${joins}
        )
        SELECT ${selectCounts} FROM progression`;

    return { sql, params };
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const db = getPool();
    await ensureTable(db);

    async function resolveSiteId(domain) {
        const { rows } = await db.query(
            `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1`,
            [orgId, domain]
        ).catch(() => ({ rows: [] }));
        return rows[0]?.id || null;
    }

    // ── GET: list, or compute one funnel ───────────────────────────────────────
    if (req.method === "GET") {
        const domain = (req.query.domain || "").trim().toLowerCase();
        if (!domain) return res.status(400).json({ error: "domain is required" });

        const siteId = await resolveSiteId(domain);
        if (!siteId) return res.status(200).json({ funnels: [] });

        const id = parseInt(req.query.id || "", 10);
        const compute = req.query.compute === "1";

        if (id && compute) {
            const { rows } = await db.query(
                `SELECT id, name, steps FROM analytics_funnels WHERE id = $1 AND site_id = $2 LIMIT 1`,
                [id, siteId]
            ).catch(() => ({ rows: [] }));
            if (!rows.length) return res.status(404).json({ error: "Funnel not found" });

            const steps = rows[0].steps;
            const today = new Date().toISOString().slice(0, 10);
            const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
            const fromDate = safeDate(req.query.from, thirtyAgo);
            const toDate   = safeDate(req.query.to,   today);
            const toDateExclusive = new Date(new Date(toDate).getTime() + 86400000).toISOString().slice(0, 10);

            const { sql, params } = buildFunnelSql(siteId, fromDate, toDateExclusive, steps);
            const { rows: computeRows } = await db.query(sql, params);
            const counts = computeRows[0] || {};

            return res.status(200).json({
                id: rows[0].id,
                name: rows[0].name,
                from: fromDate,
                to: toDate,
                steps: steps.map((step, i) => ({
                    index: i,
                    type: step.type,
                    label: stepLabel(step),
                    sessions: Number(counts[`step_${i}_sessions`] || 0),
                })),
            });
        }

        if (id) {
            const { rows } = await db.query(
                `SELECT id, name, steps, is_default, created_at, updated_at FROM analytics_funnels WHERE id = $1 AND site_id = $2 LIMIT 1`,
                [id, siteId]
            ).catch(() => ({ rows: [] }));
            if (!rows.length) return res.status(404).json({ error: "Funnel not found" });
            const r = rows[0];
            return res.status(200).json({
                id: r.id, name: r.name, steps: r.steps, isDefault: r.is_default,
                createdAt: r.created_at, updatedAt: r.updated_at,
            });
        }

        await seedDefaultFunnelIfEligible(db, siteId, orgId);

        const { rows } = await db.query(
            `SELECT id, name, steps, is_default, created_at, updated_at
             FROM analytics_funnels WHERE site_id = $1 ORDER BY created_at ASC`,
            [siteId]
        ).catch(() => ({ rows: [] }));

        return res.status(200).json({
            funnels: rows.map(r => ({
                id: r.id, name: r.name, steps: r.steps, isDefault: r.is_default,
                createdAt: r.created_at, updatedAt: r.updated_at,
            })),
        });
    }

    // ── POST: create a funnel ──────────────────────────────────────────────────
    if (req.method === "POST") {
        let body;
        try {
            body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body || "{}");
        } catch {
            return res.status(400).json({ error: "Invalid body" });
        }

        const domain = (body.domain || "").trim().toLowerCase();
        const name = (body.name || "").trim().slice(0, 120);
        if (!domain) return res.status(400).json({ error: "domain is required" });
        if (!name) return res.status(400).json({ error: "name is required" });

        const siteId = await resolveSiteId(domain);
        if (!siteId) return res.status(404).json({ error: "No site key found for this domain." });

        const stepsError = await validateSteps(db, siteId, body.steps);
        if (stepsError) return res.status(400).json({ error: stepsError });

        const { rows } = await db.query(
            `INSERT INTO analytics_funnels (site_id, organisation_id, name, steps)
             VALUES ($1,$2,$3,$4)
             RETURNING id, name, steps, is_default, created_at, updated_at`,
            [siteId, orgId, name, JSON.stringify(sanitizeSteps(body.steps))]
        );

        const r = rows[0];
        return res.status(201).json({
            id: r.id, name: r.name, steps: r.steps, isDefault: r.is_default,
            createdAt: r.created_at, updatedAt: r.updated_at,
        });
    }

    // ── PUT: update a funnel ───────────────────────────────────────────────────
    if (req.method === "PUT") {
        const id = parseInt(req.query.id || "", 10);
        if (!id) return res.status(400).json({ error: "id is required" });

        let body;
        try {
            body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body || "{}");
        } catch {
            return res.status(400).json({ error: "Invalid body" });
        }

        const domain = (body.domain || "").trim().toLowerCase();
        const name = (body.name || "").trim().slice(0, 120);
        if (!domain) return res.status(400).json({ error: "domain is required" });
        if (!name) return res.status(400).json({ error: "name is required" });

        const siteId = await resolveSiteId(domain);
        if (!siteId) return res.status(404).json({ error: "No site key found for this domain." });

        const stepsError = await validateSteps(db, siteId, body.steps);
        if (stepsError) return res.status(400).json({ error: stepsError });

        const { rows } = await db.query(
            `UPDATE analytics_funnels SET name = $1, steps = $2, updated_at = NOW()
             WHERE id = $3 AND site_id = $4
             RETURNING id, name, steps, is_default, created_at, updated_at`,
            [name, JSON.stringify(sanitizeSteps(body.steps)), id, siteId]
        );

        if (!rows.length) return res.status(404).json({ error: "Funnel not found" });
        const r = rows[0];
        return res.status(200).json({
            id: r.id, name: r.name, steps: r.steps, isDefault: r.is_default,
            createdAt: r.created_at, updatedAt: r.updated_at,
        });
    }

    // ── DELETE: remove a funnel ─────────────────────────────────────────────────
    if (req.method === "DELETE") {
        const id = parseInt(req.query.id || "", 10);
        const domain = (req.query.domain || "").trim().toLowerCase();
        if (!id || !domain) return res.status(400).json({ error: "id and domain are required" });

        const siteId = await resolveSiteId(domain);
        if (!siteId) return res.status(200).json({ ok: true });

        await db.query(`DELETE FROM analytics_funnels WHERE id = $1 AND site_id = $2`, [id, siteId]).catch(() => {});
        return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
}
