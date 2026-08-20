/**
 * GET /api/analytics-report?domain=<domain>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>
 *
 * Returns aggregated first-party analytics for a domain over a date range.
 * Requires: Authorization: Bearer <token>   Organisation: <org_id>
 */

import pkg from "pg";
const { Pool } = pkg;
import { INDUSTRY_BENCHMARKS } from "./_industry-benchmarks.js";

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
        `SELECT id, lead_quality_enabled, lead_require_engaged, lead_qualifying_pages, lead_qualifying_events, industry
         FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1`,
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
    const industry = siteRows[0].industry || null;
    const industryBenchmark = industry && INDUSTRY_BENCHMARKS[industry]
        ? { industry, label: INDUSTRY_BENCHMARKS[industry].label, consentRatePct: INDUSTRY_BENCHMARKS[industry].consentRatePct }
        : null;

    // Run all aggregations in parallel
    const [totalsRes, dailyRes, pagesRes, countriesRes, devicesRes,
           browsersRes, consentRes, utmRes, referrersRes, hostsRes, conversionsRes, eventDefsRes,
           conversionCountriesRes, convertedSessionsRes,
           osRes, screensRes, languagesRes, timezonesRes, engagedRes, leadRes,
           dailyConversionsRes, timeToConvertRes, funnelRes,
           conversionsByChannelRes, conversionsByDeviceRes, conversionsByCampaignRes] = await Promise.all([

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

        // Referrers — where visitors came from regardless of UTM tagging (a
        // third-party site linking in, a social share, a search result with
        // no UTM, etc). Un-referred traffic is grouped as "(direct)", same
        // convention most analytics tools use, so this one table gives the
        // full referral/direct picture rather than just the tagged slice.
        db.query(`
            SELECT COALESCE(referrer_host, '(direct)') AS referrer,
                   COUNT(*)                                                          AS events,
                   COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)  AS sessions
            FROM analytics_events
            WHERE site_id = $1 AND consent_level = 'full'
              AND received_at >= $2 AND received_at < $3
            GROUP BY referrer ORDER BY events DESC LIMIT 20`,
            [siteId, fromDate, toDateExclusive]
        ).catch((err) => {
            if (err?.message?.includes("does not exist")) return { rows: [] };
            throw err;
        }),

        // Hosts — the hostname the embed actually ran on (location.hostname),
        // not the site's registered domain. Normally a single row matching
        // `domain`, but a site key embedded on a booking widget / white-label
        // subdomain (e.g. a booking system on a different host than the main
        // site) shows up here as separate cross-site traffic under the same
        // site key, which referrer_host/topPages alone wouldn't surface.
        db.query(`
            SELECT COALESCE(page_host, '(unknown)') AS host,
                   COUNT(*)                                                          AS events,
                   COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)  AS sessions
            FROM analytics_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
            GROUP BY host ORDER BY events DESC LIMIT 20`,
            [siteId, fromDate, toDateExclusive]
        ).catch((err) => {
            if (err?.message?.includes("does not exist")) return { rows: [] };
            throw err;
        }),

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

        // Where conversions happen geographically — same {code, events} shape
        // as the general `countries` query so AnalyticsWorldMap can reuse it.
        db.query(`
            SELECT country_code, COUNT(*) AS events
            FROM analytics_custom_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
              AND country_code IS NOT NULL
            GROUP BY country_code ORDER BY events DESC LIMIT 15`,
            [siteId, fromDate, toDateExclusive]
        ).catch((err) => {
            if (err?.message?.includes("does not exist")) return { rows: [] };
            throw err;
        }),

        // Distinct sessions that fired at least one conversion event — the
        // numerator for conversion rate (denominator is unique_sessions above).
        db.query(`
            SELECT COUNT(DISTINCT session_id) AS converted
            FROM analytics_custom_events
            WHERE site_id = $1 AND session_id IS NOT NULL
              AND received_at >= $2 AND received_at < $3`,
            [siteId, fromDate, toDateExclusive]
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

        // Daily conversion volume — trend line for the conversions dashboard.
        // Split by consent_level so the trend can also show how much of it
        // is session-linked vs not, same convention as the `daily` pageview series.
        db.query(`
            SELECT
                TO_CHAR(DATE_TRUNC('day', received_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
                COUNT(*)                                        AS count,
                COUNT(*) FILTER (WHERE consent_level = 'full')  AS linked_count
            FROM analytics_custom_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
            GROUP BY 1 ORDER BY 1`,
            [siteId, fromDate, toDateExclusive]
        ).catch((err) => {
            if (err?.message?.includes("does not exist")) return { rows: [] };
            throw err;
        }),

        // Time-to-convert — elapsed time between a session's first-seen event
        // and each conversion it fired. Only measurable for session-linked
        // (consent_level='full') conversions, since minimal-consent events
        // carry no session_id to anchor a "first seen" timestamp against.
        db.query(`
            WITH first_seen AS (
                SELECT session_id, MIN(received_at) AS first_at
                FROM analytics_events
                WHERE site_id = $1 AND session_id IS NOT NULL
                  AND received_at >= $2 AND received_at < $3
                GROUP BY session_id
            ),
            deltas AS (
                SELECT EXTRACT(EPOCH FROM (ce.received_at - fs.first_at)) AS secs
                FROM analytics_custom_events ce
                JOIN first_seen fs ON fs.session_id = ce.session_id
                WHERE ce.site_id = $1 AND ce.received_at >= $2 AND ce.received_at < $3
                  AND ce.received_at >= fs.first_at
            )
            SELECT
                COUNT(*)                                                     AS sample_size,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY secs)             AS median_secs,
                COUNT(*) FILTER (WHERE secs < 60)                            AS b_under_1m,
                COUNT(*) FILTER (WHERE secs >= 60   AND secs < 300)          AS b_1_5m,
                COUNT(*) FILTER (WHERE secs >= 300  AND secs < 1800)         AS b_5_30m,
                COUNT(*) FILTER (WHERE secs >= 1800 AND secs < 3600)         AS b_30_60m,
                COUNT(*) FILTER (WHERE secs >= 3600 AND secs < 86400)        AS b_1_24h,
                COUNT(*) FILTER (WHERE secs >= 86400)                        AS b_over_24h
            FROM deltas`,
            [siteId, fromDate, toDateExclusive]
        ).catch((err) => {
            if (err?.message?.includes("does not exist")) return { rows: [] };
            throw err;
        }),

        // Funnel — distinct-session counts per registered e-commerce funnel
        // kind (view_basket → begin_checkout → checkout → purchase). Uses
        // distinct sessions rather than raw event counts so a step fired
        // twice in one session doesn't inflate the funnel.
        db.query(`
            SELECT
                d.kind,
                COUNT(*)                                                          AS count,
                COUNT(DISTINCT ce.session_id) FILTER (WHERE ce.session_id IS NOT NULL) AS sessions
            FROM analytics_custom_events ce
            JOIN analytics_event_defs d ON d.site_id = ce.site_id AND d.name = ce.name
            WHERE ce.site_id = $1 AND ce.received_at >= $2 AND ce.received_at < $3
              AND d.kind IN ('view_basket','begin_checkout','checkout','purchase')
            GROUP BY d.kind`,
            [siteId, fromDate, toDateExclusive]
        ).catch((err) => {
            if (err?.message?.includes("does not exist")) return { rows: [] };
            throw err;
        }),

        // Conversions by channel — classified off each session's first-touch
        // acquisition data (utm_medium / referrer_host), same as
        // time-to-convert / funnel, only measurable for session-linked
        // conversions. Buckets are deliberately kept to the four the
        // dashboard shows: UTM-tagged traffic that isn't explicitly
        // "organic" is folded into "paid" rather than adding email/social
        // buckets the UI doesn't have room for.
        db.query(`
            WITH first_touch AS (
                SELECT DISTINCT ON (session_id) session_id, utm_source, utm_medium, referrer_host
                FROM analytics_events
                WHERE site_id = $1 AND session_id IS NOT NULL
                  AND received_at >= $2 AND received_at < $3
                ORDER BY session_id, received_at ASC
            )
            SELECT
                CASE
                    WHEN ft.utm_medium ~* '^(cpc|ppc|paid|cpm|display)'                         THEN 'paid'
                    WHEN ft.utm_medium = 'organic'
                         OR (COALESCE(ft.utm_source, '') = ''
                             AND ft.referrer_host ~* '(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia)\.') THEN 'organic'
                    WHEN COALESCE(ft.referrer_host, '') != ''                                    THEN 'referral'
                    WHEN COALESCE(ft.utm_source, '') != ''                                       THEN 'paid'
                    ELSE 'direct'
                END AS channel,
                COUNT(*)                              AS count,
                COUNT(DISTINCT ce.session_id)          AS sessions
            FROM analytics_custom_events ce
            JOIN first_touch ft ON ft.session_id = ce.session_id
            WHERE ce.site_id = $1 AND ce.received_at >= $2 AND ce.received_at < $3
            GROUP BY 1`,
            [siteId, fromDate, toDateExclusive]
        ).catch((err) => {
            if (err?.message?.includes("does not exist")) return { rows: [] };
            throw err;
        }),

        // Conversions by device — device_type is captured directly on the
        // custom event row, no session join needed.
        db.query(`
            SELECT device_type, COUNT(*) AS count
            FROM analytics_custom_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
              AND device_type IS NOT NULL
            GROUP BY device_type ORDER BY count DESC`,
            [siteId, fromDate, toDateExclusive]
        ).catch((err) => {
            if (err?.message?.includes("does not exist")) return { rows: [] };
            throw err;
        }),

        // Conversions by campaign — same session first-touch approach as
        // channel, keyed by the raw utm_campaign string instead of a bucket,
        // and broken out per conversion event name so it's visible *which*
        // conversions a campaign actually drove (a campaign row of "1421
        // conversions" alone doesn't say whether that's 1421 purchases or
        // 1421 basket views). TRIM() folds "Booking2026" and "Booking2026  "
        // (a stray trailing space in how the link was tagged) into one
        // campaign instead of splitting real volume across near-duplicates.
        // Ranked/limited to the top 30 campaigns by total volume first, then
        // broken out by event name only within those — a campaign with many
        // event types shouldn't crowd smaller campaigns out of the top 30.
        db.query(`
            WITH first_touch AS (
                SELECT DISTINCT ON (session_id) session_id, utm_campaign, utm_source, utm_medium
                FROM analytics_events
                WHERE site_id = $1 AND session_id IS NOT NULL
                  AND received_at >= $2 AND received_at < $3
                  AND utm_campaign IS NOT NULL AND TRIM(utm_campaign) != ''
                ORDER BY session_id, received_at ASC
            ),
            campaign_events AS (
                SELECT TRIM(ft.utm_campaign) AS campaign, ft.utm_source AS source, ft.utm_medium AS medium,
                       ce.name AS event_name, ce.session_id
                FROM analytics_custom_events ce
                JOIN first_touch ft ON ft.session_id = ce.session_id
                WHERE ce.site_id = $1 AND ce.received_at >= $2 AND ce.received_at < $3
            ),
            top_campaigns AS (
                SELECT campaign, COUNT(*) AS total_count, COUNT(DISTINCT session_id) AS campaign_sessions
                FROM campaign_events
                GROUP BY campaign
                ORDER BY total_count DESC
                LIMIT 30
            )
            SELECT
                cev.campaign,
                (ARRAY_AGG(cev.source) FILTER (WHERE COALESCE(cev.source, '') != ''))[1]  AS source,
                (ARRAY_AGG(cev.medium) FILTER (WHERE COALESCE(cev.medium, '') != ''))[1]  AS medium,
                cev.event_name,
                COUNT(*)              AS count,
                tc.campaign_sessions  AS campaign_sessions
            FROM campaign_events cev
            JOIN top_campaigns tc ON tc.campaign = cev.campaign
            GROUP BY cev.campaign, cev.event_name, tc.campaign_sessions
            ORDER BY cev.campaign, count DESC`,
            [siteId, fromDate, toDateExclusive]
        ).catch((err) => {
            if (err?.message?.includes("does not exist")) return { rows: [] };
            throw err;
        }),

    ]).catch((err) => {
        // Table may not exist yet
        if (err?.message?.includes("does not exist")) return Array(26).fill({ rows: [] });
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
        industryBenchmark,
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
            convertedSessions: Number(convertedSessionsRes.rows[0]?.converted || 0),
            conversionRate: Number(t.unique_sessions || 0) > 0
                ? Math.round((Number(convertedSessionsRes.rows[0]?.converted || 0) / Number(t.unique_sessions)) * 1000) / 10
                : 0,
        },
        daily: dailyRes.rows.map(r => ({
            date:     r.date,
            minimal:  Number(r.minimal     || 0),
            full:     Number(r.full_count  || 0),
        })),
        dailyConversions: dailyConversionsRes.rows.map(r => ({
            date:        r.date,
            count:       Number(r.count        || 0),
            linkedCount: Number(r.linked_count  || 0),
        })),
        timeToConvert: (() => {
            const r = timeToConvertRes.rows[0] || {};
            const sampleSize = Number(r.sample_size || 0);
            return {
                sampleSize,
                medianSeconds: r.median_secs != null ? Number(r.median_secs) : null,
                buckets: [
                    { key: "under_1m", label: "Under 1 min", count: Number(r.b_under_1m || 0) },
                    { key: "1_5m",     label: "1–5 min",     count: Number(r.b_1_5m     || 0) },
                    { key: "5_30m",    label: "5–30 min",    count: Number(r.b_5_30m    || 0) },
                    { key: "30_60m",   label: "30–60 min",   count: Number(r.b_30_60m   || 0) },
                    { key: "1_24h",    label: "1–24 hours",  count: Number(r.b_1_24h    || 0) },
                    { key: "over_24h", label: "Over 24 hours", count: Number(r.b_over_24h || 0) },
                ],
            };
        })(),
        funnel: funnelRes.rows.map(r => ({
            kind:     r.kind,
            count:    Number(r.count    || 0),
            sessions: Number(r.sessions || 0),
        })),
        conversionsByChannel: conversionsByChannelRes.rows.map(r => ({
            channel:  r.channel,
            count:    Number(r.count    || 0),
            sessions: Number(r.sessions || 0),
        })),
        conversionsByDevice: conversionsByDeviceRes.rows.map(r => ({
            type:  r.device_type,
            count: Number(r.count || 0),
        })),
        conversionsByCampaign: (() => {
            const defsByName = new Map(eventDefsRes.rows.map(d => [d.name, d]));
            const byCampaign = new Map();
            conversionsByCampaignRes.rows.forEach(r => {
                const def = defsByName.get(r.event_name);
                let entry = byCampaign.get(r.campaign);
                if (!entry) {
                    entry = { campaign: r.campaign, source: r.source || null, medium: r.medium || null,
                               count: 0, sessions: Number(r.campaign_sessions || 0), events: [] };
                    byCampaign.set(r.campaign, entry);
                }
                entry.count += Number(r.count || 0);
                entry.events.push({
                    name:  r.event_name,
                    label: def?.label || r.event_name,
                    count: Number(r.count || 0),
                });
            });
            return Array.from(byCampaign.values()).sort((a, b) => b.count - a.count);
        })(),
        topPages: pagesRes.rows.map(r => ({
            pathname: r.pathname,
            views:    Number(r.views    || 0),
            sessions: Number(r.sessions || 0),
        })),
        countries: countriesRes.rows.map(r => ({
            code:   r.country_code,
            events: Number(r.events || 0),
        })),
        conversionCountries: conversionCountriesRes.rows.map(r => ({
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
        referrers: referrersRes.rows.map(r => ({
            referrer: r.referrer,
            events:   Number(r.events   || 0),
            sessions: Number(r.sessions || 0),
        })),
        hosts: hostsRes.rows.map(r => ({
            host:     r.host,
            events:   Number(r.events   || 0),
            sessions: Number(r.sessions || 0),
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
