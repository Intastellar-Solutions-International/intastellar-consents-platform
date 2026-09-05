/**
 * GET /api/analytics-report-detail?domain=<domain>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>
 *
 * Slow-path aggregations for the analytics dashboard — CTE-heavy queries that
 * take longer to run (conversion funnels, time-to-convert, interest scoring,
 * rage-click analysis, form funnels, product breakdowns). Fetched in parallel
 * with /api/analytics-report so fast panels render immediately while these
 * load independently.
 *
 * Requires: Authorization: Bearer <token>   Organisation: <org_id>
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
        console.error("[analytics-report-detail] unhandled error:", err?.message, err?.stack);
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

    const { rows: siteRows } = await db.query(
        `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1`,
        [orgId, domain]
    ).catch(() => ({ rows: [] }));

    if (!siteRows.length) {
        return res.status(200).json({ noSiteKey: true });
    }

    const siteId = siteRows[0].id;

    // Same segment filter logic as /api/analytics-report — both endpoints must
    // apply identical WHERE conditions so slow data and fast data are comparable.
    const VALID_DEVICES  = new Set(["desktop", "tablet", "mobile", "other"]);
    const VALID_CHANNELS = new Set(["organic", "paid", "paid_social", "direct", "referral"]);
    const VALID_CONSENTS = new Set(["full", "minimal"]);
    const rawCountry = (req.query.seg_country || "").trim().toUpperCase();

    const segDevice  = VALID_DEVICES.has(req.query.seg_device)  ? req.query.seg_device  : null;
    const segCountry = /^[A-Z]{2}$/.test(rawCountry)           ? rawCountry             : null;
    const segChannel = VALID_CHANNELS.has(req.query.seg_channel) ? req.query.seg_channel : null;
    const segConsent = VALID_CONSENTS.has(req.query.seg_consent) ? req.query.seg_consent : null;

    const META_SOURCE_PATTERN = `'^(fb|facebook|ig|instagram|msg|messenger|an)$'`;
    const CHANNEL_SQL = {
        organic:     `(utm_medium = 'organic' OR (COALESCE(utm_medium,'')='' AND COALESCE(utm_source,'')='' AND referrer_host ~* '(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia)\\.'))`,
        paid:        `(utm_medium ~* '^(cpc|ppc|paid|cpm|display)' OR (COALESCE(utm_source,'')!='' AND COALESCE(utm_medium,'') NOT IN ('organic','') AND utm_source !~* ${META_SOURCE_PATTERN}))`,
        paid_social: `(utm_source ~* ${META_SOURCE_PATTERN})`,
        referral:    `(COALESCE(referrer_host,'')!='' AND COALESCE(utm_source,'')='' AND COALESCE(utm_medium,'')='')`,
        direct:      `(COALESCE(referrer_host,'')='' AND COALESCE(utm_source,'')='' AND COALESCE(utm_medium,'')='')`,
    };

    const segClauses = [
        segDevice  ? `device_type = '${segDevice}'`   : null,
        segCountry ? `country_code = '${segCountry}'` : null,
        segConsent ? `consent_level = '${segConsent}'` : null,
        segChannel ? CHANNEL_SQL[segChannel]           : null,
    ].filter(Boolean);
    const segAnd = segClauses.length ? "AND " + segClauses.join(" AND ") : "";

    const [eventDefsRes,
           dailyConversionsRes, timeToConvertRes, funnelRes,
           conversionsByChannelRes, conversionsByDeviceRes, conversionsByCampaignRes,
           topProductsRes,
           outboundTotalsRes, topOutboundRes,
           rageClickStatsRes, topRageSelectorsRes, topRagePagesRes,
           formFunnelRes, interestsRes,
           topicInterestsRes] = await Promise.all([

        // Re-queried here for conversionsByCampaign label enrichment
        db.query(
            `SELECT name, kind, label FROM analytics_event_defs WHERE site_id = $1`,
            [siteId]
        ).catch(() => ({ rows: [] })),

        // Daily conversion volume — trend line for the conversions dashboard.
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

        // Time-to-convert — elapsed time between session's first event and each conversion.
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

        // Funnel — distinct-session counts per e-commerce funnel step.
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

        // Conversions by channel (first-touch attribution).
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
                    WHEN ft.utm_source ~* '^(fb|facebook|ig|instagram|msg|messenger|an)$'       THEN 'paid_social'
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

        // Conversions by device type.
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

        // Conversions by campaign (first-touch), ranked by volume, broken out by event name.
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

        // Top products sold.
        db.query(`
            SELECT
                p->>'id'                                                          AS product_id,
                p->>'name'                                                        AS product_name,
                p->>'cat'                                                         AS category,
                SUM((p->>'qty')::numeric)                                         AS units,
                SUM((p->>'price')::numeric * COALESCE((p->>'qty')::numeric, 1))  AS revenue
            FROM analytics_custom_events ace,
                 jsonb_array_elements(ace.products) AS p
            WHERE ace.site_id = $1 AND ace.received_at >= $2 AND ace.received_at < $3
              AND ace.products IS NOT NULL
              AND (
                ace.name = 'purchase'
                OR ace.name IN (
                    SELECT name FROM analytics_event_defs
                    WHERE site_id = $1 AND kind = 'purchase'
                )
              )
            GROUP BY 1, 2, 3
            ORDER BY revenue DESC NULLS LAST
            LIMIT 20`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        // Total outbound click count.
        db.query(`
            SELECT COUNT(*) AS total
            FROM analytics_custom_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
              AND name = 'outbound_click'`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        // Top outbound destinations.
        db.query(`
            SELECT
                extra_data->>'host' AS host,
                COUNT(*)            AS clicks
            FROM analytics_custom_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
              AND name = 'outbound_click'
              AND extra_data->>'host' IS NOT NULL
            GROUP BY 1
            ORDER BY clicks DESC
            LIMIT 20`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        // Rage click totals.
        db.query(`
            SELECT
                (SELECT COUNT(*) FROM analytics_custom_events
                 WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
                   AND name = 'rage_click')                               AS total_rage_clicks,
                (SELECT COUNT(DISTINCT session_id) FROM analytics_custom_events
                 WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
                   AND name = 'rage_click' AND session_id IS NOT NULL)    AS frustrated_sessions,
                (SELECT COUNT(DISTINCT session_id) FROM analytics_events
                 WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
                   AND session_id IS NOT NULL)                            AS total_sessions`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        // Top rage-clicked elements.
        db.query(`
            SELECT
                extra_data->>'selector'  AS selector,
                extra_data->>'id'        AS element_id,
                extra_data->>'cls'       AS element_class,
                extra_data->>'tag'       AS element_tag,
                COUNT(*)                 AS clicks
            FROM analytics_custom_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
              AND name = 'rage_click'
              AND extra_data->>'selector' IS NOT NULL
            GROUP BY 1, 2, 3, 4
            ORDER BY clicks DESC
            LIMIT 15`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        // Top pages by rage click count.
        db.query(`
            WITH rage AS (
                SELECT extra_data->>'page' AS page, COUNT(*) AS rage_clicks
                FROM analytics_custom_events
                WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
                  AND name = 'rage_click'
                  AND extra_data->>'page' IS NOT NULL
                GROUP BY 1
            ),
            views AS (
                SELECT pathname, COUNT(*) AS page_views
                FROM analytics_events
                WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
                GROUP BY 1
            )
            SELECT
                r.page,
                r.rage_clicks,
                v.page_views,
                CASE WHEN v.page_views > 0
                     THEN ROUND(r.rage_clicks::numeric / v.page_views * 100, 1)
                     ELSE NULL
                END AS rage_rate
            FROM rage r
            LEFT JOIN views v ON v.pathname = r.page
            ORDER BY rage_clicks DESC
            LIMIT 15`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        // Form funnel — started vs submitted per form.
        db.query(`
            SELECT
                COALESCE(extra_data->>'formId', '(unknown)') AS form_id,
                extra_data->>'provider'                       AS provider,
                COUNT(*) FILTER (WHERE name = 'form_started')::int AS started,
                COUNT(*) FILTER (WHERE name = 'form_submit')::int  AS submitted,
                CASE WHEN COUNT(*) FILTER (WHERE name = 'form_started') > 0
                     THEN LEAST(100, ROUND(COUNT(*) FILTER (WHERE name = 'form_submit')::numeric /
                                COUNT(*) FILTER (WHERE name = 'form_started') * 100, 1))
                     ELSE NULL
                END AS completion_rate
            FROM analytics_custom_events
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3
              AND name IN ('form_started', 'form_submit')
            GROUP BY 1, 2
            HAVING COUNT(*) FILTER (WHERE name = 'form_started') > 0
                OR COUNT(*) FILTER (WHERE name = 'form_submit') > 0
            ORDER BY started DESC
            LIMIT 20`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        // Users by Interests — per rule: session count + engagement score split.
        // Each full-consent session that visited a matching page is scored across
        // scroll depth (0-25), time on page (0-25), page depth (0-25), and
        // conversions (0-25). Score >= 50 = "on-topic"; score < 50 = "off-topic".
        db.query(`
            WITH full_events AS (
                SELECT session_id, pathname, scroll_depth, duration_sec
                FROM analytics_events
                WHERE site_id = $1
                  AND consent_level = 'full'
                  AND received_at >= $2
                  AND received_at < $3 ${segAnd}
                  AND session_id IS NOT NULL
            ),
            session_stats AS (
                SELECT
                    session_id,
                    MAX(scroll_depth)        AS max_scroll,
                    MAX(duration_sec)        AS max_duration,
                    COUNT(DISTINCT pathname) AS page_depth
                FROM full_events
                GROUP BY session_id
            ),
            session_conversions AS (
                SELECT ce.session_id, COUNT(*) AS conv_count
                FROM analytics_custom_events ce
                JOIN analytics_event_defs d
                  ON d.site_id = ce.site_id AND d.name = ce.name
                WHERE ce.site_id = $1
                  AND ce.received_at >= $2
                  AND ce.received_at < $3
                  AND ce.session_id IS NOT NULL
                GROUP BY ce.session_id
            ),
            session_scored AS (
                SELECT
                    ss.session_id,
                    (ROUND(LEAST(COALESCE(ss.max_scroll,   0), 100) * 0.25) +
                     ROUND(LEAST(COALESCE(ss.max_duration, 0), 300) / 300.0 * 25) +
                     LEAST(ss.page_depth * 5, 25) +
                     LEAST(COALESCE(sc.conv_count, 0) * 25, 25))::int AS score
                FROM session_stats ss
                LEFT JOIN session_conversions sc ON sc.session_id = ss.session_id
            ),
            rule_sessions AS (
                SELECT DISTINCT
                    r.id           AS rule_id,
                    r.interest_label AS label,
                    r.color,
                    r.sort_order,
                    fe.session_id,
                    ss.score
                FROM analytics_interest_rules r
                JOIN full_events fe
                  ON fe.pathname ILIKE REPLACE(r.pattern, '*', '%')
                JOIN session_scored ss
                  ON ss.session_id = fe.session_id
                WHERE r.site_id = $1
            )
            SELECT
                rule_id AS id,
                label,
                color,
                COUNT(DISTINCT session_id)                                     AS sessions,
                ROUND(AVG(score))                                              AS avg_score,
                COUNT(DISTINCT session_id) FILTER (WHERE score >= 50)          AS on_topic,
                COUNT(DISTINCT session_id) FILTER (WHERE score <  50)          AS off_topic
            FROM rule_sessions
            GROUP BY rule_id, label, color, sort_order
            ORDER BY sort_order ASC, sessions DESC`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

        // Browser topics from Chrome Topics API (consent_func only).
        db.query(`
            SELECT
                topic_id::int,
                COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) AS sessions,
                COUNT(*)                                                           AS events
            FROM analytics_events,
                 jsonb_array_elements_text(browser_topics) AS topic_id
            WHERE site_id = $1 AND received_at >= $2 AND received_at < $3 ${segAnd}
              AND browser_topics IS NOT NULL
              AND jsonb_array_length(browser_topics) > 0
              AND consent_func = true
            GROUP BY topic_id
            ORDER BY sessions DESC, events DESC
            LIMIT 20`,
            [siteId, fromDate, toDateExclusive]
        ).catch(() => ({ rows: [] })),

    ]).catch((err) => {
        console.error("[analytics-report-detail] batch error:", err?.message);
        return Array(16).fill({ rows: [] });
    });

    const defsByName = new Map(eventDefsRes.rows.map(d => [d.name, d]));

    return res.status(200).json({
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
            const byCampaign = new Map();
            conversionsByCampaignRes.rows.forEach(r => {
                const def = defsByName.get(r.event_name);
                let entry = byCampaign.get(r.campaign);
                if (!entry) {
                    entry = { campaign: humanizeCampaign(r.campaign), source: r.source || null,
                               medium: r.medium || null, count: 0,
                               sessions: Number(r.campaign_sessions || 0), events: [] };
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
        topProducts: topProductsRes.rows.map(r => ({
            id:       r.product_id   || null,
            name:     r.product_name || null,
            category: r.category     || null,
            units:    Number(r.units   || 0),
            revenue:  Number(r.revenue || 0),
        })),
        outboundClicks: Number(outboundTotalsRes.rows[0]?.total || 0),
        topOutbound: topOutboundRes.rows.map(r => ({
            host:   r.host,
            clicks: Number(r.clicks || 0),
        })),
        rageClicks: (() => {
            const r = rageClickStatsRes.rows[0] || {};
            const frustrated = Number(r.frustrated_sessions || 0);
            const total      = Number(r.total_sessions     || 0);
            return {
                total:              Number(r.total_rage_clicks || 0),
                frustratedSessions: frustrated,
                totalSessions:      total,
                frustrationRate:    total > 0 ? Math.round(frustrated / total * 1000) / 10 : 0,
            };
        })(),
        topRageSelectors: topRageSelectorsRes.rows.map(r => ({
            selector:     r.selector,
            elementId:    r.element_id   || null,
            elementClass: r.element_class || null,
            elementTag:   r.element_tag   || null,
            clicks:       Number(r.clicks || 0),
        })),
        topRagePages: topRagePagesRes.rows.map(r => ({
            page:       r.page,
            rageClicks: Number(r.rage_clicks || 0),
            views:      r.page_views != null ? Number(r.page_views) : null,
            rate:       r.rage_rate  != null ? Number(r.rage_rate)  : null,
        })),
        formFunnel: formFunnelRes.rows.map(r => ({
            formId:         r.form_id,
            provider:       r.provider || null,
            started:        Number(r.started   || 0),
            submitted:      Number(r.submitted || 0),
            completionRate: r.completion_rate != null ? Number(r.completion_rate) : null,
        })),
        interests: interestsRes.rows.map(r => ({
            id:       Number(r.id),
            label:    r.label,
            color:    r.color || null,
            sessions: Number(r.sessions  || 0),
            avgScore: Number(r.avg_score || 0),
            onTopic:  Number(r.on_topic  || 0),
            offTopic: Number(r.off_topic || 0),
        })),
        topicInterests: topicInterestsRes.rows.map(r => ({
            topicId:  Number(r.topic_id),
            sessions: Number(r.sessions || 0),
            events:   Number(r.events   || 0),
        })),
    });
}
