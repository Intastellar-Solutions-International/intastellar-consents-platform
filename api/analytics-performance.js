import { getPool } from "./_db.js";
/**
 * GET /api/analytics-performance?domain=<domain>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>
 *
 * Returns Core Web Vitals and page-load timing data collected by the embed
 * script's page_perf event (PerformanceObserver + PerformanceNavigationTiming).
 *
 * Metrics (all P75 unless noted):
 *   LCP  — Largest Contentful Paint (ms)   Good <2500  Poor ≥4000
 *   CLS  — Cumulative Layout Shift (score) Good <0.1   Poor ≥0.25
 *   INP  — Interaction to Next Paint (ms)  Good <200   Poor ≥500
 *   FCP  — First Contentful Paint (ms)     Good <1800  Poor ≥3000
 *   TTFB — Time to First Byte (ms)         Good <800   Poor ≥1800
 *   Load — Navigation load event end (ms)
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

// Percentile helper — generates a PERCENTILE_CONT expression for any metric + quantile
const Pn = (col, p) =>
    `PERCENTILE_CONT(${p}) WITHIN GROUP (ORDER BY (extra_data->>'${col}')::numeric) FILTER (WHERE extra_data->>'${col}' IS NOT NULL AND (extra_data->>'${col}')::numeric > 0)`;
const P75 = (col) => Pn(col, 0.75);

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const payload = validateJwt(req.headers.authorization);
    if (!payload) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation, 10);
    if (!orgId || isNaN(orgId)) return res.status(400).json({ error: "Missing Organisation header" });

    if (req.method !== "GET") return res.status(405).end();

    const { domain, from, to, country: rawCountry } = req.query;
    if (!domain) return res.status(400).json({ error: "domain required" });

    const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const toDate   = to   || new Date().toISOString().slice(0, 10);

    // Previous period — same length, immediately preceding
    const dayDiff    = Math.max(1, Math.round((new Date(toDate) - new Date(fromDate)) / 86400000) + 1);
    const prevToDate   = new Date(new Date(fromDate).getTime() - 86400000).toISOString().slice(0, 10);
    const prevFromDate = new Date(new Date(fromDate).getTime() - dayDiff * 86400000).toISOString().slice(0, 10);

    // Optional country filter — CHAR(2) ISO 3166-1 alpha-2, uppercase only
    const country = rawCountry && /^[A-Z]{2}$/.test(rawCountry.toUpperCase())
        ? rawCountry.toUpperCase()
        : null;

    const db = getPool();

    const siteRes = await db.query(
        `SELECT id, COALESCE(lead_qualifying_events, '{}') AS lead_qualifying_events
         FROM analytics_sites WHERE domain = $1 AND organisation_id = $2 LIMIT 1`,
        [domain, orgId]
    ).catch(() => ({ rows: [] }));

    if (!siteRes.rows.length) return res.status(404).json({ error: "Site not found" });
    const siteId = siteRes.rows[0].id;
    const qualifyingEvents = Array.isArray(siteRes.rows[0].lead_qualifying_events)
        ? siteRes.rows[0].lead_qualifying_events.filter(Boolean)
        : [];

    const params     = country ? [siteId, fromDate,     toDate,     country] : [siteId, fromDate,     toDate];
    const prevParams = country ? [siteId, prevFromDate, prevToDate, country] : [siteId, prevFromDate, prevToDate];

    const BASE_WHERE = `
        site_id = $1
        AND received_at >= $2::date
        AND received_at <  $3::date + interval '1 day'
        AND name = 'page_perf'
        ${country ? "AND country_code = $4" : ""}
    `;
    // Reusable WHERE for the previous period — identical shape, different params
    const PREV_WHERE = BASE_WHERE;

    const [totalsRes, byPageRes, byDeviceRes, dailyRes, byCountryRes, prevTotalsRes] = await Promise.all([

        // Site-wide percentile distribution (P25/P50/P75/P90/P95) for every metric
        db.query(`
            SELECT
                COUNT(*)                                                              AS sample_size,
                ${Pn("lcp",  0.25)} AS lcp_p25,  ${Pn("lcp",  0.50)} AS lcp_p50,
                ${P75("lcp")}       AS lcp_p75,  ${Pn("lcp",  0.90)} AS lcp_p90,
                ${Pn("lcp",  0.95)} AS lcp_p95,
                ${Pn("cls",  0.25)} AS cls_p25,  ${Pn("cls",  0.50)} AS cls_p50,
                ${P75("cls")}       AS cls_p75,  ${Pn("cls",  0.90)} AS cls_p90,
                ${Pn("cls",  0.95)} AS cls_p95,
                ${Pn("inp",  0.25)} AS inp_p25,  ${Pn("inp",  0.50)} AS inp_p50,
                ${P75("inp")}       AS inp_p75,  ${Pn("inp",  0.90)} AS inp_p90,
                ${Pn("inp",  0.95)} AS inp_p95,
                ${Pn("fcp",  0.25)} AS fcp_p25,  ${Pn("fcp",  0.50)} AS fcp_p50,
                ${P75("fcp")}       AS fcp_p75,  ${Pn("fcp",  0.90)} AS fcp_p90,
                ${Pn("fcp",  0.95)} AS fcp_p95,
                ${Pn("ttfb",0.25)}  AS ttfb_p25, ${Pn("ttfb",0.50)}  AS ttfb_p50,
                ${P75("ttfb")}      AS ttfb_p75, ${Pn("ttfb",0.90)}  AS ttfb_p90,
                ${Pn("ttfb",0.95)}  AS ttfb_p95,
                ${Pn("load",0.25)}  AS load_p25, ${Pn("load",0.50)}  AS load_p50,
                ${P75("load")}      AS load_p75, ${Pn("load",0.90)}  AS load_p90,
                ${Pn("load",0.95)}  AS load_p95,
                ${P75("tbt")}       AS tbt_p75,
                COUNT(*) FILTER (WHERE extra_data->>'rating' = 'good')               AS good_count,
                COUNT(*) FILTER (WHERE extra_data->>'rating' = 'needs-improvement')  AS ni_count,
                COUNT(*) FILTER (WHERE extra_data->>'rating' = 'poor')               AS poor_count
            FROM analytics_custom_events
            WHERE ${BASE_WHERE}
        `, params),

        // Per-page breakdown — P50/P75/P90 for LCP, P75 for other metrics
        db.query(`
            SELECT
                pathname,
                COUNT(*)           AS samples,
                ${Pn("lcp",0.50)}  AS lcp_p50,
                ${P75("lcp")}      AS lcp_p75,
                ${Pn("lcp",0.90)}  AS lcp_p90,
                ${P75("cls")}      AS cls_p75,
                ${P75("inp")}      AS inp_p75,
                ${P75("fcp")}      AS fcp_p75,
                ${P75("ttfb")}     AS ttfb_p75,
                ${P75("load")}     AS load_p75,
                MODE() WITHIN GROUP (ORDER BY extra_data->>'rating') AS modal_rating
            FROM analytics_custom_events
            WHERE ${BASE_WHERE}
              AND pathname IS NOT NULL
            GROUP BY pathname
            HAVING COUNT(*) >= 3
            ORDER BY samples DESC
            LIMIT 50
        `, params),

        // Per-device P75 breakdown
        db.query(`
            SELECT
                COALESCE(device_type, 'unknown') AS device,
                COUNT(*)        AS samples,
                ${P75("lcp")}   AS lcp_p75,
                ${P75("cls")}   AS cls_p75,
                ${P75("inp")}   AS inp_p75,
                ${P75("fcp")}   AS fcp_p75,
                ${P75("ttfb")}  AS ttfb_p75,
                ${P75("load")}  AS load_p75
            FROM analytics_custom_events
            WHERE ${BASE_WHERE}
            GROUP BY 1
            ORDER BY samples DESC
        `, params),

        // Daily trend — P50/P75/P90 per metric for band charts
        db.query(`
            SELECT
                DATE_TRUNC('day', received_at)::date AS day,
                COUNT(*)              AS samples,
                ${Pn("lcp",  0.50)}   AS lcp_p50,  ${P75("lcp")}   AS lcp_p75,  ${Pn("lcp",  0.90)} AS lcp_p90,
                ${Pn("cls",  0.50)}   AS cls_p50,  ${P75("cls")}   AS cls_p75,  ${Pn("cls",  0.90)} AS cls_p90,
                ${Pn("inp",  0.50)}   AS inp_p50,  ${P75("inp")}   AS inp_p75,  ${Pn("inp",  0.90)} AS inp_p90,
                ${Pn("fcp",  0.50)}   AS fcp_p50,  ${P75("fcp")}   AS fcp_p75,  ${Pn("fcp",  0.90)} AS fcp_p90,
                ${Pn("ttfb", 0.50)}   AS ttfb_p50, ${P75("ttfb")}  AS ttfb_p75, ${Pn("ttfb", 0.90)} AS ttfb_p90,
                ${P75("tbt")}         AS tbt_p75
            FROM analytics_custom_events
            WHERE ${BASE_WHERE}
            GROUP BY 1
            ORDER BY 1
        `, params),

        // Per-country breakdown — only fetched on the main (unfiltered) view
        country ? Promise.resolve({ rows: [] }) : db.query(`
            SELECT
                COALESCE(NULLIF(country_code, ''), '??') AS country,
                COUNT(*)        AS samples,
                ${P75("lcp")}   AS lcp_p75,
                ${P75("cls")}   AS cls_p75,
                ${P75("inp")}   AS inp_p75,
                ${P75("ttfb")}  AS ttfb_p75,
                COUNT(*) FILTER (WHERE extra_data->>'rating' = 'good')              AS good_count,
                COUNT(*) FILTER (WHERE extra_data->>'rating' = 'needs-improvement') AS ni_count,
                COUNT(*) FILTER (WHERE extra_data->>'rating' = 'poor')              AS poor_count
            FROM analytics_custom_events
            WHERE
                site_id = $1
                AND received_at >= $2::date
                AND received_at <  $3::date + interval '1 day'
                AND name = 'page_perf'
            GROUP BY 1
            HAVING COUNT(*) >= 5
            ORDER BY samples DESC
            LIMIT 50
        `, params),

        // Previous-period totals — for period-over-period delta on metric cards
        db.query(`
            SELECT
                ${P75("lcp")}  AS lcp_p75,
                ${P75("cls")}  AS cls_p75,
                ${P75("inp")}  AS inp_p75,
                ${P75("fcp")}  AS fcp_p75,
                ${P75("ttfb")} AS ttfb_p75,
                ${P75("load")} AS load_p75,
                ${P75("tbt")}  AS tbt_p75
            FROM analytics_custom_events
            WHERE ${PREV_WHERE}
        `, prevParams),

    ]).catch(e => {
        console.error("analytics-performance query error:", e.message);
        return Array.from({ length: 6 }, () => ({ rows: [] }));
    });

    const t = totalsRes.rows[0] || {};
    const sampleSize   = parseInt(t.sample_size, 10) || 0;
    const goodCount    = parseInt(t.good_count, 10) || 0;
    const niCount      = parseInt(t.ni_count, 10) || 0;
    const poorCount    = parseInt(t.poor_count, 10) || 0;
    const ratedTotal   = goodCount + niCount + poorCount;

    function pct(n) { return ratedTotal > 0 ? Math.round(n / ratedTotal * 1000) / 10 : null; }
    function fnum(v) { return v != null ? Math.round(Number(v)) : null; }
    function fcls(v) { return v != null ? Math.round(Number(v) * 1000) / 1000 : null; }

    function mapRow(r) {
        return {
            lcpP25:  fnum(r.lcp_p25),  lcpP50:  fnum(r.lcp_p50),
            lcpP75:  fnum(r.lcp_p75),  lcpP90:  fnum(r.lcp_p90),  lcpP95:  fnum(r.lcp_p95),
            clsP25:  fcls(r.cls_p25),  clsP50:  fcls(r.cls_p50),
            clsP75:  fcls(r.cls_p75),  clsP90:  fcls(r.cls_p90),  clsP95:  fcls(r.cls_p95),
            inpP25:  fnum(r.inp_p25),  inpP50:  fnum(r.inp_p50),
            inpP75:  fnum(r.inp_p75),  inpP90:  fnum(r.inp_p90),  inpP95:  fnum(r.inp_p95),
            fcpP25:  fnum(r.fcp_p25),  fcpP50:  fnum(r.fcp_p50),
            fcpP75:  fnum(r.fcp_p75),  fcpP90:  fnum(r.fcp_p90),  fcpP95:  fnum(r.fcp_p95),
            ttfbP25: fnum(r.ttfb_p25), ttfbP50: fnum(r.ttfb_p50),
            ttfbP75: fnum(r.ttfb_p75), ttfbP90: fnum(r.ttfb_p90), ttfbP95: fnum(r.ttfb_p95),
            loadP25: fnum(r.load_p25), loadP50: fnum(r.load_p50),
            loadP75: fnum(r.load_p75), loadP90: fnum(r.load_p90), loadP95: fnum(r.load_p95),
        };
    }

    if (!sampleSize) {
        return res.status(200).json({ noData: true });
    }

    // Run attribution queries only when we know there's data
    const ATTR_WHERE = `
        site_id = $1
        AND received_at >= $2::date
        AND received_at <  $3::date + interval '1 day'
        AND name = 'page_perf'
        ${country ? "AND country_code = $4" : ""}
    `;
    // Business impact: always pass country as $4 (null when unfiltered) and qualifying events as $5
    const biParams = [siteId, fromDate, toDate, country || null, qualifyingEvents];

    const [lcpElemRes, slowResRes, longTaskRes, histogramRes, byNetworkRes, byBrowserRes, clsHistRes, inpHistRes, biRes] = await Promise.all([

        // Which element was the LCP candidate on each page?
        db.query(`
            SELECT
                pathname,
                extra_data->'lcpEl'->>'tag'  AS tag,
                extra_data->'lcpEl'->>'src'  AS src,
                extra_data->'lcpEl'->>'cls'  AS cls,
                extra_data->'lcpEl'->>'id'   AS el_id,
                COUNT(*)                     AS occurrences,
                ROUND(${P75("lcp")})         AS lcp_p75
            FROM analytics_custom_events
            WHERE ${ATTR_WHERE}
              AND extra_data->'lcpEl' IS NOT NULL
              AND extra_data->'lcpEl'->>'tag' IS NOT NULL
            GROUP BY 1, 2, 3, 4, 5
            ORDER BY occurrences DESC
            LIMIT 20
        `, params),

        // Slowest resources (>200 ms) aggregated by URL across all page_perf events
        db.query(`
            SELECT
                res->>'url'   AS url,
                res->>'type'  AS resource_type,
                COUNT(*)      AS occurrences,
                ROUND(AVG((res->>'dur')::numeric))          AS avg_dur,
                ROUND(AVG((res->>'size')::numeric) / 1024)  AS avg_kb
            FROM analytics_custom_events,
              LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(extra_data->'slowRes') = 'array'
                     THEN extra_data->'slowRes'
                     ELSE '[]'::jsonb END
              ) AS res
            WHERE ${ATTR_WHERE}
            GROUP BY 1, 2
            HAVING COUNT(*) >= 1
            ORDER BY avg_dur DESC
            LIMIT 25
        `, params),

        // Main-thread long tasks aggregated by attributed script source
        db.query(`
            SELECT
                COALESCE(task->>'src', '')                                              AS src,
                COUNT(*)                                                                AS occurrences,
                ROUND(AVG((task->>'dur')::numeric))                                     AS avg_dur,
                PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (task->>'dur')::numeric)   AS p75_dur,
                MAX((task->>'dur')::numeric)::int                                        AS max_dur,
                ROUND(AVG((task->>'st')::numeric))                                      AS avg_start,
                MODE() WITHIN GROUP (ORDER BY task->>'ct')                              AS container_type,
                MODE() WITHIN GROUP (ORDER BY task->>'fn')                              AS function_name,
                MODE() WITHIN GROUP (ORDER BY task->>'inv')                             AS invoker_type,
                ROUND(SUM(GREATEST((task->>'dur')::numeric - 50, 0)))                   AS total_blocking
            FROM analytics_custom_events,
              LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(extra_data->'longTasks') = 'array'
                     THEN extra_data->'longTasks'
                     ELSE '[]'::jsonb END
              ) AS task
            WHERE ${ATTR_WHERE}
            GROUP BY 1
            ORDER BY total_blocking DESC
            LIMIT 20
        `, params),

        // LCP histogram — 500 ms buckets, capped at 8 000 ms for the last bucket
        db.query(`
            SELECT
                LEAST(FLOOR((extra_data->>'lcp')::numeric / 500) * 500, 8000)::int AS bucket_ms,
                COUNT(*) AS count
            FROM analytics_custom_events
            WHERE ${ATTR_WHERE}
              AND extra_data->>'lcp' IS NOT NULL
              AND (extra_data->>'lcp')::numeric BETWEEN 1 AND 30000
            GROUP BY 1
            ORDER BY 1
        `, params),

        // Per-connection-type P75 breakdown (Network Information API effectiveType)
        db.query(`
            SELECT
                extra_data->'net'->>'type'   AS net_type,
                COUNT(*)       AS samples,
                ${P75("lcp")}  AS lcp_p75,
                ${P75("cls")}  AS cls_p75,
                ${P75("inp")}  AS inp_p75,
                ${P75("fcp")}  AS fcp_p75,
                ${P75("ttfb")} AS ttfb_p75,
                ${P75("load")} AS load_p75
            FROM analytics_custom_events
            WHERE ${ATTR_WHERE}
              AND extra_data->'net'->>'type' IS NOT NULL
            GROUP BY 1
            ORDER BY samples DESC
        `, params),

        // Per-browser P75 breakdown (browser_family populated since schema migration)
        db.query(`
            SELECT
                COALESCE(NULLIF(browser_family, ''), 'other') AS browser,
                COUNT(*)        AS samples,
                ${P75("lcp")}   AS lcp_p75,
                ${P75("cls")}   AS cls_p75,
                ${P75("inp")}   AS inp_p75,
                ${P75("ttfb")}  AS ttfb_p75,
                ${P75("load")}  AS load_p75
            FROM analytics_custom_events
            WHERE ${ATTR_WHERE}
            GROUP BY 1
            HAVING COUNT(*) >= 3
            ORDER BY samples DESC
        `, params),

        // CLS histogram — 0.025 buckets, capped at 0.5 for the last bucket
        db.query(`
            SELECT
                ROUND(LEAST(FLOOR((extra_data->>'cls')::numeric / 0.025) * 0.025, 0.5), 3)::numeric AS bucket,
                COUNT(*) AS count
            FROM analytics_custom_events
            WHERE ${ATTR_WHERE}
              AND extra_data->>'cls' IS NOT NULL
              AND (extra_data->>'cls')::numeric BETWEEN 0.001 AND 2
            GROUP BY 1
            ORDER BY 1
        `, params),

        // INP histogram — 50 ms buckets, capped at 1000 ms for the last bucket
        db.query(`
            SELECT
                LEAST(FLOOR((extra_data->>'inp')::numeric / 50) * 50, 1000)::int AS bucket_ms,
                COUNT(*) AS count
            FROM analytics_custom_events
            WHERE ${ATTR_WHERE}
              AND extra_data->>'inp' IS NOT NULL
              AND (extra_data->>'inp')::numeric BETWEEN 1 AND 5000
            GROUP BY 1
            ORDER BY 1
        `, params),

        // Business impact — conversion rate by CWV rating (full-consent sessions only)
        // $4 = country filter (null = all), $5 = qualifying event names array
        qualifyingEvents.length > 0 ? db.query(`
            WITH perf_sessions AS (
                SELECT session_id, extra_data->>'rating' AS rating
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name = 'page_perf'
                  AND session_id IS NOT NULL
                  AND ($4::char(2) IS NULL OR country_code = $4)
            ),
            converted_sessions AS (
                SELECT DISTINCT session_id
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name = ANY($5::varchar[])
                  AND session_id IS NOT NULL
            )
            SELECT
                ps.rating,
                COUNT(*)                    AS sessions,
                COUNT(cs.session_id)        AS conversions
            FROM perf_sessions ps
            LEFT JOIN converted_sessions cs ON cs.session_id = ps.session_id
            WHERE ps.rating IS NOT NULL
            GROUP BY 1
            ORDER BY CASE ps.rating
                WHEN 'good'             THEN 1
                WHEN 'needs-improvement' THEN 2
                WHEN 'poor'             THEN 3
                ELSE 4
            END
        `, biParams) : Promise.resolve({ rows: [] }),

    ]).catch(e => {
        console.error("analytics-performance attribution query error:", e.message);
        return Array.from({ length: 9 }, () => ({ rows: [] }));
    });

    return res.status(200).json({
        totals: {
            sampleSize,
            ...mapRow(t),
            tbtP75:   fnum(t.tbt_p75),
            goodCount, niCount, poorCount,
            goodPct:  pct(goodCount),
            niPct:    pct(niCount),
            poorPct:  pct(poorCount),
        },
        byPage: byPageRes.rows.map(r => ({
            pathname:    r.pathname,
            samples:     parseInt(r.samples, 10) || 0,
            modalRating: r.modal_rating || null,
            lcpP50:      fnum(r.lcp_p50),
            lcpP75:      fnum(r.lcp_p75),
            lcpP90:      fnum(r.lcp_p90),
            clsP75:      fcls(r.cls_p75),
            inpP75:      fnum(r.inp_p75),
            fcpP75:      fnum(r.fcp_p75),
            ttfbP75:     fnum(r.ttfb_p75),
            loadP75:     fnum(r.load_p75),
        })),
        byDevice: byDeviceRes.rows.map(r => ({
            device:  r.device,
            samples: parseInt(r.samples, 10) || 0,
            ...mapRow(r),
        })),
        daily: dailyRes.rows.map(r => ({
            day:      r.day,
            samples:  parseInt(r.samples, 10) || 0,
            lcpP50:   fnum(r.lcp_p50),  lcpP75:  fnum(r.lcp_p75),  lcpP90:  fnum(r.lcp_p90),
            clsP50:   fcls(r.cls_p50),  clsP75:  fcls(r.cls_p75),  clsP90:  fcls(r.cls_p90),
            inpP50:   fnum(r.inp_p50),  inpP75:  fnum(r.inp_p75),  inpP90:  fnum(r.inp_p90),
            fcpP50:   fnum(r.fcp_p50),  fcpP75:  fnum(r.fcp_p75),  fcpP90:  fnum(r.fcp_p90),
            ttfbP50:  fnum(r.ttfb_p50), ttfbP75: fnum(r.ttfb_p75), ttfbP90: fnum(r.ttfb_p90),
            tbtP75:   fnum(r.tbt_p75),
        })),
        lcpElements: lcpElemRes.rows.map(r => ({
            pathname:    r.pathname,
            tag:         r.tag || null,
            src:         r.src  || null,
            cls:         r.cls  || null,
            elId:        r.el_id || null,
            occurrences: parseInt(r.occurrences, 10) || 0,
            lcpP75:      fnum(r.lcp_p75),
        })),
        slowResources: slowResRes.rows.map(r => ({
            url:          r.url,
            resourceType: r.resource_type || null,
            occurrences:  parseInt(r.occurrences, 10) || 0,
            avgDur:       fnum(r.avg_dur),
            avgKb:        parseInt(r.avg_kb, 10) || 0,
        })),
        longTasks: longTaskRes.rows.map(r => ({
            src:           r.src || null,
            occurrences:   parseInt(r.occurrences, 10) || 0,
            avgDur:        fnum(r.avg_dur),
            p75Dur:        fnum(r.p75_dur),
            maxDur:        parseInt(r.max_dur, 10) || 0,
            avgStart:      fnum(r.avg_start),
            containerType: r.container_type || null,
            functionName:  r.function_name  || null,
            invokerType:   r.invoker_type   || null,
            totalBlocking: fnum(r.total_blocking),
        })),
        histogram: histogramRes.rows.map(r => ({
            bucketMs: parseInt(r.bucket_ms, 10) || 0,
            count:    parseInt(r.count, 10) || 0,
        })),
        byCountry: byCountryRes.rows.map(r => ({
            country:    r.country,
            samples:    parseInt(r.samples, 10) || 0,
            lcpP75:     fnum(r.lcp_p75),
            clsP75:     fcls(r.cls_p75),
            inpP75:     fnum(r.inp_p75),
            ttfbP75:    fnum(r.ttfb_p75),
            goodCount:  parseInt(r.good_count, 10) || 0,
            niCount:    parseInt(r.ni_count,   10) || 0,
            poorCount:  parseInt(r.poor_count, 10) || 0,
        })),
        byNetwork: byNetworkRes.rows.map(r => ({
            netType: r.net_type,
            samples: parseInt(r.samples, 10) || 0,
            lcpP75:  fnum(r.lcp_p75),
            clsP75:  fcls(r.cls_p75),
            inpP75:  fnum(r.inp_p75),
            fcpP75:  fnum(r.fcp_p75),
            ttfbP75: fnum(r.ttfb_p75),
            loadP75: fnum(r.load_p75),
        })),
        byBrowser: byBrowserRes.rows.map(r => ({
            browser: r.browser,
            samples: parseInt(r.samples, 10) || 0,
            lcpP75:  fnum(r.lcp_p75),
            clsP75:  fcls(r.cls_p75),
            inpP75:  fnum(r.inp_p75),
            ttfbP75: fnum(r.ttfb_p75),
            loadP75: fnum(r.load_p75),
        })),
        clsHistogram: clsHistRes.rows.map(r => ({
            bucket: parseFloat(r.bucket) || 0,
            count:  parseInt(r.count, 10) || 0,
        })),
        inpHistogram: inpHistRes.rows.map(r => ({
            bucketMs: parseInt(r.bucket_ms, 10) || 0,
            count:    parseInt(r.count, 10) || 0,
        })),
        prevTotals: (() => {
            const p = prevTotalsRes.rows[0] || {};
            return {
                lcpP75:  fnum(p.lcp_p75),
                clsP75:  fcls(p.cls_p75),
                inpP75:  fnum(p.inp_p75),
                fcpP75:  fnum(p.fcp_p75),
                ttfbP75: fnum(p.ttfb_p75),
                loadP75: fnum(p.load_p75),
                tbtP75:  fnum(p.tbt_p75),
            };
        })(),
        prevPeriod: { from: prevFromDate, to: prevToDate },
        qualifyingEvents,
        businessImpact: qualifyingEvents.length === 0
            ? null
            : biRes.rows.map(r => {
                const sessions    = parseInt(r.sessions,    10) || 0;
                const conversions = parseInt(r.conversions, 10) || 0;
                return {
                    rating:          r.rating,
                    sessions,
                    conversions,
                    conversionRate:  sessions > 0 ? Math.round(conversions / sessions * 1000) / 10 : 0,
                };
            }),
    });
}
