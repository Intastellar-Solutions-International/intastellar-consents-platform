/**
 * GET /api/analytics-attribution?domain=example.com&from=2024-01-01&to=2024-01-31
 *
 * Returns conversion attribution data: which conversions came from ad clicks,
 * push status per platform, and summary stats.
 *
 * Required headers: Authorization: Bearer <token>, Organisation: <org_id>
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

const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
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

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || req.headers.organization || "0", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const { domain, from, to } = req.query;
    if (!domain) return res.status(400).json({ error: "?domain= required" });

    const fromDate = from || new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const toDate   = to   || new Date().toISOString().slice(0, 10);

    const db = getPool();

    // Attributed conversions (custom events with click IDs)
    const { rows: attributed } = await db.query(
        `SELECT
           ace.id,
           ace.name            AS event_name,
           ace.value_cents,
           ace.currency,
           ace.received_at,
           ace.gclid,
           ace.msclkid,
           ace.fbclid,
           ace.pathname,
           ace.country_code,
           ace.device_type,
           ace.utm_campaign,
           ace.utm_content
         FROM analytics_custom_events ace
         JOIN analytics_sites s ON s.id = ace.site_id
         WHERE ace.organisation_id = $1
           AND s.domain = $2
           AND ace.received_at >= $3::date
           AND ace.received_at <  $4::date + INTERVAL '1 day'
           AND (ace.gclid IS NOT NULL OR ace.msclkid IS NOT NULL OR ace.fbclid IS NOT NULL)
         ORDER BY ace.received_at DESC
         LIMIT 500`,
        [orgId, domain, fromDate, toDate]
    ).catch(() => ({ rows: [] }));

    // Push status for these events
    const { rows: pushes } = await db.query(
        `SELECT p.custom_event_id, p.platform, p.status, p.pushed_at, p.error_message
         FROM analytics_conversion_pushes p
         JOIN analytics_sites s ON s.id = p.site_id
         WHERE p.organisation_id = $1
           AND s.domain = $2
           AND p.created_at >= $3::date
           AND p.created_at <  $4::date + INTERVAL '1 day'`,
        [orgId, domain, fromDate, toDate]
    ).catch(() => ({ rows: [] }));

    // Index push status by event ID
    const pushByEvent = {};
    for (const p of pushes) {
        if (!pushByEvent[p.custom_event_id]) pushByEvent[p.custom_event_id] = [];
        pushByEvent[p.custom_event_id].push(p);
    }

    // Summary stats: attribution breakdown by platform
    const platformCounts = { google_ads: 0, meta_ads: 0, microsoft_ads: 0 };
    let totalAttributed = 0;
    let totalAttributedValue = 0;

    for (const ev of attributed) {
        totalAttributed++;
        if (ev.value_cents) totalAttributedValue += ev.value_cents;
        if (ev.gclid)   platformCounts.google_ads++;
        if (ev.fbclid)  platformCounts.meta_ads++;
        if (ev.msclkid) platformCounts.microsoft_ads++;
    }

    const pushStats = { pending: 0, sent: 0, failed: 0 };
    for (const p of pushes) pushStats[p.status] = (pushStats[p.status] || 0) + 1;

    // Enrich events with push status
    const enriched = attributed.map(ev => ({
        ...ev,
        platforms: [
            ev.gclid   && "google_ads",
            ev.fbclid  && "meta_ads",
            ev.msclkid && "microsoft_ads",
        ].filter(Boolean),
        pushes: pushByEvent[ev.id] || [],
    }));

    return res.status(200).json({
        attributed: enriched,
        summary: {
            totalAttributed,
            totalAttributedValueCents: totalAttributedValue,
            platformCounts,
            pushStats,
        },
    });
}
