/**
 * GET /api/analytics-report?domain=<domain>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>
 *
 * Returns aggregated first-party analytics for a domain over a date range.
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

    const today = new Date().toISOString().slice(0, 10);
    const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const fromDate = safeDate(req.query.from, thirtyAgo);
    const toDate   = safeDate(req.query.to,   today);

    // Inclusive end: add 1 day so "toDate" includes the full day
    const toDateExclusive = new Date(new Date(toDate).getTime() + 86400000).toISOString().slice(0, 10);

    const db = getPool();

    // Look up site key for this org+domain
    const { rows: siteRows } = await db.query(
        `SELECT id, lead_quality_enabled, lead_require_engaged, lead_qualifying_pages, lead_qualifying_events
         FROM analytics_sites WHERE organisation_id = $1 AND domain = $2 AND active = true LIMIT 1`,
        [orgId, domain]
    ).catch(() => ({ rows: [] }));

    if (!siteRows.length) {
        return res.status(200).json({ noSiteKey: true });
    }

    const siteId = siteRows[0].id;
    const leadQualityEnabled = siteRows[0].lead_quality_enabled === true;
    const leadRequireEngaged = siteRows[0].lead_require_engaged !== false;
    const leadQualifyingPages = Array.isArray(siteRows[0].lead_qualifying_pages) ? siteRows[0].lead_qualifying_pages : [];
    const leadQualifyingEvents = Array.isArray(siteRows[0].lead_qualifying_events) ? siteRows[0].lead_qualifying_events : [];

    // Run all aggregations in parallel
    const [totalsRes, dailyRes, pagesRes, countriesRes, devicesRes,
           browsersRes, consentRes, utmRes, conversionsRes, eventDefsRes,
           osRes, screensRes, languagesRes, timezonesRes, engagedRes, leadRes] = await Promise.all([

        db.query(`
            SELECT
                COUNT(*)                                                        AS total,
                COUNT(*) FILTER (WHERE consent_level = 'minimal')              AS minimal,
                COUNT(*) FILTER (WHERE consent_level = 'full')                 AS full_count,
                COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) AS unique_sessions,
                COUNT(*) FILTER (WHERE consent_stat = true)                    AS stat_yes,
                COUNT(*) FILTER (WHERE consent_stat = false OR consent_stat IS NULL) AS stat_no
            FROM analytics_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3`,
            [siteId, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT
                TO_CHAR(DATE_TRUNC('day', received_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
                COUNT(*) FILTER (WHERE consent_level = 'minimal')  AS minimal,
                COUNT(*) FILTER (WHERE consent_level = 'full')     AS full_count
            FROM analytics_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
            GROUP BY 1 ORDER BY 1`,
            [siteId, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT
                pathname,
                COUNT(*)                                                          AS views,
                COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) AS sessions
            FROM analytics_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
            GROUP BY pathname ORDER BY views DESC LIMIT 20`,
            [siteId, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT country_code, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
              AND country_code IS NOT NULL
            GROUP BY country_code ORDER BY events DESC LIMIT 15`,
            [siteId, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT device_type, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
              AND device_type IS NOT NULL
            GROUP BY device_type ORDER BY events DESC`,
            [siteId, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT browser_family, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = $1 AND consent_level = 'full'
              AND received_at >= $2 AND received_at < $3
              AND browser_family IS NOT NULL AND browser_family != 'other'
            GROUP BY browser_family ORDER BY events DESC LIMIT 8`,
            [siteId, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT
                COUNT(*) FILTER (WHERE consent_stat = true)  AS stat_yes,
                COUNT(*) FILTER (WHERE consent_stat = false) AS stat_no,
                COUNT(*) FILTER (WHERE consent_func = true)  AS func_yes,
                COUNT(*) FILTER (WHERE consent_func = false) AS func_no,
                COUNT(*) FILTER (WHERE consent_adv  = true)  AS adv_yes,
                COUNT(*) FILTER (WHERE consent_adv  = false) AS adv_no
            FROM analytics_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3`,
            [siteId, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT utm_source, utm_medium, utm_campaign, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = $1 AND consent_level = 'full'
              AND received_at >= $2 AND received_at < $3
              AND utm_source IS NOT NULL AND utm_source != ''
            GROUP BY utm_source, utm_medium, utm_campaign ORDER BY events DESC LIMIT 20`,
            [siteId, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT
                name,
                COUNT(*)                                                          AS count,
                COUNT(*) FILTER (WHERE consent_level = 'full')                   AS linked_count,
                COALESCE(SUM(value_cents), 0)                                     AS value_cents,
                (ARRAY_AGG(currency) FILTER (WHERE currency IS NOT NULL))[1]      AS currency
            FROM analytics_custom_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
            GROUP BY name ORDER BY count DESC LIMIT 30`,
            [siteId, fromDate, toDateExclusive]
        ).catch((err) => {
            if (err?.message?.includes("does not exist")) return { rows: [] };
            throw err;
        }),

        db.query(`
            SELECT name, kind, label FROM analytics_event_defs WHERE site_id = $1`,
            [siteId]
        ).catch((err) => {
            if (err?.message?.includes("does not exist")) return { rows: [] };
            throw err;
        }),

        db.query(`
            SELECT os_family, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = $1 AND consent_level = 'full'
              AND received_at >= $2 AND received_at < $3
              AND os_family IS NOT NULL AND os_family != 'other'
            GROUP BY os_family ORDER BY events DESC LIMIT 8`,
            [siteId, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT screen_width, screen_height, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = $1 AND consent_level = 'full'
              AND received_at >= $2 AND received_at < $3
              AND screen_width IS NOT NULL
            GROUP BY screen_width, screen_height ORDER BY events DESC LIMIT 10`,
            [siteId, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT language, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = $1 AND consent_level = 'full'
              AND received_at >= $2 AND received_at < $3
              AND language IS NOT NULL AND language != ''
            GROUP BY language ORDER BY events DESC LIMIT 15`,
            [siteId, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT timezone, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = $1 AND consent_level = 'full'
              AND received_at >= $2 AND received_at < $3
              AND timezone IS NOT NULL AND timezone != ''
            GROUP BY timezone ORDER BY events DESC LIMIT 15`,
            [siteId, fromDate, toDateExclusive]
        ),

        // "Active users" — distinct sessions that actually engaged, not just
        // showed up: lasted >=10s (the standard "engaged session" threshold),
        // viewed more than one page, or clicked something. Filters out instant
        // bounces / bot-like single-ping visits that slipped past detectBot().
        db.query(`
            WITH session_stats AS (
                SELECT session_id, MAX(duration_sec) AS max_duration, COUNT(*) AS pageviews
                FROM analytics_events
                WHERE site_id = $1 AND consent_level = 'full'
                  AND received_at >= $2 AND received_at < $3
                  AND session_id IS NOT NULL
                GROUP BY session_id
            )
            SELECT COUNT(*) AS engaged
            FROM session_stats s
            WHERE s.max_duration >= 10
               OR s.pageviews > 1
               OR EXISTS (
                    SELECT 1 FROM analytics_clicks c
                    WHERE c.site_id = $1 AND c.session_id = s.session_id
                      AND c.received_at >= $2 AND c.received_at < $3
               )`,
            [siteId, fromDate, toDateExclusive]
        ).catch((err) => {
            if (err?.message?.includes("does not exist")) return { rows: [] };
            throw err;
        }),

        // "Quality leads" — only computed when the site has configured it
        // (see Settings > Analytics Script > Lead quality). A session counts
        // when it's engaged (same criteria as engagedUsers, skipped if the
        // site didn't require it) AND it either visited one of the
        // configured pages or fired one of the configured events. Empty
        // page/event lists mean "no sessions qualify" here, not "everyone
        // qualifies" — lead quality has to actually be configured to count.
        leadQualityEnabled
            ? db.query(`
                WITH session_stats AS (
                    SELECT session_id, MAX(duration_sec) AS max_duration, COUNT(*) AS pageviews
                    FROM analytics_events
                    WHERE site_id = $1 AND consent_level = 'full'
                      AND received_at >= $2 AND received_at < $3
                      AND session_id IS NOT NULL
                    GROUP BY session_id
                )
                SELECT COUNT(*) AS leads
                FROM session_stats s
                WHERE ($4::boolean = false
                       OR s.max_duration >= 10
                       OR s.pageviews > 1
                       OR EXISTS (SELECT 1 FROM analytics_clicks c
                                  WHERE c.site_id = $1 AND c.session_id = s.session_id
                                    AND c.received_at >= $2 AND c.received_at < $3))
                  AND (
                    (cardinality($5::text[]) > 0 AND EXISTS (
                        SELECT 1 FROM analytics_events pe
                        WHERE pe.site_id = $1 AND pe.session_id = s.session_id
                          AND pe.pathname = ANY($5) AND pe.received_at >= $2 AND pe.received_at < $3))
                    OR
                    (cardinality($6::text[]) > 0 AND EXISTS (
                        SELECT 1 FROM analytics_custom_events ce
                        WHERE ce.site_id = $1 AND ce.session_id = s.session_id
                          AND ce.name = ANY($6) AND ce.received_at >= $2 AND ce.received_at < $3))
                  )`,
                [siteId, fromDate, toDateExclusive, leadRequireEngaged, leadQualifyingPages, leadQualifyingEvents]
            ).catch((err) => {
                if (err?.message?.includes("does not exist")) return { rows: [] };
                throw err;
            })
            : Promise.resolve({ rows: [] }),

    ]).catch((err) => {
        // Table may not exist yet
        if (err?.message?.includes("does not exist")) return Array(16).fill({ rows: [] });
        throw err;
    });

    const t = totalsRes.rows[0] || {};
    const total = Number(t.total || 0);

    return res.status(200).json({
        siteId,
        domain,
        from: fromDate,
        to: toDate,
        noData: total === 0,
        totals: {
            total,
            minimal:        Number(t.minimal     || 0),
            full:           Number(t.full_count  || 0),
            uniqueSessions: Number(t.unique_sessions || 0),
            engagedUsers:   Number(engagedRes.rows[0]?.engaged || 0),
            qualityLeads:   leadQualityEnabled ? Number(leadRes.rows[0]?.leads || 0) : null,
            consentRate:    total > 0
                ? Math.round((Number(t.full_count || t.stat_yes || 0) / total) * 1000) / 10
                : 0,
        },
        daily: dailyRes.rows.map(r => ({
            date:     r.date,
            minimal:  Number(r.minimal     || 0),
            full:     Number(r.full_count  || 0),
        })),
        topPages: pagesRes.rows.map(r => ({
            pathname: r.pathname,
            views:    Number(r.views    || 0),
            sessions: Number(r.sessions || 0),
        })),
        countries: countriesRes.rows.map(r => ({
            code:   r.country_code,
            events: Number(r.events || 0),
        })),
        devices: devicesRes.rows.map(r => ({
            type:   r.device_type,
            events: Number(r.events || 0),
        })),
        browsers: browsersRes.rows.map(r => ({
            name:   r.browser_family,
            events: Number(r.events || 0),
        })),
        os: osRes.rows.map(r => ({
            name:   r.os_family,
            events: Number(r.events || 0),
        })),
        screens: screensRes.rows.map(r => ({
            width:  Number(r.screen_width),
            height: Number(r.screen_height),
            events: Number(r.events || 0),
        })),
        languages: languagesRes.rows.map(r => ({
            lang:   r.language,
            events: Number(r.events || 0),
        })),
        timezones: timezonesRes.rows.map(r => ({
            tz:     r.timezone,
            events: Number(r.events || 0),
        })),
        consent: (() => {
            const c = consentRes.rows[0] || {};
            return {
                stat: { yes: Number(c.stat_yes || 0), no: Number(c.stat_no || 0) },
                func: { yes: Number(c.func_yes || 0), no: Number(c.func_no || 0) },
                adv:  { yes: Number(c.adv_yes  || 0), no: Number(c.adv_no  || 0) },
            };
        })(),
        utmSources: utmRes.rows.map(r => ({
            source:   r.utm_source,
            medium:   r.utm_medium,
            campaign: r.utm_campaign || null,
            events:   Number(r.events || 0),
        })),
        conversions: (() => {
            const defsByName = new Map(eventDefsRes.rows.map(d => [d.name, d]));
            const seen = new Set();
            const rows = conversionsRes.rows.map(r => {
                seen.add(r.name);
                const def = defsByName.get(r.name);
                return {
                    name:        r.name,
                    label:       def?.label || r.name,
                    kind:        def?.kind || "custom",
                    count:       Number(r.count || 0),
                    linkedCount: Number(r.linked_count || 0),
                    value:       Number(r.value_cents || 0) / 100,
                    currency:    r.currency || null,
                };
            });
            // Registered events with zero occurrences in this window still show up
            eventDefsRes.rows
                .filter(d => !seen.has(d.name))
                .forEach(d => rows.push({
                    name: d.name, label: d.label || d.name, kind: d.kind,
                    count: 0, linkedCount: 0, value: 0, currency: null,
                }));
            return rows;
        })(),
    });
}
