/**
 * GET/POST/PUT/DELETE /api/analytics-saved-reports
 *
 * CRUD for user-defined saved report configurations. Each report stores a
 * chart type, metric selections, breakdown dimension, filter set, and date
 * range so users can reconstruct the same view on demand.
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
            max: 1,
            idleTimeoutMillis: 10_000,
            connectionTimeoutMillis: 5_000,
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

const VALID_CHART_TYPES = new Set(["line", "bar", "table", "kpi", "donut"]);
const VALID_BREAKDOWNS   = new Set(["date", "country", "device", "utmSource", "browser", "channel", "none", "adPlatform"]);
const VALID_METRICS      = new Set(["sessions", "pageViews", "conversions", "conversionRate", "consentRate", "newUsers", "adSpend", "adClicks", "adImpressions", "blendedCac"]);

async function ensureTable(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_saved_reports (
            id              BIGSERIAL    PRIMARY KEY,
            site_id         VARCHAR(32)  NOT NULL,
            organisation_id INTEGER      NOT NULL,
            name            VARCHAR(200) NOT NULL,
            chart_type      VARCHAR(20)  NOT NULL DEFAULT 'line',
            metrics         JSONB        NOT NULL DEFAULT '["sessions"]',
            breakdown       VARCHAR(20)  NOT NULL DEFAULT 'date',
            filters         JSONB        NOT NULL DEFAULT '[]',
            date_range_days SMALLINT     NOT NULL DEFAULT 30,
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_asr_site ON analytics_saved_reports (site_id);
        CREATE INDEX IF NOT EXISTS idx_asr_org  ON analytics_saved_reports (organisation_id);
    `);
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const payload = validateJwt(req.headers.authorization);
    if (!payload) return res.status(401).json({ error: "Unauthorized" });
    const orgId = parseInt(req.headers.organisation, 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const db = getPool();
    await ensureTable(db);

    const domain = (req.query.domain || "").trim().toLowerCase();
    if (!domain) return res.status(400).json({ error: "domain required" });

    const { rows: siteRows } = await db.query(
        `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1`,
        [orgId, domain]
    ).catch(() => ({ rows: [] }));
    if (!siteRows.length) return res.status(200).json({ noSiteKey: true });
    const siteId = siteRows[0].id;

    // ── LIST ──────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
        const { rows } = await db.query(
            `SELECT * FROM analytics_saved_reports
             WHERE site_id = $1 AND organisation_id = $2
             ORDER BY created_at DESC`,
            [siteId, orgId]
        ).catch(() => ({ rows: [] }));
        return res.status(200).json({ reports: rows });
    }

    // ── CREATE ────────────────────────────────────────────────────────────────
    if (req.method === "POST") {
        const { name, chart_type, metrics, breakdown, filters, date_range_days } = req.body || {};
        if (!name?.trim())                                                  return res.status(400).json({ error: "name required" });
        if (!VALID_CHART_TYPES.has(chart_type))                             return res.status(400).json({ error: "invalid chart_type" });
        if (!Array.isArray(metrics) || !metrics.length || !metrics.every(m => VALID_METRICS.has(m)))
                                                                            return res.status(400).json({ error: "invalid metrics" });
        if (!VALID_BREAKDOWNS.has(breakdown))                               return res.status(400).json({ error: "invalid breakdown" });

        const { rows } = await db.query(
            `INSERT INTO analytics_saved_reports
             (site_id, organisation_id, name, chart_type, metrics, breakdown, filters, date_range_days)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [
                siteId, orgId,
                name.slice(0, 200), chart_type,
                JSON.stringify(metrics),
                breakdown,
                JSON.stringify(Array.isArray(filters) ? filters : []),
                Math.min(365, Math.max(1, parseInt(date_range_days) || 30)),
            ]
        );
        return res.status(201).json(rows[0]);
    }

    // ── UPDATE ────────────────────────────────────────────────────────────────
    if (req.method === "PUT") {
        const id = parseInt(req.query.id, 10);
        if (!id) return res.status(400).json({ error: "id required" });

        const { name, chart_type, metrics, breakdown, filters, date_range_days } = req.body || {};
        if (chart_type  && !VALID_CHART_TYPES.has(chart_type))  return res.status(400).json({ error: "invalid chart_type" });
        if (breakdown   && !VALID_BREAKDOWNS.has(breakdown))    return res.status(400).json({ error: "invalid breakdown" });
        if (metrics     && (!Array.isArray(metrics) || !metrics.every(m => VALID_METRICS.has(m))))
                                                                 return res.status(400).json({ error: "invalid metrics" });

        const { rows } = await db.query(
            `UPDATE analytics_saved_reports
             SET name            = COALESCE($3, name),
                 chart_type      = COALESCE($4, chart_type),
                 metrics         = COALESCE($5, metrics),
                 breakdown       = COALESCE($6, breakdown),
                 filters         = COALESCE($7, filters),
                 date_range_days = COALESCE($8, date_range_days),
                 updated_at      = NOW()
             WHERE id = $1 AND organisation_id = $2
             RETURNING *`,
            [
                id, orgId,
                name         ? name.slice(0, 200)           : null,
                chart_type   || null,
                metrics      ? JSON.stringify(metrics)       : null,
                breakdown    || null,
                filters      ? JSON.stringify(filters)       : null,
                date_range_days ? Math.min(365, Math.max(1, parseInt(date_range_days))) : null,
            ]
        );
        if (!rows.length) return res.status(404).json({ error: "Not found" });
        return res.status(200).json(rows[0]);
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (req.method === "DELETE") {
        const id = parseInt(req.query.id, 10);
        if (!id) return res.status(400).json({ error: "id required" });
        await db.query(
            `DELETE FROM analytics_saved_reports WHERE id = $1 AND organisation_id = $2`,
            [id, orgId]
        ).catch(() => {});
        return res.status(204).end();
    }

    return res.status(405).end();
}
