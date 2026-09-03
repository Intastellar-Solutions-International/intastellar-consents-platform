/**
 * GET    /api/analytics-interest-rules?domain=<domain>
 * POST   /api/analytics-interest-rules?domain=<domain>   { label, pattern, color? }
 * DELETE /api/analytics-interest-rules?domain=<domain>&id=<id>
 *
 * Manages per-site URL-pattern → interest-label mapping rules used by
 * the "Users by Interests" panel in the Audience analytics report.
 * Requires: Authorization: Bearer <token>   Organisation: <org_id>
 */

import { getPool } from "./_db.js";

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

async function ensureTable(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_interest_rules (
            id              BIGSERIAL    PRIMARY KEY,
            site_id         VARCHAR(32)  NOT NULL,
            organisation_id INT          NOT NULL,
            interest_label  VARCHAR(80)  NOT NULL,
            pattern         VARCHAR(255) NOT NULL,
            color           VARCHAR(7),
            sort_order      INT          NOT NULL DEFAULT 0,
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
    `);
}

export default async function handler(req, res) {
    try {
        return await _handler(req, res);
    } catch (err) {
        console.error("[analytics-interest-rules] unhandled error:", err?.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}

async function _handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers["organisation"] || req.headers["organization"] || "0", 10);
    if (!orgId) return res.status(400).json({ error: "Missing Organisation header" });

    const domain = (req.query.domain || "").trim().toLowerCase();
    if (!domain) return res.status(400).json({ error: "Missing domain parameter" });

    const db = getPool();
    await ensureTable(db);

    const { rows: siteRows } = await db.query(
        `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1`,
        [orgId, domain]
    );
    if (!siteRows.length) return res.status(404).json({ error: "Site not found" });
    const siteId = siteRows[0].id;

    if (req.method === "GET") {
        const { rows } = await db.query(
            `SELECT id, interest_label AS label, pattern, color, sort_order AS "sortOrder"
             FROM analytics_interest_rules
             WHERE site_id = $1
             ORDER BY sort_order ASC, created_at ASC`,
            [siteId]
        );
        return res.status(200).json({ rules: rows });
    }

    if (req.method === "POST") {
        const { label, pattern, color } = req.body || {};
        if (!label?.trim()) return res.status(400).json({ error: "label is required" });
        if (!pattern?.trim()) return res.status(400).json({ error: "pattern is required" });
        if (label.trim().length > 80) return res.status(400).json({ error: "label must be 80 characters or fewer" });
        if (pattern.trim().length > 255) return res.status(400).json({ error: "pattern must be 255 characters or fewer" });

        const { rows: countRows } = await db.query(
            `SELECT COUNT(*) AS c FROM analytics_interest_rules WHERE site_id = $1`, [siteId]
        );
        if (Number(countRows[0]?.c) >= 30) {
            return res.status(400).json({ error: "Maximum of 30 interest rules per site" });
        }

        const { rows } = await db.query(
            `INSERT INTO analytics_interest_rules (site_id, organisation_id, interest_label, pattern, color)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, interest_label AS label, pattern, color`,
            [siteId, orgId, label.trim(), pattern.trim(), color?.trim() || null]
        );
        return res.status(201).json({ rule: rows[0] });
    }

    if (req.method === "DELETE") {
        const id = parseInt(req.query.id || "0", 10);
        if (!id) return res.status(400).json({ error: "Missing id parameter" });
        await db.query(
            `DELETE FROM analytics_interest_rules WHERE id = $1 AND site_id = $2 AND organisation_id = $3`,
            [id, siteId, orgId]
        );
        return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
}
