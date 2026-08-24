/**
 * GET /api/analytics-event-payloads?domain=<domain>&name=<eventName>&limit=<n>
 *
 * Recent raw analytics_custom_events rows for one event that carried extra
 * data (see api/a.js's track(name, { data: {...} })) — the Conversions page
 * uses this to show what a "verification_code_send_failed"-style event
 * actually recorded (e.g. { reason: 'invalid_phone_format' }) rather than
 * just the aggregate count. Only rows with non-null extra_data are returned;
 * an event with none simply gets an empty list, no error.
 *
 * Requires: Authorization: Bearer <token>   Organisation: <org_id>
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

const MAX_LIMIT = 50;

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

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const domain = (req.query.domain || "").trim().toLowerCase();
    const name   = (req.query.name   || "").trim();
    if (!domain) return res.status(400).json({ error: "domain is required" });
    if (!name)   return res.status(400).json({ error: "name is required" });

    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const db = getPool();

    const { rows: siteRows } = await db.query(
        `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1`,
        [orgId, domain]
    ).catch(() => ({ rows: [] }));

    if (!siteRows.length) return res.status(200).json({ rows: [] });
    const siteId = siteRows[0].id;

    const { rows } = await db.query(
        `SELECT received_at, pathname, extra_data
         FROM analytics_custom_events
         WHERE site_id = $1 AND name = $2 AND extra_data IS NOT NULL
         ORDER BY received_at DESC
         LIMIT $3`,
        [siteId, name, limit]
    ).catch(() => ({ rows: [] }));

    return res.status(200).json({
        rows: rows.map(r => ({
            receivedAt: r.received_at,
            pathname: r.pathname,
            data: r.extra_data,
        })),
    });
}
