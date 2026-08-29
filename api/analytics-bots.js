import { getPool } from "./_db.js";
/**
 * GET /api/analytics-bots?domain=<domain>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>
 *
 * Returns bot/crawler traffic for a domain over a date range — the same
 * requests detectBot() in api/a.js diverted out of analytics_events, so this
 * is purely additive: it never affects the "real visitor" numbers elsewhere.
 * Requires: Authorization: Bearer <token>   Organisation: <org_id>
 */
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

    const today     = new Date().toISOString().slice(0, 10);
    const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const fromDate  = safeDate(req.query.from, thirtyAgo);
    const toDate    = safeDate(req.query.to,   today);
    const toDateExclusive = new Date(new Date(toDate).getTime() + 86400000).toISOString().slice(0, 10);

    const db = getPool();

    const { rows: siteRows } = await db.query(
        `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1`,
        [orgId, domain]
    ).catch(() => ({ rows: [] }));

    if (!siteRows.length) return res.status(200).json({ noSiteKey: true });
    const siteId = siteRows[0].id;

    const [totalsRes, categoryRes, botsRes, pagesRes, recentRes, hostRes] = await Promise.all([

        db.query(
            `SELECT COUNT(*) AS total, COUNT(DISTINCT bot_name) AS unique_bots
             FROM analytics_bot_visits
             WHERE site_id = $1 AND received_at >= $2 AND received_at < $3`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(
            `SELECT bot_category, COUNT(*) AS n
             FROM analytics_bot_visits
             WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
             GROUP BY bot_category ORDER BY n DESC`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(
            `SELECT bot_name, bot_category, COUNT(*) AS n, MAX(received_at) AS last_seen,
                    array_agg(DISTINCT page_host) FILTER (WHERE page_host IS NOT NULL) AS hosts
             FROM analytics_bot_visits
             WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
             GROUP BY bot_name, bot_category
             ORDER BY n DESC LIMIT 30`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(
            `SELECT pathname, COUNT(*) AS n
             FROM analytics_bot_visits
             WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
             GROUP BY pathname ORDER BY n DESC LIMIT 20`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(
            `SELECT received_at, bot_name, bot_category, pathname, country_code, page_host
             FROM analytics_bot_visits
             WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
             ORDER BY received_at DESC LIMIT 20`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(
            `SELECT page_host, bot_name, COUNT(*) AS n
             FROM analytics_bot_visits
             WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
               AND page_host IS NOT NULL
             GROUP BY page_host, bot_name
             ORDER BY n DESC LIMIT 50`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

    ]);

    const totals = totalsRes.rows[0] || {};

    return res.status(200).json({
        siteId,
        domain,
        from: fromDate,
        to: toDate,
        noData: !Number(totals.total || 0),
        totals: {
            total:      Number(totals.total       || 0),
            uniqueBots: Number(totals.unique_bots  || 0),
        },
        byCategory: categoryRes.rows.map(r => ({
            category: r.bot_category, n: Number(r.n || 0),
        })),
        topBots: botsRes.rows.map(r => ({
            name: r.bot_name, category: r.bot_category,
            n: Number(r.n || 0), lastSeen: r.last_seen,
            hosts: r.hosts || [],
        })),
        topPages: pagesRes.rows.map(r => ({
            pathname: r.pathname, n: Number(r.n || 0),
        })),
        recent: recentRes.rows.map(r => ({
            at: r.received_at, name: r.bot_name, category: r.bot_category,
            pathname: r.pathname, country: r.country_code, host: r.page_host,
        })),
        byHost: hostRes.rows.map(r => ({
            host: r.page_host, bot: r.bot_name, n: Number(r.n || 0),
        })),
    });
}
