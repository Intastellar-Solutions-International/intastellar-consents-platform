/**
 * GET /api/analytics-heatmap?domain=<domain>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>[&pathname=<path>&device=all|desktop|tablet|mobile&grid=5]
 *
 * Returns bucketed click coordinates + scroll depth for a domain (optionally a
 * single pathname) over a date range, for rendering a heatmap overlay.
 * Requires: Authorization: Bearer <token>   Organisation: <org_id>
 *
 * Without `pathname`, returns the list of pathnames that have click data so
 * the dashboard can offer a picker before drilling into a specific page.
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
            connectionTimeoutMillis: 5000,
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

function safeDate(str, fallback) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? fallback : d.toISOString().slice(0, 10);
}

const DEVICE_TYPES = new Set(["desktop", "tablet", "mobile"]);

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const domain = (req.query.domain || "").trim().toLowerCase();
    if (!domain) return res.status(400).json({ error: "domain is required" });

    const pathname = (req.query.pathname || "").trim() || null;
    const device   = DEVICE_TYPES.has(req.query.device) ? req.query.device : null;
    const grid     = Math.min(20, Math.max(2, parseInt(req.query.grid, 10) || 5));

    const today     = new Date().toISOString().slice(0, 10);
    const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const fromDate  = safeDate(req.query.from, thirtyAgo);
    const toDate    = safeDate(req.query.to,   today);
    const toDateExclusive = new Date(new Date(toDate).getTime() + 86400000).toISOString().slice(0, 10);

    const db = getPool();

    const { rows: siteRows } = await db.query(
        `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND domain = $2 AND active = true LIMIT 1`,
        [orgId, domain]
    ).catch(() => ({ rows: [] }));

    if (!siteRows.length) return res.status(200).json({ noSiteKey: true });

    const siteId = siteRows[0].id;

    // ── No pathname yet: return the pathname picker list ──────────────────────
    if (!pathname) {
        const { rows: pathRows } = await db.query(
            `SELECT pathname, COUNT(*) AS clicks
             FROM analytics_clicks
             WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
             GROUP BY pathname ORDER BY clicks DESC LIMIT 50`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] }));

        return res.status(200).json({
            siteId,
            domain,
            from: fromDate,
            to: toDate,
            noData: pathRows.length === 0,
            paths: pathRows.map(r => ({ pathname: r.pathname, clicks: Number(r.clicks || 0) })),
        });
    }

    const deviceClause = device ? `AND device_type = $4` : ``;
    const clickParams  = device
        ? [siteId, fromDate, toDateExclusive, device]
        : [siteId, fromDate, toDateExclusive];

    const [clicksRes, elementsRes, scrollRes, totalRes] = await Promise.all([
        db.query(
            `SELECT
                FLOOR(x_pct / $${clickParams.length + 1}::numeric) * $${clickParams.length + 1}::numeric AS gx,
                FLOOR(y_pct / $${clickParams.length + 1}::numeric) * $${clickParams.length + 1}::numeric AS gy,
                COUNT(*) AS n
             FROM analytics_clicks
             WHERE site_id = $1 AND pathname = $${clickParams.length + 2}
               AND received_at >= $2 AND received_at < $3
               AND x_pct IS NOT NULL AND y_pct IS NOT NULL ${deviceClause}
             GROUP BY 1, 2 ORDER BY n DESC LIMIT 5000`,
            [...clickParams, grid, pathname]
        ).catch(() => ({ rows: [] })),

        db.query(
            `SELECT target_tag, target_id, target_class, target_text, COUNT(*) AS n
             FROM analytics_clicks
             WHERE site_id = $1 AND pathname = $${clickParams.length + 1}
               AND received_at >= $2 AND received_at < $3 ${deviceClause}
             GROUP BY target_tag, target_id, target_class, target_text
             ORDER BY n DESC LIMIT 30`,
            [...clickParams, pathname]
        ).catch(() => ({ rows: [] })),

        db.query(
            `SELECT FLOOR(scroll_depth / 10) * 10 AS bucket, COUNT(*) AS n
             FROM analytics_events
             WHERE site_id = $1 AND pathname = $2
               AND received_at >= $3 AND received_at < $4
               AND scroll_depth IS NOT NULL ${device ? "AND device_type = $5" : ""}
             GROUP BY 1 ORDER BY 1`,
            device
                ? [siteId, pathname, fromDate, toDateExclusive, device]
                : [siteId, pathname, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(
            `SELECT COUNT(*) AS clicks, COUNT(DISTINCT session_id) AS sessions
             FROM analytics_clicks
             WHERE site_id = $1 AND pathname = $${clickParams.length + 1}
               AND received_at >= $2 AND received_at < $3 ${deviceClause}`,
            [...clickParams, pathname]
        ).catch(() => ({ rows: [{}] })),
    ]);

    const totals = totalRes.rows[0] || {};

    return res.status(200).json({
        siteId,
        domain,
        pathname,
        from: fromDate,
        to: toDate,
        grid,
        noData: elementsRes.rows.length === 0 && clicksRes.rows.length === 0,
        totalClicks:   Number(totals.clicks   || 0),
        totalSessions: Number(totals.sessions || 0),
        clicks: clicksRes.rows.map(r => ({
            gx: Number(r.gx), gy: Number(r.gy), n: Number(r.n || 0),
        })),
        topElements: elementsRes.rows.map(r => ({
            tag: r.target_tag, id: r.target_id, className: r.target_class,
            text: r.target_text, n: Number(r.n || 0),
        })),
        scrollDepth: scrollRes.rows.map(r => ({
            bucket: Number(r.bucket), n: Number(r.n || 0),
        })),
    });
}
