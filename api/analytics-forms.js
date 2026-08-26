/**
 * GET /api/analytics-forms?domain=<domain>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>
 *
 * Returns aggregated form analytics:
 *   - totals: submissions, starters, completion rate
 *   - daily: submissions per day (for trend chart)
 *   - forms: per-form breakdown with submission count, starter count, completion rate, top pages
 *   - topPages: pages with the most form submissions
 *
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
            max: 1,
            idleTimeoutMillis: 10_000,
            connectionTimeoutMillis: 5_000,
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

    // Resolve site_id from domain + org
    const siteRes = await db.query(
        `SELECT id FROM analytics_sites WHERE domain = $1 AND organisation_id = $2 LIMIT 1`,
        [domain, orgId]
    ).catch(() => ({ rows: [] }));

    if (!siteRes.rows.length) return res.status(404).json({ error: "Site not found" });
    const siteId = siteRes.rows[0].id;

    const [totalsRes, dailyRes, formsRes, topPagesRes] = await Promise.all([
        // Overall submission + starter counts
        db.query(`
            SELECT
                COUNT(*) FILTER (WHERE name = 'form_submit')  AS submissions,
                COUNT(*) FILTER (WHERE name = 'form_started') AS starters
            FROM analytics_custom_events
            WHERE site_id = $1
              AND created_at >= $2::date
              AND created_at <  $3::date + interval '1 day'
              AND name IN ('form_submit', 'form_started')
        `, [siteId, fromDate, toDate]),

        // Daily submission trend
        db.query(`
            SELECT
                DATE_TRUNC('day', created_at)::date AS day,
                COUNT(*)                             AS submissions
            FROM analytics_custom_events
            WHERE site_id = $1
              AND created_at >= $2::date
              AND created_at <  $3::date + interval '1 day'
              AND name = 'form_submit'
            GROUP BY 1
            ORDER BY 1
        `, [siteId, fromDate, toDate]),

        // Per-form breakdown
        db.query(`
            WITH submits AS (
                SELECT
                    COALESCE(extra_data->>'formId', 'unknown') AS form_id,
                    extra_data->>'action'                       AS form_action,
                    page_url,
                    COUNT(*)                                    AS submissions
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND created_at >= $2::date
                  AND created_at <  $3::date + interval '1 day'
                  AND name = 'form_submit'
                GROUP BY 1, 2, 3
            ),
            starters AS (
                SELECT
                    COALESCE(extra_data->>'formId', 'unknown') AS form_id,
                    COUNT(*)                                    AS starters
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND created_at >= $2::date
                  AND created_at <  $3::date + interval '1 day'
                  AND name = 'form_started'
                GROUP BY 1
            ),
            per_form AS (
                SELECT
                    s.form_id,
                    MAX(s.form_action)  AS form_action,
                    SUM(s.submissions)  AS submissions,
                    MAX(st.starters)    AS starters,
                    COUNT(DISTINCT s.page_url) AS page_count,
                    (array_agg(s.page_url ORDER BY s.submissions DESC))[1] AS top_page
                FROM submits s
                LEFT JOIN starters st USING (form_id)
                GROUP BY s.form_id
            )
            SELECT
                form_id,
                form_action,
                submissions,
                COALESCE(starters, 0) AS starters,
                page_count,
                top_page,
                CASE WHEN COALESCE(starters, 0) > 0
                     THEN ROUND(submissions::numeric / starters * 100, 1)
                     ELSE NULL
                END AS completion_rate
            FROM per_form
            ORDER BY submissions DESC
            LIMIT 50
        `, [siteId, fromDate, toDate]),

        // Top pages by form submission volume
        db.query(`
            SELECT
                page_url,
                COUNT(*) AS submissions
            FROM analytics_custom_events
            WHERE site_id = $1
              AND created_at >= $2::date
              AND created_at <  $3::date + interval '1 day'
              AND name = 'form_submit'
            GROUP BY page_url
            ORDER BY submissions DESC
            LIMIT 20
        `, [siteId, fromDate, toDate]),
    ]).catch(() => [{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }]);

    const totals = totalsRes.rows[0] || {};
    const submissions = parseInt(totals.submissions, 10) || 0;
    const starters    = parseInt(totals.starters,    10) || 0;

    return res.status(200).json({
        totals: {
            submissions,
            starters,
            completionRate: starters > 0 ? Math.round((submissions / starters) * 1000) / 10 : null,
        },
        daily: dailyRes.rows.map(r => ({
            day: r.day,
            submissions: parseInt(r.submissions, 10) || 0,
        })),
        forms: formsRes.rows.map(r => ({
            formId:         r.form_id,
            formAction:     r.form_action || null,
            submissions:    parseInt(r.submissions, 10) || 0,
            starters:       parseInt(r.starters, 10) || 0,
            completionRate: r.completion_rate != null ? parseFloat(r.completion_rate) : null,
            pageCount:      parseInt(r.page_count, 10) || 0,
            topPage:        r.top_page || null,
        })),
        topPages: topPagesRes.rows.map(r => ({
            page:        r.page_url,
            submissions: parseInt(r.submissions, 10) || 0,
        })),
    });
}
