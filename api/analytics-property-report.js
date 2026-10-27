/**
 * GET /api/analytics-property-report?domains=d1,d2,d3&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Aggregated first-party analytics rolled up across multiple domains (a "Property").
 * Returns the same shape as /api/analytics-report so analytics pages can consume it
 * without branching.
 *
 * Requires: Authorization: Bearer <token>   Organisation: <org_id>
 */

import { getPool } from "./_db.js";
import { selfReferralClause, noiseReferralClause, getApprovedDomainsForSites } from "./_self-referral.js";

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
        console.error("[analytics-property-report] unhandled error:", err?.message, err?.stack);
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

    const rawDomains = (req.query.domains || "").trim();
    if (!rawDomains) return res.status(400).json({ error: "domains is required" });

    const requestedDomains = rawDomains
        .split(",")
        .map(d => d.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 50); // sanity cap

    if (!requestedDomains.length) return res.status(400).json({ error: "No valid domains supplied" });

    const today = new Date().toISOString().slice(0, 10);
    const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const fromDate = safeDate(req.query.from, thirtyAgo);
    const toDate   = safeDate(req.query.to,   today);
    const toDateExclusive = new Date(new Date(toDate).getTime() + 86400000).toISOString().slice(0, 10);

    const db = getPool();

    // Resolve site IDs — only domains that belong to this org and are active
    const { rows: siteRows } = await db.query(
        `SELECT id, domain FROM analytics_sites
         WHERE organisation_id = $1
           AND LOWER(domain) = ANY($2)
           AND active = true`,
        [orgId, requestedDomains]
    ).catch(() => ({ rows: [] }));

    if (!siteRows.length) {
        return res.status(200).json({ noSiteKey: true });
    }

    const siteIds = siteRows.map(r => r.id);
    // $1 = siteIds array, $2 = fromDate, $3 = toDateExclusive

    // See docs/analytics-audit-plan.md item 2 — none of this portfolio's own
    // domains (or their approved cross-site domains) should show up as a
    // "referral". Combined across every site in the rollup rather than
    // resolved per-row; see getApprovedDomainsForSites's own comment for why
    // that's an acceptable simplification here.
    const approvedDomains = await getApprovedDomainsForSites(db, siteIds);
    const SELF_REFERRAL = selfReferralClause(requestedDomains, approvedDomains);
    const NOISE_REFERRAL = noiseReferralClause();

    const [
        totalsRes, dailyRes, pagesRes, countriesRes, devicesRes,
        browsersRes, consentRes, utmRes, referrersRes,
        conversionsRes, conversionCountriesRes, convertedSessionsRes,
        osRes, engagedRes, newVsReturningRes, lastTouchByChannelRes,
        revenueRes,
    ] = await Promise.all([

        db.query(`
            SELECT
                COUNT(*)                                                           AS total,
                COUNT(*) FILTER (WHERE consent_level = 'minimal')                 AS minimal,
                COUNT(*) FILTER (WHERE consent_level = 'full')                    AS full_count,
                COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)  AS unique_sessions,
                COUNT(*) FILTER (WHERE consent_stat = true)                       AS stat_yes,
                COUNT(*) FILTER (WHERE consent_stat = false OR consent_stat IS NULL) AS stat_no
            FROM analytics_events
            WHERE site_id = ANY($1) AND received_at >= $2 AND received_at < $3`,
            [siteIds, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT
                TO_CHAR(DATE_TRUNC('day', received_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
                COUNT(*) FILTER (WHERE consent_level = 'minimal')  AS minimal,
                COUNT(*) FILTER (WHERE consent_level = 'full')     AS full_count
            FROM analytics_events
            WHERE site_id = ANY($1) AND received_at >= $2 AND received_at < $3
            GROUP BY 1 ORDER BY 1`,
            [siteIds, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT
                pathname,
                COUNT(*)                                                           AS views,
                COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)  AS sessions
            FROM analytics_events
            WHERE site_id = ANY($1) AND received_at >= $2 AND received_at < $3
              AND pathname !~* '^/api/'
              AND pathname !~* '\\.(js|css|json|xml|txt|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|pdf)$'
            GROUP BY pathname ORDER BY views DESC LIMIT 25`,
            [siteIds, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT country_code, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = ANY($1) AND received_at >= $2 AND received_at < $3
              AND country_code IS NOT NULL
            GROUP BY country_code ORDER BY events DESC LIMIT 15`,
            [siteIds, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT device_type, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = ANY($1) AND received_at >= $2 AND received_at < $3
              AND device_type IS NOT NULL
            GROUP BY device_type ORDER BY events DESC`,
            [siteIds, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT browser_family, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = ANY($1) AND consent_level = 'full'
              AND received_at >= $2 AND received_at < $3
              AND browser_family IS NOT NULL AND browser_family != 'other'
            GROUP BY browser_family ORDER BY events DESC LIMIT 8`,
            [siteIds, fromDate, toDateExclusive]
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
            WHERE site_id = ANY($1) AND received_at >= $2 AND received_at < $3`,
            [siteIds, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT utm_source, utm_medium, utm_campaign, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = ANY($1) AND consent_level = 'full'
              AND received_at >= $2 AND received_at < $3
              AND utm_source IS NOT NULL AND utm_source != ''
            GROUP BY utm_source, utm_medium, utm_campaign ORDER BY events DESC LIMIT 20`,
            [siteIds, fromDate, toDateExclusive]
        ),

        db.query(`
            SELECT CASE WHEN COALESCE(referrer_host, '') = '' OR ${SELF_REFERRAL} OR ${NOISE_REFERRAL}
                        THEN '(direct)' ELSE referrer_host END AS referrer,
                   COUNT(*)                                                         AS events,
                   COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) AS sessions
            FROM analytics_events
            WHERE site_id = ANY($1) AND received_at >= $2 AND received_at < $3
            GROUP BY referrer ORDER BY events DESC LIMIT 20`,
            [siteIds, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(`
            SELECT
                name,
                COUNT(*)                                        AS count,
                COUNT(*) FILTER (WHERE consent_level = 'full') AS linked_count,
                COALESCE(SUM(value_cents), 0)                   AS value_cents,
                (ARRAY_AGG(currency) FILTER (WHERE currency IS NOT NULL))[1] AS currency
            FROM analytics_custom_events
            WHERE site_id = ANY($1) AND received_at >= $2 AND received_at < $3
            GROUP BY name ORDER BY count DESC LIMIT 30`,
            [siteIds, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(`
            SELECT country_code, COUNT(*) AS events
            FROM analytics_custom_events
            WHERE site_id = ANY($1) AND received_at >= $2 AND received_at < $3
              AND country_code IS NOT NULL
            GROUP BY country_code ORDER BY events DESC LIMIT 15`,
            [siteIds, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(`
            SELECT COUNT(DISTINCT session_id) AS converted
            FROM analytics_custom_events
            WHERE site_id = ANY($1) AND session_id IS NOT NULL
              AND received_at >= $2 AND received_at < $3`,
            [siteIds, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(`
            SELECT os_family, COUNT(*) AS events
            FROM analytics_events
            WHERE site_id = ANY($1) AND consent_level = 'full'
              AND received_at >= $2 AND received_at < $3
              AND os_family IS NOT NULL AND os_family != 'other'
            GROUP BY os_family ORDER BY events DESC LIMIT 8`,
            [siteIds, fromDate, toDateExclusive]
        ),

        db.query(`
            WITH session_stats AS (
                SELECT session_id, MAX(duration_sec) AS max_duration, COUNT(*) AS pageviews
                FROM analytics_events
                WHERE site_id = ANY($1) AND consent_level = 'full'
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
                    WHERE c.site_id = ANY($1) AND c.session_id = s.session_id
                      AND c.received_at >= $2 AND c.received_at < $3
               )`,
            [siteIds, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(`
            SELECT
                COUNT(*) FILTER (WHERE is_new) AS new_sessions,
                COUNT(*) FILTER (WHERE NOT is_new) AS returning_sessions
            FROM (
                SELECT BOOL_OR(is_new_visitor) AS is_new
                FROM analytics_events
                WHERE site_id = ANY($1) AND consent_level = 'full'
                  AND received_at >= $2 AND received_at < $3
                  AND session_id IS NOT NULL
                  AND is_new_visitor IS NOT NULL
                GROUP BY session_id
            ) s`,
            [siteIds, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

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
                    AND ae.site_id = ANY($1)
                    AND ae.received_at >= $2 AND ae.received_at < $3
                WHERE ce.site_id = ANY($1) AND ce.received_at >= $2 AND ce.received_at < $3
                ORDER BY ce.session_id, ae.received_at DESC
            )
            SELECT
                CASE
                    WHEN utm_source ~* '^(fb|facebook|ig|instagram|msg|messenger|an)$'                THEN 'paid_social'
                    WHEN utm_medium ~* '^(cpc|ppc|paid|cpm|display)'                                  THEN 'paid'
                    WHEN utm_medium = 'organic'
                         OR (COALESCE(utm_medium,'')='' AND COALESCE(utm_source,'')=''
                             AND referrer_host ~* '(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia)\\.') THEN 'organic'
                    WHEN COALESCE(referrer_host,'') != '' AND NOT ${SELF_REFERRAL} AND NOT ${NOISE_REFERRAL} THEN 'referral'
                    WHEN COALESCE(utm_source,'') != ''                                                 THEN 'paid'
                    ELSE 'direct'
                END AS channel,
                COUNT(DISTINCT session_id) AS sessions
            FROM last_touch
            GROUP BY 1`,
            [siteIds, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        db.query(`
            SELECT
                COALESCE(SUM(ace.value_cents), 0)                                AS total_cents,
                COUNT(*)                                                          AS transactions,
                (ARRAY_AGG(ace.currency) FILTER (WHERE ace.currency IS NOT NULL))[1] AS currency
            FROM analytics_custom_events ace
            WHERE ace.site_id = ANY($1) AND ace.received_at >= $2 AND ace.received_at < $3
              AND ace.value_cents IS NOT NULL
              AND (
                ace.name = 'purchase'
                OR ace.name IN (
                    SELECT name FROM analytics_event_defs
                    WHERE site_id = ANY($1) AND kind = 'purchase'
                )
              )`,
            [siteIds, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

    ]).catch((err) => {
        console.error("[analytics-property-report] batch error:", err?.message);
        return Array(17).fill({ rows: [] });
    });

    const t = totalsRes.rows[0] || {};
    const total = Number(t.total || 0);

    return res.status(200).json({
        isPropertyRollup: true,
        domains: siteRows.map(r => r.domain),
        from: fromDate,
        to: toDate,
        noData: total === 0,
        industryBenchmark: null,
        totals: {
            total,
            minimal:        Number(t.minimal     || 0),
            full:           Number(t.full_count  || 0),
            uniqueSessions: Number(t.unique_sessions || 0),
            engagedUsers:   Number(engagedRes.rows[0]?.engaged || 0),
            qualityLeads:   null,
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
            date:    r.date,
            minimal: Number(r.minimal    || 0),
            full:    Number(r.full_count || 0),
        })),
        topPages: pagesRes.rows.map(r => ({
            pathname: r.pathname,
            views:    Number(r.views    || 0),
            sessions: Number(r.sessions || 0),
            bounceRate:     null,
            exitRate:       null,
            avgDurationSec: null,
        })),
        newVsReturning: (() => {
            const r = newVsReturningRes.rows[0] || {};
            const n   = Number(r.new_sessions      || 0);
            const ret = Number(r.returning_sessions || 0);
            return { newSessions: n, returningSessions: ret, tracked: n + ret };
        })(),
        consentImpact: (() => {
            const full      = Number(t.full_count || 0);
            const totalObs  = Number(t.total || 0);
            const consentRate = totalObs > 0 ? full / totalObs : 0;
            const uniqueSess  = Number(t.unique_sessions || 0);
            return {
                consentRate,
                observedSessions: uniqueSess,
                estimatedTrue: consentRate > 0 ? Math.round(uniqueSess / consentRate) : null,
                dailyEstimates: dailyRes.rows.map(r => {
                    const d_full  = Number(r.full_count || 0);
                    const d_total = Number(r.minimal    || 0) + d_full;
                    const d_rate  = d_total > 0 ? d_full / d_total : consentRate;
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
        segment: { device: null, country: null, channel: null, consent: null },
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
        screens:   [],
        languages: [],
        timezones: [],
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
            campaign:    r.utm_campaign || null,
            campaignRaw: r.utm_campaign || null,
            events:      Number(r.events || 0),
        })),
        referrers: referrersRes.rows.map(r => ({
            referrer: r.referrer,
            events:   Number(r.events   || 0),
            sessions: Number(r.sessions || 0),
        })),
        hosts: [],
        conversions: conversionsRes.rows.map(r => ({
            name:        r.name,
            label:       r.name,
            kind:        "custom",
            count:       Number(r.count || 0),
            linkedCount: Number(r.linked_count || 0),
            value:       Number(r.value_cents || 0) / 100,
            currency:    r.currency || null,
        })),
    });
}
