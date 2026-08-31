import { getPool } from "./_db.js";
/**
 * GET /api/analytics-page-weight?domain=<domain>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>
 *
 * Page weight + file-level breakdown for the "Page Weight" dashboard —
 * a standalone page next to Core Web Vitals (api/analytics-performance.js).
 * Sourced from the same page_perf events, but from the pageWeight/byType/
 * topRes fields the embed script started sending alongside the existing
 * lcp/cls/inp/... metrics — older cached embeds (or events sent before this
 * shipped) won't have them, so sampleSize below can be smaller than the CWV
 * dashboard's sample size for the same range while the embed cache rolls over.
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

const Pn = (col, p) =>
    `PERCENTILE_CONT(${p}) WITHIN GROUP (ORDER BY (extra_data->>'${col}')::numeric) FILTER (WHERE extra_data->>'${col}' IS NOT NULL AND (extra_data->>'${col}')::numeric > 0)`;
const P75 = (col) => Pn(col, 0.75);
// Same shape as Pn()/P75() above but for a numeric field nested one level
// deeper — pageWeight sits at extra_data->>'pageWeight' (top-level, like lcp/
// cls/...), so this only exists for symmetry/clarity at call sites.
const PW_P75 = P75("pageWeight");

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

    const dayDiff       = Math.max(1, Math.round((new Date(toDate) - new Date(fromDate)) / 86400000) + 1);
    const prevToDate    = new Date(new Date(fromDate).getTime() - 86400000).toISOString().slice(0, 10);
    const prevFromDate  = new Date(new Date(fromDate).getTime() - dayDiff * 86400000).toISOString().slice(0, 10);

    const db = getPool();

    const siteRes = await db.query(
        `SELECT id FROM analytics_sites WHERE domain = $1 AND organisation_id = $2 LIMIT 1`,
        [domain, orgId]
    ).catch(() => ({ rows: [] }));

    if (!siteRes.rows.length) return res.status(404).json({ error: "Site not found" });
    const siteId = siteRes.rows[0].id;

    const params     = [siteId, fromDate,     toDate];
    const prevParams = [siteId, prevFromDate, prevToDate];

    const BASE_WHERE = `
        site_id = $1
        AND received_at >= $2::date
        AND received_at <  $3::date + interval '1 day'
        AND name = 'page_perf'
    `;
    // Narrower than BASE_WHERE — only events that actually carry a pageWeight
    // sample (see file-header comment on why that can lag the CWV sample size).
    const PW_WHERE = `${BASE_WHERE} AND extra_data->>'pageWeight' IS NOT NULL`;

    const [
        cwvSampleRes, totalsRes, prevTotalsRes, byTypeRes, topFilesRes, slowResRes, longTaskRes,
    ] = await Promise.all([

        // Any page_perf data at all for this range? Distinguishes "site not
        // collecting analytics" from "collecting, but no pageWeight samples
        // yet" (e.g. cached pre-update embed) for the empty-state message.
        db.query(`SELECT COUNT(*) AS n FROM analytics_custom_events WHERE ${BASE_WHERE}`, params),

        db.query(`
            SELECT
                COUNT(*)                          AS sample_size,
                ROUND(AVG((extra_data->>'pageWeight')::numeric)) AS avg_weight,
                ROUND(${PW_P75})                  AS p75_weight,
                ROUND(${P75("ttfb")})             AS ttfb_p75,
                ROUND(${P75("lcp")})              AS lcp_p75,
                ROUND(${P75("cls")}::numeric, 3)  AS cls_p75,
                ROUND(${P75("tbt")})              AS tbt_p75,
                ROUND(${P75("inp")})              AS inp_p75
            FROM analytics_custom_events
            WHERE ${PW_WHERE}
        `, params),

        db.query(`
            SELECT ROUND(AVG((extra_data->>'pageWeight')::numeric)) AS avg_weight
            FROM analytics_custom_events
            WHERE ${PW_WHERE}
        `, prevParams),

        // Bytes per resource-type bucket, averaged per pageload (not summed
        // across all loads — a sum would just track traffic volume). Divides
        // by the count of pageloads that had a byType sample at all, so a
        // bucket a given pageload didn't use still counts as 0 toward its
        // average rather than being silently excluded (which would bias the
        // average up).
        db.query(`
            WITH pv AS (
                SELECT id, extra_data->'byType' AS bt
                FROM analytics_custom_events
                WHERE ${PW_WHERE}
                  AND jsonb_typeof(extra_data->'byType') = 'array'
            )
            SELECT
                pair->>0                              AS type,
                ROUND(SUM((pair->>1)::numeric))       AS total_bytes,
                (SELECT COUNT(*) FROM pv)              AS sample_count
            FROM pv, LATERAL jsonb_array_elements(bt) AS pair
            GROUP BY 1
            ORDER BY total_bytes DESC
        `, params),

        // Largest files by transfer size, aggregated by URL across all
        // pageloads — same aggregation shape as the Slow Resources table on
        // the Core Web Vitals page, but ranked by size instead of duration.
        db.query(`
            SELECT
                res->>'url'   AS url,
                res->>'type'  AS resource_type,
                COUNT(*)      AS occurrences,
                ROUND(AVG((res->>'dur')::numeric))          AS avg_dur,
                ROUND(AVG((res->>'size')::numeric) / 1024)  AS avg_kb
            FROM analytics_custom_events,
              LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(extra_data->'topRes') = 'array'
                     THEN extra_data->'topRes'
                     ELSE '[]'::jsonb END
              ) AS res
            WHERE ${BASE_WHERE}
            GROUP BY 1, 2
            ORDER BY avg_kb DESC
            LIMIT 40
        `, params),

        // Slowest resources (>200ms) — duplicated from analytics-performance.js
        // (same duplication convention used elsewhere in this codebase) so
        // this page's diagnostics don't depend on the CWV endpoint having run.
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
            WHERE ${BASE_WHERE}
            GROUP BY 1, 2
            HAVING COUNT(*) >= 1
            ORDER BY avg_dur DESC
            LIMIT 25
        `, params),

        db.query(`
            SELECT
                COALESCE(task->>'src', '')                                              AS src,
                COUNT(*)                                                                AS occurrences,
                ROUND(SUM(GREATEST((task->>'dur')::numeric - 50, 0)))                   AS total_blocking
            FROM analytics_custom_events,
              LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(extra_data->'longTasks') = 'array'
                     THEN extra_data->'longTasks'
                     ELSE '[]'::jsonb END
              ) AS task
            WHERE ${BASE_WHERE}
            GROUP BY 1
            ORDER BY total_blocking DESC
            LIMIT 10
        `, params),

    ]).catch(e => {
        console.error("analytics-page-weight query error:", e.message);
        return Array.from({ length: 7 }, () => ({ rows: [] }));
    });

    const anyPagePerf = parseInt(cwvSampleRes.rows[0]?.n, 10) || 0;
    if (!anyPagePerf) {
        return res.status(200).json({ noData: true });
    }

    const t = totalsRes.rows[0] || {};
    const sampleSize = parseInt(t.sample_size, 10) || 0;
    if (!sampleSize) {
        return res.status(200).json({ noPageWeightYet: true });
    }

    const fnum = (v) => (v != null ? Number(v) : null);

    const byType = byTypeRes.rows.map(r => {
        const sampleCount = parseInt(r.sample_count, 10) || 0;
        const totalBytes  = Number(r.total_bytes) || 0;
        return {
            type:      r.type,
            avgBytes:  sampleCount > 0 ? Math.round(totalBytes / sampleCount) : 0,
        };
    }).filter(r => r.avgBytes > 0);

    return res.status(200).json({
        totals: {
            sampleSize,
            avgPageWeight: fnum(t.avg_weight),
            p75PageWeight: fnum(t.p75_weight),
            ttfbP75: fnum(t.ttfb_p75),
            lcpP75:  fnum(t.lcp_p75),
            clsP75:  fnum(t.cls_p75),
            tbtP75:  fnum(t.tbt_p75),
            inpP75:  fnum(t.inp_p75),
        },
        prevTotals: {
            avgPageWeight: fnum(prevTotalsRes.rows[0]?.avg_weight),
        },
        byType,
        topFiles: topFilesRes.rows.map(r => ({
            url:          r.url,
            resourceType: r.resource_type || null,
            occurrences:  parseInt(r.occurrences, 10) || 0,
            avgDur:       fnum(r.avg_dur),
            avgKb:        parseInt(r.avg_kb, 10) || 0,
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
            totalBlocking: fnum(r.total_blocking),
        })),
        prevPeriod: { from: prevFromDate, to: prevToDate },
    });
}
