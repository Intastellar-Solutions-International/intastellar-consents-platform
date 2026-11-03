import { getPool } from "./_db.js";
/**
 * GET /api/analytics-live?domain=<domain>
 *
 * Returns a 30-minute rolling window of activity for the Live View panel.
 * Polled every 30 seconds by the client — keep queries fast.
 *
 * GET /api/analytics-live?site=<siteId>&session=<sessionId>
 *
 * Detail for one active visitor (Live View's visitor drawer): their page
 * journey, events, device/source and consent choices, plus their session
 * recording if one exists. Built only from consent_level = 'full' rows:
 * pre-consent pageviews carry a session_id too (sendMinimal in api/a.js),
 * but a visitor who hasn't accepted statistics cookies must not get a
 * per-visitor profile — for them this returns 404.
 *
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

// A session_id comes from a browser-session cookie (_ia_s, see api/a.js), so
// a session can in principle span days — cap lookups so a stale tab can't
// make these queries scan arbitrarily far back.
const SESSION_LOOKBACK = "24 hours";

// Auto-collected technical events that would drown out the visitor journey.
const TECHNICAL_EVENTS = ["network_connection", "page_perf", "page_load", "scroll_depth"];

// Where a session came from, from its first pageview. Same coarse grouping as
// the Digest page's deriveChannel() (src/Pages/Analytics/Digest.js), plus ad
// click ids — those are the strongest paid signal there is. A referrer on the
// site's own domain is internal navigation, not a source.
function deriveSource(first, siteDomain) {
    if (!first) return null;
    const site = String(siteDomain || "").replace(/^www\./, "").toLowerCase();
    let host = String(first.entry_referrer || "").replace(/^www\./, "").toLowerCase();
    if (host && site && (host === site || host.endsWith("." + site))) host = "";
    const src = String(first.entry_utm_source || "").toLowerCase();
    const med = String(first.entry_utm_medium || "").toLowerCase();

    const clickIds = [
        first.has_gclid   && "Google Ads",
        first.has_msclkid && "Microsoft Ads",
        first.has_fbclid  && "Meta Ads",
    ].filter(Boolean);

    let channel = "Direct";
    if (clickIds.length || /cpc|ppc|paid|display|cpm/.test(med)) channel = "Paid";
    else if (/facebook|instagram|linkedin|twitter|x\.com|t\.co|tiktok|pinterest/.test(src + " " + host)) channel = "Social";
    else if (med === "email" || /newsletter|mail/.test(src)) channel = "Email";
    else if (med === "organic" || /(^|\.)(google|bing|duckduckgo|yahoo|yandex|ecosia)\./.test(host)) channel = "Organic Search";
    else if (src || host) channel = "Referral";

    return {
        channel,
        referrer: host || null,
        utmSource: first.entry_utm_source || null,
        utmMedium: first.entry_utm_medium || null,
        utmCampaign: first.entry_utm_campaign || null,
        clickIds,
    };
}

async function sessionDetail(db, siteId, domain, sessionId) {
    const [pvRes, evRes, recRes] = await Promise.all([
        db.query(`
            SELECT received_at, pathname, page_host, title, duration_sec, scroll_depth,
                   NULLIF(referrer_host, '') AS entry_referrer,
                   NULLIF(utm_source, '')    AS entry_utm_source,
                   NULLIF(utm_medium, '')    AS entry_utm_medium,
                   NULLIF(utm_campaign, '')  AS entry_utm_campaign,
                   gclid IS NOT NULL AS has_gclid, msclkid IS NOT NULL AS has_msclkid, fbclid IS NOT NULL AS has_fbclid,
                   country_code, device_type, browser_family, os_family, language, timezone,
                   screen_width, screen_height, viewport_width, viewport_height,
                   is_new_visitor, consent_stat, consent_func, consent_adv, consent_granular
            FROM analytics_events
            WHERE site_id = $1 AND session_id = $2 AND is_embedded = false
              AND consent_level = 'full'
              AND received_at >= NOW() - INTERVAL '${SESSION_LOOKBACK}'
            ORDER BY received_at ASC
            LIMIT 200`,
            [siteId, sessionId]
        ),
        db.query(`
            SELECT ce.received_at, ce.name, COALESCE(d.label, ce.name) AS label, d.name IS NOT NULL AS is_conversion,
                   ce.value_cents, ce.currency, ce.pathname
            FROM analytics_custom_events ce
            LEFT JOIN analytics_event_defs d ON d.site_id = ce.site_id AND d.name = ce.name
            WHERE ce.site_id = $1 AND ce.session_id = $2
              AND ce.received_at >= NOW() - INTERVAL '${SESSION_LOOKBACK}'
              AND ce.name <> ALL($3::text[])
            ORDER BY ce.received_at ASC
            LIMIT 200`,
            [siteId, sessionId, TECHNICAL_EVENTS]
        ),
        db.query(`
            SELECT id, started_at, duration_sec, status
            FROM analytics_recordings
            WHERE site_id = $1 AND session_id = $2
            ORDER BY started_at DESC
            LIMIT 1`,
            [siteId, sessionId]
        ).catch(() => ({ rows: [] })),
    ]);

    const pvs = pvRes.rows;
    const evs = evRes.rows;
    // No full-consent pageview → no profile, even if events exist.
    if (!pvs.length) return null;

    const first = pvs[0];
    const last = pvs[pvs.length - 1];
    const times = [...pvs, ...evs].map((r) => new Date(r.received_at).getTime());

    return {
        sessionId,
        startedAt: new Date(Math.min(...times)).toISOString(),
        lastSeenAt: new Date(Math.max(...times)).toISOString(),
        visitor: last ? {
            isNew: first.is_new_visitor,
            country: last.country_code,
            device: last.device_type,
            browser: last.browser_family,
            os: last.os_family,
            language: last.language,
            timezone: last.timezone,
            screen: last.screen_width ? `${last.screen_width}×${last.screen_height}` : null,
            viewport: last.viewport_width ? `${last.viewport_width}×${last.viewport_height}` : null,
        } : null,
        consent: last ? {
            statistics: last.consent_stat,
            functional: last.consent_func,
            marketing: last.consent_adv,
            granular: last.consent_granular,
        } : null,
        source: deriveSource(first, domain),
        pageviews: pvs.map((r) => ({
            at: r.received_at,
            path: r.pathname,
            host: r.page_host,
            title: r.title || null,
            durationSec: r.duration_sec,
            scrollDepth: r.scroll_depth,
        })),
        events: evs.map((r) => ({
            at: r.received_at,
            name: r.name,
            label: r.label,
            isConversion: r.is_conversion,
            valueCents: r.value_cents != null ? Number(r.value_cents) : null,
            currency: r.currency,
            path: r.pathname,
        })),
        recording: recRes.rows[0] ? {
            id: recRes.rows[0].id,
            startedAt: recRes.rows[0].started_at,
            durationSec: recRes.rows[0].duration_sec,
            status: recRes.rows[0].status,
        } : null,
    };
}

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

    const db = getPool();

    // Accept either ?site=<siteId> (preferred — bypasses domain matching) or
    // ?domain=<domain> (legacy — looks up the site key by domain).
    const rawSite   = (req.query.site   || "").trim();
    const rawDomain = (req.query.domain || "").trim().toLowerCase();
    if (!rawSite && !rawDomain) return res.status(400).json({ error: "site or domain is required" });

    let siteId, domain;
    if (rawSite) {
        // Validate the site key belongs to this org
        const { rows: siteRows } = await db.query(
            `SELECT id, domain FROM analytics_sites WHERE id = $1 AND organisation_id = $2 AND active = true LIMIT 1`,
            [rawSite, orgId]
        ).catch(() => ({ rows: [] }));
        if (!siteRows.length) return res.status(200).json({ noSiteKey: true });
        siteId = siteRows[0].id;
        domain = siteRows[0].domain;
    } else {
        const { rows: siteRows } = await db.query(
            `SELECT id, domain FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1`,
            [orgId, rawDomain]
        ).catch(() => ({ rows: [] }));
        if (!siteRows.length) return res.status(200).json({ noSiteKey: true });
        siteId = siteRows[0].id;
        domain = siteRows[0].domain;
    }

    // Prevent edge/CDN caching — live data must always be fresh
    res.setHeader("Cache-Control", "no-store");

    const rawSession = String(req.query.session || "").trim();
    if (rawSession) {
        try {
            const detail = await sessionDetail(db, siteId, domain, rawSession.slice(0, 64));
            if (!detail) return res.status(404).json({ error: "Session not found" });
            return res.status(200).json({ session: detail });
        } catch (err) {
            console.error("[analytics-live] session detail:", err);
            return res.status(500).json({ error: "Failed to load session" });
        }
    }

    const [totalsRes, minutesRes, pagesRes, hostsRes, recentRes, conversionsRes, countriesRes, activeVisitorsRes] = await Promise.all([

        // Totals across both pageviews and custom events
        db.query(`
            SELECT
                COUNT(*)                                                              AS total,
                COUNT(*) FILTER (WHERE consent_level = 'minimal')                    AS minimal,
                COUNT(*) FILTER (WHERE consent_level = 'full')                       AS full_count,
                COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)     AS sessions
            FROM (
                SELECT consent_level, session_id FROM analytics_events
                WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '30 minutes' AND is_embedded = false
                UNION ALL
                SELECT consent_level, session_id FROM analytics_custom_events
                WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '30 minutes'
            ) combined`,
            [siteId]
        ),

        // Events AND active users (distinct sessions) per minute — pageviews +
        // custom events combined. A session active across several minutes
        // counts in each of them, same "active in this minute" semantic GA4's
        // own "Active users per minute" chart uses.
        db.query(`
            SELECT
                DATE_TRUNC('minute', received_at) AS minute,
                COUNT(*) AS events,
                COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) AS active_users
            FROM (
                SELECT received_at, session_id FROM analytics_events
                WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '30 minutes' AND is_embedded = false
                UNION ALL
                SELECT received_at, session_id FROM analytics_custom_events
                WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '30 minutes'
            ) combined
            GROUP BY 1
            ORDER BY 1`,
            [siteId]
        ),

        db.query(`
            SELECT pathname, COUNT(*) AS views
            FROM analytics_events
            WHERE site_id = $1
              AND received_at >= NOW() - INTERVAL '30 minutes' AND is_embedded = false
              AND pathname !~* '^/api/'
              AND pathname !~* '\\.(js|css|json|xml|txt|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|pdf)$'
            GROUP BY pathname
            ORDER BY views DESC
            LIMIT 10`,
            [siteId]
        ),

        // Hosts actually serving this site key in the last 30 min, excluding
        // embedded/iframe traffic — kept consistent with every other query
        // in this file (and with analytics-report.js's default) rather than
        // reporting a "views" number that includes widget/iframe loads the
        // rest of the dashboard excludes.
        db.query(`
            SELECT COALESCE(page_host, '(unknown)') AS host, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = $1
              AND received_at >= NOW() - INTERVAL '30 minutes' AND is_embedded = false
            GROUP BY host ORDER BY events DESC LIMIT 10`,
            [siteId]
        ).catch(() => ({ rows: [] })),

        // Recent activity: pageviews + user-configured custom events merged, newest first.
        // Auto-collected events (network_connection, page_perf, scroll_depth, rage_click, etc.)
        // are excluded by requiring a matching row in analytics_event_defs.
        db.query(`
            SELECT received_at, pathname, page_host, country_code, device_type, consent_level,
                   NULL::text AS event_name
            FROM analytics_events
            WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '30 minutes' AND is_embedded = false
            UNION ALL
            SELECT ce.received_at, ce.pathname, ce.page_host, ce.country_code, ce.device_type, ce.consent_level,
                   ce.name AS event_name
            FROM analytics_custom_events ce
            JOIN analytics_event_defs d ON d.site_id = ce.site_id AND d.name = ce.name
            WHERE ce.site_id = $1 AND ce.received_at >= NOW() - INTERVAL '30 minutes'
            ORDER BY received_at DESC
            LIMIT 20`,
            [siteId]
        ),

        db.query(`
            SELECT
                ce.name,
                COALESCE(d.label, ce.name)          AS label,
                COUNT(*)::int                        AS count,
                SUM(ce.value_cents)                  AS total_value_cents,
                MAX(ce.currency)                     AS currency,
                MAX(ce.received_at)                  AS last_at
            FROM analytics_custom_events ce
            JOIN analytics_event_defs d
              ON d.site_id = ce.site_id AND d.name = ce.name
            WHERE ce.site_id = $1
              AND ce.received_at >= NOW() - INTERVAL '30 minutes'
            GROUP BY ce.name, d.label
            ORDER BY count DESC
            LIMIT 10`,
            [siteId]
        ).catch(() => ({ rows: [] })),

        // Active users (distinct sessions) per country in the live window —
        // same combined pageviews+custom-events union as totalsRes above.
        // Powers the Live View page's map hero and the Overview widget's
        // country table.
        db.query(`
            SELECT
                country_code,
                COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) AS active_users,
                COUNT(*) AS events
            FROM (
                SELECT country_code, session_id FROM analytics_events
                WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '30 minutes' AND is_embedded = false
                UNION ALL
                SELECT country_code, session_id FROM analytics_custom_events
                WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '30 minutes'
            ) combined
            WHERE country_code IS NOT NULL
            GROUP BY country_code
            ORDER BY active_users DESC, events DESC
            LIMIT 30`,
            [siteId]
        ).catch(() => ({ rows: [] })),

        // Current page per active visitor — the most recent pageview/custom-
        // event per session_id in the same 30-minute window the rest of this
        // file treats as "active" (there's no heartbeat/ping from the embed
        // while a visitor sits on one page, only a load event and an exit
        // event, so "latest known event per session" is the closest signal
        // to "what page are they on right now" the data model supports).
        // The LATERAL adds a per-session summary (pages, browser, entry
        // source) over the whole session, not just the live window — one
        // indexed session_id lookup per row, at most 50 rows. Full-consent
        // rows only: for a visitor without statistics consent it comes back
        // empty (pages = 0), and they stay a bare anonymous row.
        db.query(`
            SELECT latest.*, s.* FROM (
                SELECT DISTINCT ON (session_id)
                    session_id, pathname, page_host, country_code, device_type, received_at
                FROM (
                    SELECT session_id, pathname, page_host, country_code, device_type, received_at
                    FROM analytics_events
                    WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '30 minutes'
                      AND is_embedded = false AND session_id IS NOT NULL
                    UNION ALL
                    SELECT session_id, pathname, page_host, country_code, device_type, received_at
                    FROM analytics_custom_events
                    WHERE site_id = $1 AND received_at >= NOW() - INTERVAL '30 minutes'
                      AND session_id IS NOT NULL
                ) combined
                ORDER BY session_id, received_at DESC
            ) latest
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*)::int                AS pages,
                    MIN(e.received_at)           AS started_at,
                    MAX(e.browser_family)        AS browser,
                    MAX(e.os_family)             AS os,
                    BOOL_OR(e.is_new_visitor)    AS is_new,
                    (ARRAY_AGG(NULLIF(e.referrer_host, '') ORDER BY e.received_at))[1] AS entry_referrer,
                    (ARRAY_AGG(NULLIF(e.utm_source, '')    ORDER BY e.received_at))[1] AS entry_utm_source,
                    (ARRAY_AGG(NULLIF(e.utm_medium, '')    ORDER BY e.received_at))[1] AS entry_utm_medium,
                    (ARRAY_AGG(NULLIF(e.utm_campaign, '')  ORDER BY e.received_at))[1] AS entry_utm_campaign,
                    (ARRAY_AGG(e.gclid   IS NOT NULL ORDER BY e.received_at))[1] AS has_gclid,
                    (ARRAY_AGG(e.msclkid IS NOT NULL ORDER BY e.received_at))[1] AS has_msclkid,
                    (ARRAY_AGG(e.fbclid  IS NOT NULL ORDER BY e.received_at))[1] AS has_fbclid
                FROM analytics_events e
                WHERE e.site_id = $1 AND e.session_id = latest.session_id AND e.is_embedded = false
                  AND e.consent_level = 'full'
                  AND e.received_at >= NOW() - INTERVAL '${SESSION_LOOKBACK}'
            ) s ON true
            ORDER BY latest.received_at DESC
            LIMIT 50`,
            [siteId]
        ).catch(() => ({ rows: [] })),

    ]).catch(() => Array(8).fill({ rows: [] }));

    const t = totalsRes.rows[0] || {};
    const totalEvents = parseInt(t.total || 0);

    // If no events found for this site key, check whether events exist for this
    // domain under ANY site_id — a non-zero count means the tracker is running
    // but using a wrong/stale site key. Zero means the tracker isn't sending.
    let trackerMismatch = false;
    if (!totalEvents) {
        const { rows: mismatchRows } = await db.query(
            `SELECT 1 FROM analytics_events
              WHERE page_host = $1
                AND received_at >= NOW() - INTERVAL '30 minutes'
              LIMIT 1`,
            [domain]
        ).catch(() => ({ rows: [] }));
        trackerMismatch = mismatchRows.length > 0;
    }

    // Build full 30-slot minute arrays (slot 0 = 30 min ago, slot 29 = most
    // recent) — one for events, one for active users, from the same rows.
    const now = new Date();
    const minuteMap = new Map();
    for (const row of minutesRes.rows) {
        const key = new Date(row.minute).toISOString().slice(0, 16);
        minuteMap.set(key, { events: parseInt(row.events), activeUsers: parseInt(row.active_users || 0) });
    }

    const minuteSlots = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(now.getTime() - (29 - i) * 60_000);
        d.setSeconds(0, 0);
        const key = d.toISOString().slice(0, 16);
        return minuteMap.get(key) || { events: 0, activeUsers: 0 };
    });
    const perMinute = minuteSlots.map(s => s.events);
    const perMinuteUsers = minuteSlots.map(s => s.activeUsers);

    return res.status(200).json({
        asOf:     now.toISOString(),
        total:    totalEvents,
        minimal:  parseInt(t.minimal  || 0),
        full:     parseInt(t.full_count || 0),
        sessions: parseInt(t.sessions || 0),
        trackerMismatch,
        perMinute,
        perMinuteUsers,
        topPages: pagesRes.rows.map(r => ({
            pathname: r.pathname,
            views:    parseInt(r.views),
        })),
        topHosts: hostsRes.rows.map(r => ({
            host:  r.host,
            views: parseInt(r.events),
        })),
        recent: recentRes.rows.map(r => ({
            at:        r.received_at,
            path:      r.pathname,
            host:      r.page_host,
            country:   r.country_code,
            device:    r.device_type,
            level:     r.consent_level,
            eventName: r.event_name || null,
        })),
        conversions: conversionsRes.rows.map(r => ({
            name:       r.name,
            label:      r.label,
            count:      r.count,
            valueCents: r.total_value_cents ? Number(r.total_value_cents) : null,
            currency:   r.currency || null,
            lastAt:     r.last_at,
        })),
        countries: countriesRes.rows.map(r => ({
            code:        r.country_code,
            activeUsers: parseInt(r.active_users || 0),
            events:      parseInt(r.events || 0),
        })),
        activeVisitors: activeVisitorsRes.rows.map(r => ({
            sessionId: r.session_id,
            path:      r.pathname,
            host:      r.page_host,
            country:   r.country_code,
            device:    r.device_type,
            at:        r.received_at,
            fullConsent: r.pages > 0,
            browser:   r.browser || null,
            os:        r.os || null,
            isNew:     r.is_new ?? null,
            pages:     r.pages || 0,
            startedAt: r.started_at || null,
            source:    r.pages ? deriveSource(r, domain) : null,
        })),
    });
}
