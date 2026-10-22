import { getPool } from "./_db.js";
/**
 * GET /api/analytics-attribution?domain=example.com&from=2024-01-01&to=2024-01-31
 *
 * Returns conversion attribution data: which conversions came from ad clicks,
 * push status per platform, and summary stats.
 *
 * Required headers: Authorization: Bearer <token>, Organisation: <org_id>
 */
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

    // Full auto-collected event list (mirrors AUTO_EVENT_NAMES in
    // src/Pages/Analytics/Conversions.js exactly — no exceptions) — excluded
    // so this page shows only actual user-defined conversions (purchase,
    // lead, and the e-commerce kinds registered via the Events & Tracking
    // "Add event" form), not interaction/engagement events like scroll_depth
    // or page_load that happened to fire with a click ID attached. api/ and
    // src/ aren't cross-imported in this project, so this list is kept in
    // sync by hand with Conversions.js.
    const NON_CONVERSION_AUTO_EVENTS = [
        "outbound_click", "scroll_depth", "form_submit", "form_started", "form_step",
        "file_download", "video_play", "video_complete", "video_50pct",
        "phone_click", "email_click", "content_copy", "page_print",
        "rage_click", "video_pause", "page_perf", "page_load", "form_error",
        "form_success", "form_field_focus", "network_connection",
    ];

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
           AND NOT (ace.name = ANY($5::text[]))
         ORDER BY ace.received_at DESC
         LIMIT 500`,
        [orgId, domain, fromDate, toDate, NON_CONVERSION_AUTO_EVENTS]
    ).catch(() => ({ rows: [] }));

    // Push status for these events
    const { rows: pushes } = await db.query(
        `SELECT p.id, p.custom_event_id, p.platform, p.status, p.pushed_at, p.error_message
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
