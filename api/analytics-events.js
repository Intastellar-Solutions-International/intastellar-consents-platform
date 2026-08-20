/**
 * GET    /api/analytics-events?domain=<domain>            → list conversion event definitions
 * POST   /api/analytics-events   body: { domain, name, kind, label } → create a definition
 * DELETE /api/analytics-events?domain=<domain>&name=<name> → remove a definition
 *
 * Conversion event *definitions* are purely for labelling/UX — the ingest
 * endpoint (/api/a POST) accepts any event name a site sends via
 * `intaAnalytics.track(name, opts)` regardless of whether it was
 * "registered" here first. Registering one just gives it a friendly kind
 * (purchase/click/custom) and label in the dashboard.
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

const ALLOWED_KINDS = new Set(["purchase", "click", "custom", "view_basket", "begin_checkout", "checkout"]);
const NAME_RE = /^[a-z0-9_-]{1,64}$/i;

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
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

async function ensureTables(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_event_defs (
            id              BIGSERIAL    PRIMARY KEY,
            site_id         VARCHAR(32)  NOT NULL,
            organisation_id INTEGER      NOT NULL,
            name            VARCHAR(64)  NOT NULL,
            kind            VARCHAR(16)  NOT NULL DEFAULT 'custom',
            label           VARCHAR(120),
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            UNIQUE (site_id, name)
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

    async function resolveSiteId(domain) {
        const { rows } = await db.query(
            `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1`,
            [orgId, domain]
        ).catch(() => ({ rows: [] }));
        return rows[0]?.id || null;
    }

    // ── GET: list event definitions for a domain ──────────────────────────────
    if (req.method === "GET") {
        const domain = (req.query.domain || "").trim().toLowerCase();
        if (!domain) return res.status(400).json({ error: "domain is required" });

        const siteId = await resolveSiteId(domain);
        if (!siteId) return res.status(200).json({ events: [] });

        const { rows } = await db.query(
            `SELECT name, kind, label, created_at FROM analytics_event_defs
             WHERE site_id = $1 ORDER BY created_at ASC`,
            [siteId]
        ).catch(() => ({ rows: [] }));

        return res.status(200).json({ events: rows });
    }

    // ── POST: create an event definition ──────────────────────────────────────
    if (req.method === "POST") {
        let body;
        try {
            body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body || "{}");
        } catch {
            return res.status(400).json({ error: "Invalid body" });
        }

        const domain = (body.domain || "").trim().toLowerCase();
        const name   = (body.name   || "").trim().toLowerCase();
        const kind   = ALLOWED_KINDS.has(body.kind) ? body.kind : "custom";
        const label  = (body.label || "").trim().slice(0, 120) || null;

        if (!domain) return res.status(400).json({ error: "domain is required" });
        if (!NAME_RE.test(name)) {
            return res.status(400).json({ error: "name must be 1-64 letters, numbers, - or _" });
        }

        const siteId = await resolveSiteId(domain);
        if (!siteId) return res.status(404).json({ error: "No site key found for this domain. Generate one first." });

        const { rows } = await db.query(
            `INSERT INTO analytics_event_defs (site_id, organisation_id, name, kind, label)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (site_id, name) DO UPDATE SET kind = EXCLUDED.kind, label = EXCLUDED.label
             RETURNING name, kind, label, created_at`,
            [siteId, orgId, name, kind, label]
        );

        return res.status(201).json(rows[0]);
    }

    // ── DELETE: remove an event definition ────────────────────────────────────
    if (req.method === "DELETE") {
        const domain = (req.query.domain || "").trim().toLowerCase();
        const name   = (req.query.name   || "").trim().toLowerCase();
        if (!domain || !name) return res.status(400).json({ error: "domain and name are required" });

        const siteId = await resolveSiteId(domain);
        if (!siteId) return res.status(200).json({ ok: true });

        await db.query(
            `DELETE FROM analytics_event_defs WHERE site_id = $1 AND name = $2`,
            [siteId, name]
        ).catch(() => {});

        return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
}
