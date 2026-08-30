import { getPool } from "./_db.js";
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

    const [totalsRes, dailyRes, formsRes, topPagesRes, deviceRes, abandonRes, errorsRes, fieldErrorsRes, recoveryRes, timeRes, stepRes, geoRes, acqChannelRes, acqReferrerRes, acqPagesRes] = await Promise.all([
        // Overall submission + starter counts — two variants in one query:
        //   all events (any consent level, no session_id requirement) for the
        //   top-line KPIs, AND session-linked events only (session_id IS NOT NULL)
        //   for the session abandonment table. Keeping both in one pass avoids
        //   a second round-trip and makes the denominator mismatch explicit in
        //   the response so the frontend can surface it to the user.
        db.query(`
            SELECT
                COUNT(*) FILTER (WHERE name = 'form_submit')                               AS submissions,
                COUNT(*) FILTER (WHERE name = 'form_started')                              AS starters,
                COUNT(*) FILTER (WHERE name = 'form_submit'  AND session_id IS NOT NULL)   AS session_submissions,
                COUNT(*) FILTER (WHERE name = 'form_started' AND session_id IS NOT NULL)   AS session_starters
            FROM analytics_custom_events
            WHERE site_id = $1
              AND received_at >= $2::date
              AND received_at <  $3::date + interval '1 day'
              AND name IN ('form_submit', 'form_started')
        `, [siteId, fromDate, toDate]),

        // Daily submission trend
        db.query(`
            SELECT
                DATE_TRUNC('day', received_at)::date AS day,
                COUNT(*)                              AS submissions
            FROM analytics_custom_events
            WHERE site_id = $1
              AND received_at >= $2::date
              AND received_at <  $3::date + interval '1 day'
              AND name = 'form_submit'
            GROUP BY 1
            ORDER BY 1
        `, [siteId, fromDate, toDate]),

        // Per-form breakdown
        db.query(`
            WITH submits AS (
                SELECT
                    COALESCE(NULLIF(extra_data->>'formId', ''), 'unknown') AS form_id,
                    extra_data->>'action'                                   AS form_action,
                    pathname,
                    COUNT(*)                                                AS submissions
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name = 'form_submit'
                GROUP BY 1, 2, 3
            ),
            starters AS (
                SELECT
                    CASE
                        WHEN extra_data->>'formId' IN ('form','unknown') OR extra_data->>'formId' IS NULL OR extra_data->>'formId' = ''
                        THEN COALESCE(NULLIF(extra_data->>'action', ''), 'form')
                        ELSE extra_data->>'formId'
                    END AS form_id,
                    COUNT(*) AS starters
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name = 'form_started'
                GROUP BY 1
            ),
            per_form AS (
                SELECT
                    s.form_id,
                    MAX(s.form_action)                                         AS form_action,
                    SUM(s.submissions)                                          AS submissions,
                    MAX(st.starters)                                            AS starters,
                    COUNT(DISTINCT s.pathname)                                  AS page_count,
                    (array_agg(s.pathname ORDER BY s.submissions DESC))[1]     AS top_page
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
                     THEN LEAST(100, ROUND(submissions::numeric / starters * 100, 1))
                     ELSE NULL
                END AS completion_rate
            FROM per_form
            ORDER BY submissions DESC
            LIMIT 50
        `, [siteId, fromDate, toDate]),

        // Top pages by form submission volume
        db.query(`
            SELECT
                pathname,
                COUNT(*) AS submissions
            FROM analytics_custom_events
            WHERE site_id = $1
              AND received_at >= $2::date
              AND received_at <  $3::date + interval '1 day'
              AND name = 'form_submit'
            GROUP BY pathname
            ORDER BY submissions DESC
            LIMIT 20
        `, [siteId, fromDate, toDate]),

        // Device type breakdown: started vs submitted vs errors per device.
        // Deduplicates by session_id so that retries (multiple form_submit events
        // in one session) don't inflate submitted above started.
        db.query(`
            WITH dc AS (
                SELECT
                    COALESCE(device_type, 'unknown') AS device,
                    COUNT(DISTINCT CASE WHEN name = 'form_started' AND session_id IS NOT NULL THEN session_id END)
                        + COUNT(*) FILTER (WHERE name = 'form_started' AND session_id IS NULL) AS started,
                    COUNT(DISTINCT CASE WHEN name = 'form_submit'  AND session_id IS NOT NULL THEN session_id END)
                        + COUNT(*) FILTER (WHERE name = 'form_submit'  AND session_id IS NULL) AS submitted,
                    COUNT(*) FILTER (WHERE name = 'form_error') AS errors
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name IN ('form_started', 'form_submit', 'form_error')
                GROUP BY 1
            )
            SELECT
                device,
                started,
                submitted,
                errors,
                CASE WHEN started > 0
                     THEN LEAST(100, ROUND(submitted::numeric / started * 100, 1))
                     ELSE NULL END AS completion_rate,
                CASE WHEN started > 0
                     THEN ROUND(errors::numeric / started * 100, 1)
                     ELSE NULL END AS error_rate
            FROM dc
            ORDER BY started DESC
        `, [siteId, fromDate, toDate]),

        // Session abandonment: per-form started/abandoned counts, rate, and dropout field
        db.query(`
            WITH started_sessions AS (
                SELECT
                    session_id,
                    CASE
                        WHEN extra_data->>'formId' IN ('form','unknown') OR extra_data->>'formId' IS NULL OR extra_data->>'formId' = ''
                        THEN COALESCE(NULLIF(extra_data->>'action', ''), 'form')
                        ELSE extra_data->>'formId'
                    END AS form_id
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name = 'form_started'
                  AND session_id IS NOT NULL
                GROUP BY 1, 2
            ),
            submitted_sessions AS (
                SELECT DISTINCT
                    session_id,
                    COALESCE(NULLIF(extra_data->>'formId', ''), 'unknown') AS form_id
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name = 'form_submit'
                  AND session_id IS NOT NULL
            ),
            session_status AS (
                SELECT
                    s.form_id,
                    s.session_id,
                    (sub.session_id IS NULL) AS abandoned
                FROM started_sessions s
                LEFT JOIN submitted_sessions sub USING (session_id, form_id)
            ),
            last_field AS (
                SELECT DISTINCT ON (f.session_id, COALESCE(f.extra_data->>'formId','unknown'))
                    f.session_id,
                    COALESCE(f.extra_data->>'formId', 'unknown') AS form_id,
                    f.extra_data->>'field'                        AS last_field,
                    COUNT(*) OVER (PARTITION BY f.session_id, COALESCE(f.extra_data->>'formId','unknown'))
                        AS fields_touched
                FROM analytics_custom_events f
                WHERE f.site_id = $1
                  AND f.received_at >= $2::date
                  AND f.received_at <  $3::date + interval '1 day'
                  AND f.name = 'form_field_focus'
                  AND f.session_id IS NOT NULL
                ORDER BY f.session_id, COALESCE(f.extra_data->>'formId','unknown'), f.received_at DESC
            ),
            field_counts AS (
                SELECT
                    COALESCE(extra_data->>'formId', 'unknown') AS form_id,
                    MAX((extra_data->>'fieldCount')::int)       AS total_fields
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name = 'form_submit'
                  AND (extra_data->>'fieldCount') IS NOT NULL
                GROUP BY 1
            )
            SELECT
                ss.form_id,
                COUNT(*)                                             AS total_started,
                COUNT(*) FILTER (WHERE ss.abandoned)                 AS abandoned_sessions,
                ROUND(
                    COUNT(*) FILTER (WHERE ss.abandoned)::numeric / NULLIF(COUNT(*), 0) * 100,
                1)                                                   AS abandonment_rate,
                MODE() WITHIN GROUP (ORDER BY lf.last_field)
                    FILTER (WHERE ss.abandoned)                      AS top_dropout_field,
                ROUND(AVG(lf.fields_touched) FILTER (WHERE ss.abandoned), 1)
                                                                     AS avg_fields_touched,
                fc.total_fields
            FROM session_status ss
            LEFT JOIN last_field lf
                   ON lf.session_id = ss.session_id AND lf.form_id = ss.form_id
            LEFT JOIN field_counts fc ON fc.form_id = ss.form_id
            GROUP BY ss.form_id, fc.total_fields
            ORDER BY abandoned_sessions DESC
            LIMIT 30
        `, [siteId, fromDate, toDate]),

        // Form errors — validation, network, and server errors
        db.query(`
            SELECT
                COALESCE(extra_data->>'formId', 'unknown')       AS form_id,
                COALESCE(extra_data->>'formClass', '')            AS form_class,
                COALESCE(extra_data->>'errorType', 'validation')  AS error_type,
                extra_data->>'field'                              AS field,
                extra_data->>'message'                            AS message,
                COUNT(*)                                          AS occurrences
            FROM analytics_custom_events
            WHERE site_id = $1
              AND received_at >= $2::date
              AND received_at <  $3::date + interval '1 day'
              AND name = 'form_error'
            GROUP BY 1, 2, 3, 4, 5
            ORDER BY occurrences DESC
            LIMIT 50
        `, [siteId, fromDate, toDate]),

        // Field-level error breakdown — which field caused the error AND led to
        // the session abandoning (dropout_sessions = error sessions that never
        // submitted). blocking_rate = dropout / error_sessions. Only covers
        // errors with a field value (validation errors); network/server errors
        // have NULL field and are excluded by the WHERE clause.
        db.query(`
            WITH error_sessions AS (
                SELECT
                    COALESCE(extra_data->>'formId', 'unknown') AS form_id,
                    extra_data->>'field'                        AS field,
                    session_id,
                    COUNT(*)                                    AS error_count
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name = 'form_error'
                  AND extra_data->>'field' IS NOT NULL
                  AND session_id IS NOT NULL
                GROUP BY 1, 2, 3
            ),
            submitted_sessions AS (
                SELECT DISTINCT
                    COALESCE(extra_data->>'formId', 'unknown') AS form_id,
                    session_id
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name = 'form_submit'
                  AND session_id IS NOT NULL
            )
            SELECT
                es.form_id,
                es.field,
                COUNT(DISTINCT es.session_id)                                               AS error_sessions,
                SUM(es.error_count)                                                          AS total_errors,
                COUNT(DISTINCT es.session_id) FILTER (WHERE ss.session_id IS NULL)          AS dropout_sessions,
                ROUND(
                    COUNT(DISTINCT es.session_id) FILTER (WHERE ss.session_id IS NULL)::numeric /
                    NULLIF(COUNT(DISTINCT es.session_id), 0) * 100,
                1)                                                                           AS blocking_rate
            FROM error_sessions es
            LEFT JOIN submitted_sessions ss ON ss.form_id = es.form_id AND ss.session_id = es.session_id
            GROUP BY es.form_id, es.field
            ORDER BY dropout_sessions DESC, total_errors DESC
            LIMIT 100
        `, [siteId, fromDate, toDate]),

        // Error recovery rate — of sessions that hit any form_error, what % went
        // on to successfully submit anyway. Low recovery = errors are blocking;
        // high recovery = errors are annoying but not fatal.
        db.query(`
            WITH error_sessions AS (
                SELECT DISTINCT
                    COALESCE(extra_data->>'formId', 'unknown') AS form_id,
                    session_id
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name = 'form_error'
                  AND session_id IS NOT NULL
            ),
            submitted_sessions AS (
                SELECT DISTINCT
                    COALESCE(extra_data->>'formId', 'unknown') AS form_id,
                    session_id
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name = 'form_submit'
                  AND session_id IS NOT NULL
            )
            SELECT
                es.form_id,
                COUNT(DISTINCT es.session_id)                AS error_sessions,
                COUNT(DISTINCT ss.session_id)                AS recovered_sessions,
                ROUND(
                    COUNT(DISTINCT ss.session_id)::numeric /
                    NULLIF(COUNT(DISTINCT es.session_id), 0) * 100,
                1)                                           AS recovery_rate
            FROM error_sessions es
            LEFT JOIN submitted_sessions ss ON ss.form_id = es.form_id AND ss.session_id = es.session_id
            GROUP BY es.form_id
            ORDER BY error_sessions DESC
            LIMIT 30
        `, [siteId, fromDate, toDate]),

        // Time-to-complete: median and average seconds from first field_focus to
        // form_submit, per form. Requires at least 2 matched sessions to be
        // statistically meaningful (HAVING clause). Only session-linked events
        // have both timestamps linkable — no session_id = no usable pair.
        db.query(`
            WITH first_focus AS (
                SELECT
                    CASE
                        WHEN extra_data->>'formId' IN ('form','unknown') OR extra_data->>'formId' IS NULL OR extra_data->>'formId' = ''
                        THEN COALESCE(NULLIF(extra_data->>'action', ''), 'form')
                        ELSE extra_data->>'formId'
                    END AS form_id,
                    session_id,
                    MIN(received_at) AS focus_at
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name = 'form_field_focus'
                  AND session_id IS NOT NULL
                GROUP BY 1, 2
            ),
            submits AS (
                SELECT
                    COALESCE(NULLIF(extra_data->>'formId', ''), 'unknown') AS form_id,
                    session_id,
                    MIN(received_at) AS submit_at
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name = 'form_submit'
                  AND session_id IS NOT NULL
                GROUP BY 1, 2
            )
            SELECT
                ff.form_id,
                COUNT(*)                                                          AS sessions,
                ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
                    ORDER BY EXTRACT(EPOCH FROM (s.submit_at - ff.focus_at))
                ))                                                                AS median_seconds,
                ROUND(AVG(EXTRACT(EPOCH FROM (s.submit_at - ff.focus_at))))      AS avg_seconds
            FROM first_focus ff
            JOIN submits s ON s.form_id = ff.form_id AND s.session_id = ff.session_id
            WHERE s.submit_at > ff.focus_at
            GROUP BY ff.form_id
            HAVING COUNT(*) >= 2
            ORDER BY sessions DESC
            LIMIT 30
        `, [siteId, fromDate, toDate]),

        // Multi-step progress: for each (form, step), how many sessions reached
        // that step and how many eventually submitted. Requires form_step events
        // fired by the embed's Next/Continue button detector or data-analytics-step
        // attribute changes. Sorted by reached DESC so step order in the frontend
        // follows natural funnel depth (most reached = earliest step).
        db.query(`
            WITH step_sessions AS (
                SELECT
                    COALESCE(extra_data->>'formId', 'unknown') AS form_id,
                    extra_data->>'step'                         AS step,
                    session_id
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name = 'form_step'
                  AND extra_data->>'step' IS NOT NULL
                  AND session_id IS NOT NULL
                GROUP BY 1, 2, 3
            ),
            submitted AS (
                SELECT DISTINCT
                    COALESCE(extra_data->>'formId', 'unknown') AS form_id,
                    session_id
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name = 'form_submit'
                  AND session_id IS NOT NULL
            )
            SELECT
                ss.form_id,
                ss.step,
                COUNT(DISTINCT ss.session_id)                     AS reached,
                COUNT(DISTINCT sub.session_id)                    AS completed,
                ROUND(
                    COUNT(DISTINCT sub.session_id)::numeric /
                    NULLIF(COUNT(DISTINCT ss.session_id), 0) * 100, 1
                )                                                  AS completion_rate
            FROM step_sessions ss
            LEFT JOIN submitted sub ON sub.form_id = ss.form_id AND sub.session_id = ss.session_id
            GROUP BY ss.form_id, ss.step
            ORDER BY ss.form_id, reached DESC
            LIMIT 100
        `, [siteId, fromDate, toDate]),

        // Geographic breakdown: submissions, starters, errors and completion rate
        // per country. country_code is set by the ingest endpoint from the
        // request's IP — present only when geolocation is enabled.
        // Deduplicates by session_id so retries don't inflate submitted above started.
        db.query(`
            WITH gc AS (
                SELECT
                    COALESCE(NULLIF(country_code, ''), '??') AS country,
                    COUNT(DISTINCT CASE WHEN name = 'form_started' AND session_id IS NOT NULL THEN session_id END)
                        + COUNT(*) FILTER (WHERE name = 'form_started' AND session_id IS NULL) AS starters,
                    COUNT(DISTINCT CASE WHEN name = 'form_submit'  AND session_id IS NOT NULL THEN session_id END)
                        + COUNT(*) FILTER (WHERE name = 'form_submit'  AND session_id IS NULL) AS submissions,
                    COUNT(*) FILTER (WHERE name = 'form_error') AS errors
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name IN ('form_started', 'form_submit', 'form_error')
                GROUP BY 1
            )
            SELECT
                country,
                starters,
                submissions,
                errors,
                CASE WHEN starters > 0
                     THEN LEAST(100, ROUND(submissions::numeric / starters * 100, 1))
                     ELSE NULL END AS completion_rate
            FROM gc
            WHERE starters + submissions > 0
            ORDER BY starters DESC, submissions DESC
            LIMIT 50
        `, [siteId, fromDate, toDate]),

        // Acquisition channels: UTM source / medium / campaign → form funnel.
        // Deduplicates form_submit by session so retries don't inflate submitted.
        // Events without any UTM params appear as (direct) / (none) / (none).
        db.query(`
            WITH ch AS (
                SELECT
                    COALESCE(NULLIF(utm_source,   ''), '(direct)') AS source,
                    COALESCE(NULLIF(utm_medium,   ''), '(none)')   AS medium,
                    COALESCE(NULLIF(utm_campaign, ''), '(none)')   AS campaign,
                    COUNT(DISTINCT CASE WHEN name = 'form_started' AND session_id IS NOT NULL THEN session_id END)
                        + COUNT(*) FILTER (WHERE name = 'form_started' AND session_id IS NULL) AS starters,
                    COUNT(DISTINCT CASE WHEN name = 'form_submit'  AND session_id IS NOT NULL THEN session_id END)
                        + COUNT(*) FILTER (WHERE name = 'form_submit'  AND session_id IS NULL) AS submissions,
                    COUNT(*) FILTER (WHERE name = 'form_error') AS errors
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name IN ('form_started', 'form_submit', 'form_error')
                GROUP BY 1, 2, 3
            )
            SELECT
                source, medium, campaign,
                starters, submissions, errors,
                CASE WHEN starters > 0
                     THEN LEAST(100, ROUND(submissions::numeric / starters * 100, 1))
                     ELSE NULL END AS completion_rate
            FROM ch
            WHERE starters + submissions > 0
            ORDER BY starters DESC, submissions DESC
            LIMIT 50
        `, [siteId, fromDate, toDate]),

        // Referrer → form funnel. Joins session's first referrer from analytics_events
        // (which stores referrer_host on pageviews) to the session's form events.
        // Session-linked only — requires full consent.
        db.query(`
            WITH session_referrers AS (
                SELECT DISTINCT ON (session_id)
                    session_id,
                    COALESCE(NULLIF(referrer_host, ''), '(direct)') AS referrer
                FROM analytics_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND session_id IS NOT NULL
                ORDER BY session_id, received_at ASC
            ),
            ref_agg AS (
                SELECT
                    sr.referrer,
                    COUNT(DISTINCT CASE WHEN ce.name = 'form_started' THEN ce.session_id END) AS starters,
                    COUNT(DISTINCT CASE WHEN ce.name = 'form_submit'  THEN ce.session_id END) AS submissions,
                    COUNT(*) FILTER (WHERE ce.name = 'form_error') AS errors
                FROM analytics_custom_events ce
                JOIN session_referrers sr ON sr.session_id = ce.session_id
                WHERE ce.site_id = $1
                  AND ce.received_at >= $2::date
                  AND ce.received_at <  $3::date + interval '1 day'
                  AND ce.name IN ('form_started', 'form_submit', 'form_error')
                GROUP BY sr.referrer
            )
            SELECT
                referrer,
                starters, submissions, errors,
                CASE WHEN starters > 0
                     THEN LEAST(100, ROUND(submissions::numeric / starters * 100, 1))
                     ELSE NULL END AS completion_rate
            FROM ref_agg
            WHERE starters + submissions > 0
            ORDER BY starters DESC, submissions DESC
            LIMIT 30
        `, [siteId, fromDate, toDate]),

        // Form engagement by page: starts + submissions + completion rate per pathname.
        // More useful than submission-only top pages because it surfaces pages where
        // users start but don't finish.
        db.query(`
            WITH pg AS (
                SELECT
                    pathname,
                    COUNT(DISTINCT CASE WHEN name = 'form_started' AND session_id IS NOT NULL THEN session_id END)
                        + COUNT(*) FILTER (WHERE name = 'form_started' AND session_id IS NULL) AS starters,
                    COUNT(DISTINCT CASE WHEN name = 'form_submit'  AND session_id IS NOT NULL THEN session_id END)
                        + COUNT(*) FILTER (WHERE name = 'form_submit'  AND session_id IS NULL) AS submissions,
                    COUNT(*) FILTER (WHERE name = 'form_error') AS errors
                FROM analytics_custom_events
                WHERE site_id = $1
                  AND received_at >= $2::date
                  AND received_at <  $3::date + interval '1 day'
                  AND name IN ('form_started', 'form_submit', 'form_error')
                  AND pathname IS NOT NULL
                GROUP BY pathname
            )
            SELECT
                pathname,
                starters, submissions, errors,
                CASE WHEN starters > 0
                     THEN LEAST(100, ROUND(submissions::numeric / starters * 100, 1))
                     ELSE NULL END AS completion_rate
            FROM pg
            WHERE starters + submissions > 0
            ORDER BY starters DESC, submissions DESC
            LIMIT 30
        `, [siteId, fromDate, toDate]),

    ]).catch(e => {
        console.error('analytics-forms query error:', e.message);
        return Array.from({ length: 15 }, () => ({ rows: [] }));
    });

    const totals = totalsRes.rows[0] || {};
    const submissions = parseInt(totals.submissions, 10) || 0;
    const starters    = parseInt(totals.starters,    10) || 0;

    const sessionSubmissions = parseInt(totals.session_submissions, 10) || 0;
    const sessionStarters    = parseInt(totals.session_starters,    10) || 0;

    return res.status(200).json({
        totals: {
            submissions,
            starters,
            completionRate: starters > 0 ? Math.min(100, Math.round((submissions / starters) * 1000) / 10) : null,
            sessionSubmissions,
            sessionStarters,
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
            page:        r.pathname,
            submissions: parseInt(r.submissions, 10) || 0,
        })),
        deviceBreakdown: deviceRes.rows.map(r => ({
            device:         r.device,
            started:        parseInt(r.started, 10) || 0,
            submitted:      parseInt(r.submitted, 10) || 0,
            errors:         parseInt(r.errors, 10) || 0,
            completionRate: r.completion_rate != null ? parseFloat(r.completion_rate) : null,
            errorRate:      r.error_rate != null ? parseFloat(r.error_rate) : null,
        })),
        abandonment: abandonRes.rows.map(r => ({
            formId:           r.form_id,
            totalStarted:     parseInt(r.total_started, 10) || 0,
            abandonedSessions: parseInt(r.abandoned_sessions, 10) || 0,
            abandonmentRate:  r.abandonment_rate != null ? parseFloat(r.abandonment_rate) : null,
            topDropoutField:  r.top_dropout_field || null,
            avgFieldsTouched: r.avg_fields_touched != null ? parseFloat(r.avg_fields_touched) : null,
            totalFields:      r.total_fields != null ? parseInt(r.total_fields, 10) : null,
        })),
        formErrors: errorsRes.rows.map(r => ({
            formId:      r.form_id,
            formClass:   r.form_class || null,
            errorType:   r.error_type || 'validation',
            field:       r.field || null,
            message:     r.message || null,
            occurrences: parseInt(r.occurrences, 10) || 0,
        })),
        fieldErrors: fieldErrorsRes.rows.map(r => ({
            formId:        r.form_id,
            field:         r.field,
            errorSessions: parseInt(r.error_sessions, 10) || 0,
            totalErrors:   parseInt(r.total_errors, 10) || 0,
            dropoutSessions: parseInt(r.dropout_sessions, 10) || 0,
            blockingRate:  r.blocking_rate != null ? parseFloat(r.blocking_rate) : null,
        })),
        errorRecovery: recoveryRes.rows.map(r => ({
            formId:            r.form_id,
            errorSessions:     parseInt(r.error_sessions, 10) || 0,
            recoveredSessions: parseInt(r.recovered_sessions, 10) || 0,
            recoveryRate:      r.recovery_rate != null ? parseFloat(r.recovery_rate) : null,
        })),
        timeToComplete: timeRes.rows.map(r => ({
            formId:        r.form_id,
            sessions:      parseInt(r.sessions, 10) || 0,
            medianSeconds: r.median_seconds != null ? Number(r.median_seconds) : null,
            avgSeconds:    r.avg_seconds != null ? Number(r.avg_seconds) : null,
        })),
        stepProgress: stepRes.rows.map(r => ({
            formId:         r.form_id,
            step:           r.step,
            reached:        parseInt(r.reached, 10) || 0,
            completed:      parseInt(r.completed, 10) || 0,
            completionRate: r.completion_rate != null ? parseFloat(r.completion_rate) : null,
        })),
        geoBreakdown: geoRes.rows.map(r => ({
            country:        r.country,
            submissions:    parseInt(r.submissions, 10) || 0,
            starters:       parseInt(r.starters, 10) || 0,
            errors:         parseInt(r.errors, 10) || 0,
            completionRate: r.completion_rate != null ? parseFloat(r.completion_rate) : null,
        })),
        acqChannels: acqChannelRes.rows.map(r => ({
            source:         r.source,
            medium:         r.medium,
            campaign:       r.campaign,
            starters:       parseInt(r.starters, 10) || 0,
            submissions:    parseInt(r.submissions, 10) || 0,
            errors:         parseInt(r.errors, 10) || 0,
            completionRate: r.completion_rate != null ? parseFloat(r.completion_rate) : null,
        })),
        acqReferrers: acqReferrerRes.rows.map(r => ({
            referrer:       r.referrer,
            starters:       parseInt(r.starters, 10) || 0,
            submissions:    parseInt(r.submissions, 10) || 0,
            errors:         parseInt(r.errors, 10) || 0,
            completionRate: r.completion_rate != null ? parseFloat(r.completion_rate) : null,
        })),
        acqPages: acqPagesRes.rows.map(r => ({
            pathname:       r.pathname,
            starters:       parseInt(r.starters, 10) || 0,
            submissions:    parseInt(r.submissions, 10) || 0,
            errors:         parseInt(r.errors, 10) || 0,
            completionRate: r.completion_rate != null ? parseFloat(r.completion_rate) : null,
        })),
    });
}
