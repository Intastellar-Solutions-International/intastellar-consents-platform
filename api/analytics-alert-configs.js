/**
 * GET/POST/PUT/DELETE /api/analytics-alert-configs
 *
 * CRUD for analytics alert configurations. Each alert watches one KPI
 * (traffic, consent_rate, conversions, etc.) against a threshold and
 * fires via email and/or push when triggered.
 *
 * Requires Authorization: Bearer <token>   Organisation: <org_id>
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
            connectionTimeoutMillis: 10000,
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

async function ensureTables(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_alert_configs (
            id              BIGSERIAL    PRIMARY KEY,
            site_id         VARCHAR(32)  NOT NULL,
            organisation_id INTEGER      NOT NULL,
            metric          VARCHAR(40)  NOT NULL,  -- traffic_drop|consent_rate|zero_conversions|conversion_drop
            operator        VARCHAR(4)   NOT NULL,  -- lt|gt|eq
            threshold       NUMERIC      NOT NULL,
            period_days     SMALLINT     NOT NULL DEFAULT 7,
            notify_email    BOOLEAN      NOT NULL DEFAULT true,
            notify_push     BOOLEAN      NOT NULL DEFAULT false,
            enabled         BOOLEAN      NOT NULL DEFAULT true,
            label           VARCHAR(120),
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_aac_site ON analytics_alert_configs (site_id);
        CREATE TABLE IF NOT EXISTS analytics_alert_history (
            id          BIGSERIAL    PRIMARY KEY,
            config_id   BIGINT       NOT NULL REFERENCES analytics_alert_configs(id) ON DELETE CASCADE,
            triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            metric_value NUMERIC,
            message      TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_aah_config ON analytics_alert_history (config_id, triggered_at DESC);
    `).catch(() => {});
}

const VALID_METRICS   = new Set(["traffic_drop", "consent_rate_below", "zero_conversions", "conversion_drop", "engaged_drop"]);
const VALID_OPERATORS = new Set(["lt", "gt"]);

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const db = getPool();
    await ensureTables(db);

    const domain = (req.query.domain || "").trim().toLowerCase();

    // Resolve site_id from domain
    let siteId = null;
    if (domain) {
        const { rows } = await db.query(
            `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1`,
            [orgId, domain]
        ).catch(() => ({ rows: [] }));
        if (!rows.length) return res.status(200).json({ noSiteKey: true });
        siteId = rows[0].id;
    }

    // ── LIST ──────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
        if (!siteId) return res.status(400).json({ error: "domain required" });
        const { rows } = await db.query(
            `SELECT aac.*,
                    (SELECT triggered_at FROM analytics_alert_history WHERE config_id = aac.id ORDER BY triggered_at DESC LIMIT 1) AS last_triggered,
                    (SELECT metric_value  FROM analytics_alert_history WHERE config_id = aac.id ORDER BY triggered_at DESC LIMIT 1) AS last_value
             FROM analytics_alert_configs aac
             WHERE aac.site_id = $1 AND aac.organisation_id = $2
             ORDER BY aac.created_at DESC`,
            [siteId, orgId]
        ).catch(() => ({ rows: [] }));
        return res.status(200).json({ configs: rows });
    }

    // ── CREATE ────────────────────────────────────────────────────────────────
    if (req.method === "POST") {
        if (!siteId) return res.status(400).json({ error: "domain required" });
        const { metric, operator, threshold, period_days, notify_email, notify_push, label, enabled } = req.body || {};
        if (!VALID_METRICS.has(metric))   return res.status(400).json({ error: "Invalid metric" });
        if (!VALID_OPERATORS.has(operator)) return res.status(400).json({ error: "Invalid operator" });
        if (typeof threshold !== "number") return res.status(400).json({ error: "threshold must be a number" });

        const { rows } = await db.query(
            `INSERT INTO analytics_alert_configs
             (site_id, organisation_id, metric, operator, threshold, period_days, notify_email, notify_push, label, enabled)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [siteId, orgId, metric, operator, threshold,
             Math.min(90, Math.max(1, parseInt(period_days) || 7)),
             notify_email !== false, notify_push === true,
             (label || "").slice(0, 120) || null,
             enabled !== false]
        );
        return res.status(201).json(rows[0]);
    }

    // ── UPDATE ────────────────────────────────────────────────────────────────
    if (req.method === "PUT") {
        const id = parseInt(req.query.id, 10);
        if (!id) return res.status(400).json({ error: "id required" });
        const { metric, operator, threshold, period_days, notify_email, notify_push, label, enabled } = req.body || {};
        if (metric && !VALID_METRICS.has(metric))     return res.status(400).json({ error: "Invalid metric" });
        if (operator && !VALID_OPERATORS.has(operator)) return res.status(400).json({ error: "Invalid operator" });

        const { rows } = await db.query(
            `UPDATE analytics_alert_configs
             SET metric       = COALESCE($3, metric),
                 operator     = COALESCE($4, operator),
                 threshold    = COALESCE($5, threshold),
                 period_days  = COALESCE($6, period_days),
                 notify_email = COALESCE($7, notify_email),
                 notify_push  = COALESCE($8, notify_push),
                 label        = COALESCE($9, label),
                 enabled      = COALESCE($10, enabled),
                 updated_at   = NOW()
             WHERE id = $1 AND organisation_id = $2
             RETURNING *`,
            [id, orgId, metric || null, operator || null,
             threshold != null ? threshold : null,
             period_days ? Math.min(90, Math.max(1, parseInt(period_days))) : null,
             notify_email != null ? notify_email : null,
             notify_push  != null ? notify_push  : null,
             label != null ? (label || "").slice(0, 120) : null,
             enabled != null ? enabled : null]
        );
        if (!rows.length) return res.status(404).json({ error: "Not found" });
        return res.status(200).json(rows[0]);
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (req.method === "DELETE") {
        const id = parseInt(req.query.id, 10);
        if (!id) return res.status(400).json({ error: "id required" });
        await db.query(
            `DELETE FROM analytics_alert_configs WHERE id = $1 AND organisation_id = $2`,
            [id, orgId]
        ).catch(() => {});
        return res.status(204).end();
    }

    return res.status(405).end();
}
