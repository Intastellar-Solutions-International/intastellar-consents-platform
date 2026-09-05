/**
 * GET /api/analytics-report?domain=<domain>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>
 *
 * Returns aggregated first-party analytics for a domain over a date range.
 * Requires: Authorization: Bearer <token>   Organisation: <org_id>
 */

import { INDUSTRY_BENCHMARKS } from "./_industry-benchmarks.js";
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

// utm_campaign is whatever literal text was in the visitor's landing URL —
// we only capture it, never generate or template it ourselves. Two common
// garbage-in cases from misconfigured ad platforms: (1) an unsubstituted
// tracking-template macro like Google/Bing ValueTrack's "{campaignname}"
// (the advertiser's own ad platform failed to fill it in before appending it
// to the destination URL — nothing on our side to "fix", it's already
// broken by the time it reaches us), and (2) a bare numeric platform
// campaign ID used in place of a name. Neither is meaningful to a human
// reading this table, so label both instead of showing the raw value.
function humanizeCampaign(raw) {
    const v = (raw || "").trim();
    if (!v) return null;
    if (/[{}]/.test(v) || /%7[bB]/.test(v)) return "Unresolved campaign tag";
    if (/^\d+$/.test(v)) return `Unnamed campaign (ID: ${v})`;
    return v;
}

export default async function handler(req, res) {
    try {
        return await _handler(req, res);
    } catch (err) {
        console.error("[analytics-report] unhandled error:", err?.message, err?.stack);
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

    // Optional segment filters — validated against fixed enums so string interpolation
    // into SQL is safe (no user-controlled text reaches the query string).
    const VALID_DEVICES  = new Set(["desktop", "tablet", "mobile", "other"]);
    const VALID_CHANNELS = new Set(["organic", "paid", "paid_social", "direct", "referral"]);
    const VALID_CONSENTS = new Set(["full", "minimal"]);
    const rawCountry = (req.query.seg_country || "").trim().toUpperCase();

    const segDevice  = VALID_DEVICES.has(req.query.seg_device)  ? req.query.seg_device  : null;
    const segCountry = /^[A-Z]{2}$/.test(rawCountry)           ? rawCountry             : null;
    const segChannel = VALID_CHANNELS.has(req.query.seg_channel) ? req.query.seg_channel : null;
    const segConsent = VALID_CONSENTS.has(req.query.seg_consent) ? req.query.seg_consent : null;

    // Channel segment maps to UTM+referrer conditions (no user text in SQL).
    const META_SOURCE_PATTERN = `'^(fb|facebook|ig|instagram|msg|messenger|an)$'`;
    const CHANNEL_SQL = {
        organic:     `(utm_medium = 'organic' OR (COALESCE(utm_medium,'')='' AND COALESCE(utm_source,'')='' AND referrer_host ~* '(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia)\\.'))`,
        paid:        `(utm_medium ~* '^(cpc|ppc|paid|cpm|display)' OR (COALESCE(utm_source,'')!='' AND COALESCE(utm_medium,'') NOT IN ('organic','') AND utm_source !~* ${META_SOURCE_PATTERN}))`,
        paid_social: `(utm_source ~* ${META_SOURCE_PATTERN})`,
        referral:    `(COALESCE(referrer_host,'')!='' AND COALESCE(utm_source,'')='' AND COALESCE(utm_medium,'')='')`,
        direct:      `(COALESCE(referrer_host,'')='' AND COALESCE(utm_source,'')='' AND COALESCE(utm_medium,'')='')`,
    };

    // Extra WHERE clauses injected into analytics_events queries.
    const segClauses = [
        segDevice  ? `device_type = '${segDevice}'`   : null,
        segCountry ? `country_code = '${segCountry}'` : null,
        segConsent ? `consent_level = '${segConsent}'` : null,
        segChannel ? CHANNEL_SQL[segChannel]           : null,
    ].filter(Boolean);
    const segAnd = segClauses.length ? "AND " + segClauses.join(" AND ") : "";

    // Run all aggregations in parallel
    const [totalsRes, dailyRes, pagesRes, countriesRes, devicesRes,
           browsersRes, consentRes, utmRes, referrersRes, hostsRes, conversionsRes, eventDefsRes,
           conversionCountriesRes, convertedSessionsRes,
           osRes, screensRes, languagesRes, timezonesRes, engagedRes, leadRes,
           pageEngagementRes, newVsReturningRes, lastTouchByChannelRes,
           revenueRes] = await Promise.all([

        db.query(`
            SELECT
                COUNT(*)                                                        AS total,
                COUNT(*) FILTER (WHERE consent_level = 'minimal')              AS minimal,
                COUNT(*) FILTER (WHERE consent_level = 'full')                 AS full_count,
                COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) AS unique_sessions,
                COUNT(*) FILTER (WHERE consent_stat = true)                    AS stat_yes,
                COUNT(*) FILTER (WHERE consent_stat = false OR consent_stat IS NULL) AS stat_no
            FROM analytics_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3 ${segAnd}`,
            [siteId, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT
                TO_CHAR(DATE_TRUNC('day', received_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
                COUNT(*) FILTER (WHERE consent_level = 'minimal')  AS minimal,
                COUNT(*) FILTER (WHERE consent_level = 'full')     AS full_count
            FROM analytics_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3 ${segAnd}
            GROUP BY 1 ORDER BY 1`,
            [siteId, fromDate, toDateExclusive]
        ),

        // Excludes /api/* and static-asset paths — a tracking beacon can end up
        // logging a non-content pathname (e.g. a visitor landing on
        // /api/ab-test-proxy while a url_split Page Experiment variant proxies
        // their real page through that route) which otherwise pollutes "top
        // pages" with routes nobody actually reads as a page.
        db.query(`
            SELECT
                pathname,
                COUNT(*)                                                          AS views,
                COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) AS sessions
            FROM analytics_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3 ${segAnd}
              AND pathname !~* '^/api/'
              AND pathname !~* '\\.(js|css|json|xml|txt|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|pdf)$'
            GROUP BY pathname ORDER BY views DESC LIMIT 20`,
            [siteId, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT country_code, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3 ${segAnd}
              AND country_code IS NOT NULL
            GROUP BY country_code ORDER BY events DESC LIMIT 15`,
            [siteId, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT device_type, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3 ${segAnd}
              AND device_type IS NOT NULL
            GROUP BY device_type ORDER BY events DESC`,
            [siteId, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT browser_family, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = $1 AND consent_level = 'full'
              AND received_at >= $2 AND received_at < $3 ${segAnd}
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
            WHERE site_id = $1
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

        // Per-page engagement — bounce rate, exit rate, avg time on page.
        // Session-linked (full-consent) events only, same as Campaigns/
        // Referrers/Hosts above — minimal pageviews carry no session_id, so
        // there's no way to tell whether one was the only page a visitor saw
        // (bounce) or the last one before they left (exit) without a session
        // to reconstruct that sequence from.
        db.query(`
            WITH session_pageviews AS (
                SELECT session_id, pathname, duration_sec,
                       COUNT(*) OVER (PARTITION BY session_id)                                    AS session_pageview_count,
                       ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY received_at DESC)      AS rn_from_end
                FROM analytics_events
                WHERE site_id = $1 AND session_id IS NOT NULL
                  AND received_at >= $2 AND received_at < $3
                  AND pathname !~* '^/api/'
                  AND pathname !~* '\\.(js|css|json|xml|txt|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|pdf)$'
            )
            SELECT
                pathname,
                COUNT(DISTINCT session_id)                                                AS sessions,
                COUNT(DISTINCT session_id) FILTER (WHERE session_pageview_count = 1)      AS bounce_sessions,
                COUNT(DISTINCT session_id) FILTER (WHERE rn_from_end = 1)                 AS exit_sessions,
                AVG(duration_sec) FILTER (WHERE duration_sec IS NOT NULL AND duration_sec > 0) AS avg_duration_sec
            FROM session_pageviews
            GROUP BY pathname`,
            [siteId, fromDate, toDateExclusive]
        ).catch((err) => {
            if (err?.message?.includes("does not exist")) return { rows: [] };
            throw err;
        }),

        // New vs returning — one row per session showing whether its FIRST event
        // had is_new_visitor = true (just set _ia_v) or false (cookie existed).
        // Sessions from before this column was added will have NULL and are
        // excluded from both counts rather than misclassified.
        db.query(`
            SELECT
                COUNT(*) FILTER (WHERE is_new) AS new_sessions,
                COUNT(*) FILTER (WHERE NOT is_new) AS returning_sessions
            FROM (
                SELECT BOOL_OR(is_new_visitor) AS is_new
                FROM analytics_events
                WHERE site_id = $1 AND consent_level = 'full'
                  AND received_at >= $2 AND received_at < $3
                  AND session_id IS NOT NULL
                  AND is_new_visitor IS NOT NULL
                GROUP BY session_id
            ) s`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        // Last-touch attribution — for each converting session, the LAST analytics
        // event before the conversion fires tells us the channel the visitor came
        // from most recently. Paired with first-touch (conversionsByChannel above),
        // this surfaces assist vs closing channel differences: a channel that
        // appears heavily in first-touch but barely in last-touch is an awareness
        // channel; one that dominates last-touch is a closing channel.
        db.query(`
            WITH last_touch AS (
                SELECT DISTINCT ON (ce.session_id)
                    ce.session_id,
                    ae.utm_medium,
                    ae.utm_source,
                    ae.referrer_host
                FROM analytics_custom_events ce
                JOIN analytics_events ae
                    ON ae.session_id = ce.session_id
                    AND ae.site_id = $1
                    AND ae.received_at >= $2 AND ae.received_at < $3
                WHERE ce.site_id = $1 AND ce.received_at >= $2 AND ce.received_at < $3
                ORDER BY ce.session_id, ae.received_at DESC
            )
            SELECT
                CASE
                    WHEN utm_source ~* '^(fb|facebook|ig|instagram|msg|messenger|an)$'                THEN 'paid_social'
                    WHEN utm_medium ~* '^(cpc|ppc|paid|cpm|display)'                                  THEN 'paid'
                    WHEN utm_medium = 'organic'
                         OR (COALESCE(utm_medium,'')='' AND COALESCE(utm_source,'')=''
                             AND referrer_host ~* '(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia)\\.') THEN 'organic'
                    WHEN COALESCE(referrer_host,'') != ''                                              THEN 'referral'
                    WHEN COALESCE(utm_source,'') != ''                                                 THEN 'paid'
                    ELSE 'direct'
                END AS channel,
                COUNT(DISTINCT session_id) AS sessions
            FROM last_touch
            GROUP BY 1`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        // Revenue totals — sum of value_cents for events registered as
        // kind='purchase' in analytics_event_defs, or literally named 'purchase'.
        db.query(`
            SELECT
                COALESCE(SUM(ace.value_cents), 0)                                AS total_cents,
                COUNT(*)                                                          AS transactions,
                (ARRAY_AGG(ace.currency) FILTER (WHERE ace.currency IS NOT NULL))[1] AS currency
            FROM analytics_custom_events ace
            WHERE ace.site_id = $1 AND ace.received_at >= $2 AND ace.received_at < $3
              AND ace.value_cents IS NOT NULL
              AND (
                ace.name = 'purchase'
                OR ace.name IN (
                    SELECT name FROM analytics_event_defs
                    WHERE site_id = $1 AND kind = 'purchase'
                )
              )`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

    ]).catch((err) => {
        // Schema not yet migrated, connection limit hit, or other transient DB
        // error — return empty rows for every query so the response stays a
        // valid (if empty) 200 instead of crashing with a 500.
        console.error("[analytics-report] batch error:", err?.message);
        return Array(24).fill({ rows: [] });
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
            revenue:         Number(revenueRes.rows[0]?.total_cents || 0) / 100 || null,
            revenueCurrency: revenueRes.rows[0]?.currency || null,
            transactions:    Number(revenueRes.rows[0]?.transactions || 0) || null,
        },
        daily: dailyRes.rows.map(r => ({
            date:     r.date,
            minimal:  Number(r.minimal     || 0),
            full:     Number(r.full_count  || 0),
        })),
        topPages: (() => {
            const engagementByPath = new Map(pageEngagementRes.rows.map(r => [r.pathname, r]));
            return pagesRes.rows.map(r => {
                const e = engagementByPath.get(r.pathname);
                const sessions = e ? Number(e.sessions || 0) : 0;
                return {
                    pathname: r.pathname,
                    views:    Number(r.views    || 0),
                    sessions: Number(r.sessions || 0),
                    // null (not 0) when there's no session-linked data for this
                    // page yet — a page with only minimal-consent traffic has
                    // no bounce/exit/duration signal to report, which reads
                    // very differently from "0% bounce rate".
                    bounceRate:    sessions > 0 ? (Number(e.bounce_sessions || 0) / sessions) * 100 : null,
                    exitRate:      sessions > 0 ? (Number(e.exit_sessions   || 0) / sessions) * 100 : null,
                    avgDurationSec: e?.avg_duration_sec != null ? Number(e.avg_duration_sec) : null,
                };
            });
        })(),
        newVsReturning: (() => {
            const r = newVsReturningRes.rows[0] || {};
            const n   = Number(r.new_sessions       || 0);
            const ret = Number(r.returning_sessions  || 0);
            return { newSessions: n, returningSessions: ret, tracked: n + ret };
        })(),
        // Consent impact — estimates the "true" unfiltered visitor count from the
        // full-consent fraction. Not derived from the consent platform's own DB
        // (which lives on a separate server); computed entirely from the consent_level
        // field captured in analytics_events at event time.
        consentImpact: (() => {
            const t = totalsRes.rows[0] || {};
            const full = Number(t.full_count || 0);
            const totalObs = Number(t.total || 0);
            const consentRate = totalObs > 0 ? full / totalObs : 0;
            const uniqueSess  = Number(t.unique_sessions || 0);
            return {
                consentRate,
                observedSessions: uniqueSess,
                estimatedTrue: consentRate > 0 ? Math.round(uniqueSess / consentRate) : null,
                dailyEstimates: dailyRes.rows.map(r => {
                    const d_full = Number(r.full_count || 0);
                    const d_total = Number(r.minimal || 0) + d_full;
                    const d_rate = d_total > 0 ? d_full / d_total : consentRate;
                    return {
                        date: r.date,
                        estimated: d_rate > 0 ? Math.round(d_full / d_rate) : d_total,
                    };
                }),
            };
        })(),
        lastTouchByChannel: lastTouchByChannelRes.rows.map(r => ({
            channel:  r.channel,
            sessions: Number(r.sessions || 0),
        })),
        segment: { device: segDevice, country: segCountry, channel: segChannel, consent: segConsent },
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
            source:      r.utm_source,
            medium:      r.utm_medium,
            campaign:    humanizeCampaign(r.utm_campaign),
            campaignRaw: r.utm_campaign || null,
            events:      Number(r.events || 0),
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
