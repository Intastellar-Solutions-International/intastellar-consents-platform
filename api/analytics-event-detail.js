/**
 * GET /api/analytics-event-detail?domain=<domain>&event=<name>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>
 *
 * Single-event drill-down: totals, daily series, country/device breakdown
 * for one custom event name over a date range. Requires:
 *   Authorization: Bearer <token>   Organisation: <org_id>
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
    try {
        return await _handler(req, res);
    } catch (err) {
        console.error("[analytics-event-detail] unhandled error:", err?.message, err?.stack);
        return res.status(500).json({ error: "Internal server error", message: err?.message });
    }
}

async function _handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const domain = (req.query.domain || "").trim().toLowerCase();
    if (!domain) return res.status(400).json({ error: "domain is required" });

    const eventName = (req.query.event || "").trim();
    if (!eventName) return res.status(400).json({ error: "event is required" });

    const today = new Date().toISOString().slice(0, 10);
    const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const fromDate = safeDate(req.query.from, thirtyAgo);
    const toDate   = safeDate(req.query.to,   today);
    const toDateExclusive = new Date(new Date(toDate).getTime() + 86400000).toISOString().slice(0, 10);

    const db = getPool();

    const { rows: siteRows } = await db.query(
        `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1`,
        [orgId, domain]
    ).catch(() => ({ rows: [] }));

    if (!siteRows.length) return res.status(200).json({ noSiteKey: true });
    const siteId = siteRows[0].id;

    const [totalsRes, dailyRes, countriesRes, devicesRes, defRes] = await Promise.all([
        db.query(
            `SELECT
                COUNT(*)                                                          AS total,
                COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) AS sessions
             FROM analytics_custom_events
             WHERE site_id = $1 AND name = $2 AND received_at >= $3 AND received_at < $4`,
            [siteId, eventName, fromDate, toDateExclusive]
        ),
        db.query(
            `SELECT
                TO_CHAR(DATE_TRUNC('day', received_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
                COUNT(*) AS num
             FROM analytics_custom_events
             WHERE site_id = $1 AND name = $2 AND received_at >= $3 AND received_at < $4
             GROUP BY 1 ORDER BY 1`,
            [siteId, eventName, fromDate, toDateExclusive]
        ),
        db.query(
            `SELECT country_code AS code, COUNT(*) AS events
             FROM analytics_custom_events
             WHERE site_id = $1 AND name = $2 AND received_at >= $3 AND received_at < $4
               AND country_code IS NOT NULL
             GROUP BY country_code ORDER BY events DESC LIMIT 15`,
            [siteId, eventName, fromDate, toDateExclusive]
        ),
        db.query(
            `SELECT device_type AS type, COUNT(*) AS events
             FROM analytics_custom_events
             WHERE site_id = $1 AND name = $2 AND received_at >= $3 AND received_at < $4
               AND device_type IS NOT NULL
             GROUP BY device_type ORDER BY events DESC`,
            [siteId, eventName, fromDate, toDateExclusive]
        ),
        db.query(
            `SELECT name, kind, label FROM analytics_event_defs WHERE site_id = $1 AND name = $2 LIMIT 1`,
            [siteId, eventName]
        ).catch((err) => {
            if (err?.message?.includes("does not exist")) return { rows: [] };
            throw err;
        }),
    ]);

    const total    = Number(totalsRes.rows[0]?.total || 0);
    const sessions = Number(totalsRes.rows[0]?.sessions || 0);
    const eventsPerSession = sessions > 0 ? Math.round((total / sessions) * 100) / 100 : null;

    const def = defRes.rows[0] || null;

    return res.status(200).json({
        event: {
            name: eventName,
            label: def?.label || eventName,
            kind: def?.kind || null,
        },
        total,
        sessions,
        eventsPerSession,
        daily: dailyRes.rows.map(r => ({ date: r.date, num: Number(r.num) })),
        countries: countriesRes.rows.map(r => ({ code: r.code, events: Number(r.events) })),
        devices: devicesRes.rows.map(r => ({ type: r.type, events: Number(r.events) })),
    });
}
