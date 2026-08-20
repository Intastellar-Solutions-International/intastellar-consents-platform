/**
 * GET /api/analytics-live?domain=<domain>
 *
 * Returns a 30-minute rolling window of activity for the Live View panel.
 * Polled every 30 seconds by the client — keep queries fast.
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
    if (!domain) return res.status(400).json({ error: "domain is required" });

    const db = getPool();

    const { rows: siteRows } = await db.query(
        `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1`,
        [orgId, domain]
    ).catch(() => ({ rows: [] }));

    if (!siteRows.length) return res.status(200).json({ noSiteKey: true });

    const siteId = siteRows[0].id;

    const [totalsRes, minutesRes, pagesRes, hostsRes, recentRes] = await Promise.all([

        db.query(`
            SELECT
                COUNT(*)                                                              AS total,
                COUNT(*) FILTER (WHERE consent_level = 'minimal')                    AS minimal,
                COUNT(*) FILTER (WHERE consent_level = 'full')                       AS full_count,
                COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)     AS sessions
            FROM analytics_events
            WHERE site_id = $1
              AND received_at >= NOW() - INTERVAL '30 minutes'`,
            [siteId]
        ),

        db.query(`
            SELECT
                DATE_TRUNC('minute', received_at) AS minute,
                COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = $1
              AND received_at >= NOW() - INTERVAL '30 minutes'
            GROUP BY 1
            ORDER BY 1`,
            [siteId]
        ),

        db.query(`
            SELECT pathname, COUNT(*) AS views
            FROM analytics_events
            WHERE site_id = $1
              AND received_at >= NOW() - INTERVAL '30 minutes'
              AND pathname !~* '^/api/'
              AND pathname !~* '\\.(js|css|json|xml|txt|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|pdf)$'
            GROUP BY pathname
            ORDER BY views DESC
            LIMIT 10`,
            [siteId]
        ),

        // Hosts actually serving this site key in the last 30 min — a booking
        // widget/white-label host embedded under the same site key shows up
        // here as separate traffic from the registered domain.
        db.query(`
            SELECT COALESCE(page_host, '(unknown)') AS host, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = $1
              AND received_at >= NOW() - INTERVAL '30 minutes'
            GROUP BY host ORDER BY events DESC LIMIT 10`,
            [siteId]
        ).catch(() => ({ rows: [] })),

        db.query(`
            SELECT received_at, pathname, page_host, country_code, device_type, consent_level
            FROM analytics_events
            WHERE site_id = $1
              AND received_at >= NOW() - INTERVAL '30 minutes'
            ORDER BY received_at DESC
            LIMIT 20`,
            [siteId]
        ),

    ]).catch(() => Array(5).fill({ rows: [] }));

    const t = totalsRes.rows[0] || {};

    // Build a full 30-slot minute array (slot 0 = 30 min ago, slot 29 = most recent)
    const now = new Date();
    const minuteMap = new Map();
    for (const row of minutesRes.rows) {
        const key = new Date(row.minute).toISOString().slice(0, 16);
        minuteMap.set(key, parseInt(row.events));
    }

    const perMinute = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(now.getTime() - (29 - i) * 60_000);
        d.setSeconds(0, 0);
        const key = d.toISOString().slice(0, 16);
        return minuteMap.get(key) || 0;
    });

    return res.status(200).json({
        asOf:     now.toISOString(),
        total:    parseInt(t.total    || 0),
        minimal:  parseInt(t.minimal  || 0),
        full:     parseInt(t.full_count || 0),
        sessions: parseInt(t.sessions || 0),
        perMinute,
        topPages: pagesRes.rows.map(r => ({
            pathname: r.pathname,
            views:    parseInt(r.views),
        })),
        topHosts: hostsRes.rows.map(r => ({
            host:  r.host,
            views: parseInt(r.events),
        })),
        recent: recentRes.rows.map(r => ({
            at:      r.received_at,
            path:    r.pathname,
            host:    r.page_host,
            country: r.country_code,
            device:  r.device_type,
            level:   r.consent_level,
        })),
    });
}
