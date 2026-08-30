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

// Reusable P75 expressions for each metric (filters out NULL values)
const P75 = (col) =>
    `PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (extra_data->>'${col}')::numeric) FILTER (WHERE extra_data->>'${col}' IS NOT NULL AND (extra_data->>'${col}')::numeric > 0)`;

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const payload = validateJwt(req.headers.authorization);
    if (!payload) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation, 10);
    if (!orgId || isNaN(orgId)) return res.status(400).json({ error: "Missing Organisation header" });

    if (req.method !== "GET") return res.status(405).end();

    const { domain, from, to } = req.query;
    if (!domain) return res.status(400).json({ error: "domain required" });

    const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const toDate   = to   || new Date().toISOString().slice(0, 10);

    const db = getPool();

    const siteRes = await db.query(
        `SELECT id FROM analytics_sites WHERE domain = $1 AND organisation_id = $2 LIMIT 1`,
        [domain, orgId]
    ).catch(() => ({ rows: [] }));

    if (!siteRes.rows.length) return res.status(404).json({ error: "Site not found" });
    const siteId = siteRes.rows[0].id;

    const BASE_WHERE = `
        site_id = $1
        AND received_at >= $2::date
        AND received_at <  $3::date + interval '1 day'
        AND name = 'page_perf'
    `;

    const [totalsRes, byPageRes, byDeviceRes, dailyRes] = await Promise.all([

        // Site-wide P75 for every metric + rating distribution
        db.query(`
            SELECT
                COUNT(*)                                                              AS sample_size,
                ${P75("lcp")}                                                         AS lcp_p75,
                ${P75("cls")}                                                         AS cls_p75,
                ${P75("inp")}                                                         AS inp_p75,
                ${P75("fcp")}                                                         AS fcp_p75,
                ${P75("ttfb")}                                                        AS ttfb_p75,
                ${P75("load")}                                                        AS load_p75,
                COUNT(*) FILTER (WHERE extra_data->>'rating' = 'good')               AS good_count,
                COUNT(*) FILTER (WHERE extra_data->>'rating' = 'needs-improvement')  AS ni_count,
                COUNT(*) FILTER (WHERE extra_data->>'rating' = 'poor')               AS poor_count
            FROM analytics_custom_events
            WHERE ${BASE_WHERE}
        `, [siteId, fromDate, toDate]),

        // Per-page P75 breakdown — sorted by sample count so high-traffic pages
        // appear first (a slow page with 10 visitors matters less than a slow one
        // with 10 000). Limit 50 to keep the response manageable.
        db.query(`
            SELECT
                pathname,
                COUNT(*)        AS samples,
                ${P75("lcp")}   AS lcp_p75,
                ${P75("cls")}   AS cls_p75,
                ${P75("inp")}   AS inp_p75,
                ${P75("fcp")}   AS fcp_p75,
                ${P75("ttfb")}  AS ttfb_p75,
                ${P75("load")}  AS load_p75,
                MODE() WITHIN GROUP (ORDER BY extra_data->>'rating') AS modal_rating
            FROM analytics_custom_events
            WHERE ${BASE_WHERE}
              AND pathname IS NOT NULL
            GROUP BY pathname
            HAVING COUNT(*) >= 3
            ORDER BY samples DESC
            LIMIT 50
        `, [siteId, fromDate, toDate]),

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
        `, [siteId, fromDate, toDate]),

        // Daily trend — P75 LCP and CLS each day for the trend chart
        db.query(`
            SELECT
                DATE_TRUNC('day', received_at)::date AS day,
                COUNT(*)      AS samples,
                ${P75("lcp")} AS lcp_p75,
                ${P75("cls")} AS cls_p75,
                ${P75("ttfb")} AS ttfb_p75
            FROM analytics_custom_events
            WHERE ${BASE_WHERE}
            GROUP BY 1
            ORDER BY 1
        `, [siteId, fromDate, toDate]),

    ]).catch(e => {
        console.error("analytics-performance query error:", e.message);
        return Array.from({ length: 4 }, () => ({ rows: [] }));
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
            lcpP75:  fnum(r.lcp_p75),
            clsP75:  fcls(r.cls_p75),
            inpP75:  fnum(r.inp_p75),
            fcpP75:  fnum(r.fcp_p75),
            ttfbP75: fnum(r.ttfb_p75),
            loadP75: fnum(r.load_p75),
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
    `;
    const [lcpElemRes, slowResRes, longTaskRes] = await Promise.all([

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
            GROUP BY 1, 2, 3, 4, 5
            ORDER BY occurrences DESC
            LIMIT 20
        `, [siteId, fromDate, toDate]),

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
        `, [siteId, fromDate, toDate]),

        // Main-thread long tasks aggregated by attributed script source
        db.query(`
            SELECT
                COALESCE(task->>'src', '')     AS src,
                COUNT(*)                       AS occurrences,
                ROUND(AVG((task->>'dur')::numeric)) AS avg_dur,
                MAX((task->>'dur')::numeric)::int   AS max_dur
            FROM analytics_custom_events,
              LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(extra_data->'longTasks') = 'array'
                     THEN extra_data->'longTasks'
                     ELSE '[]'::jsonb END
              ) AS task
            WHERE ${ATTR_WHERE}
            GROUP BY 1
            ORDER BY occurrences DESC
            LIMIT 20
        `, [siteId, fromDate, toDate]),

    ]).catch(e => {
        console.error("analytics-performance attribution query error:", e.message);
        return Array.from({ length: 3 }, () => ({ rows: [] }));
    });

    return res.status(200).json({
        totals: {
            sampleSize,
            ...mapRow(t),
            goodCount, niCount, poorCount,
            goodPct:  pct(goodCount),
            niPct:    pct(niCount),
            poorPct:  pct(poorCount),
        },
        byPage: byPageRes.rows.map(r => ({
            pathname:    r.pathname,
            samples:     parseInt(r.samples, 10) || 0,
            modalRating: r.modal_rating || null,
            ...mapRow(r),
        })),
        byDevice: byDeviceRes.rows.map(r => ({
            device:  r.device,
            samples: parseInt(r.samples, 10) || 0,
            ...mapRow(r),
        })),
        daily: dailyRes.rows.map(r => ({
            day:     r.day,
            samples: parseInt(r.samples, 10) || 0,
            lcpP75:  fnum(r.lcp_p75),
            clsP75:  fcls(r.cls_p75),
            ttfbP75: fnum(r.ttfb_p75),
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
            src:         r.src || null,
            occurrences: parseInt(r.occurrences, 10) || 0,
            avgDur:      fnum(r.avg_dur),
            maxDur:      parseInt(r.max_dur, 10) || 0,
        })),
    });
}
