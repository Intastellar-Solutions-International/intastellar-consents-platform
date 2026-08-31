import { getPool } from "./_db.js";
/**
 * GET /api/ab-test-variant-detail?variantId=<id>
 *
 * Deep-dive stats for a single Page Experiment variant (or control): engagement
 * (average time on page, scroll depth, "engaged session" rate — the same
 * duration>=10s / pageviews>1 / any-click definition api/analytics-report.js's
 * Overview KPI uses instead of a literal bounce rate), EVERY conversion event
 * that actually fired for this variant's sessions (not just the test's one
 * configured goal event — api/ab-test-results.js stays limited to that single
 * metric for the summary table; this endpoint is the "show me everything"
 * drill-down), and top clicked elements.
 *
 * Resolved against the variant's OWN domain (control → the test's domain; a
 * url_split variant → the hostname its redirect_url points at) — same
 * cross-domain reasoning as api/ab-test-results.js, see that file's header
 * comment for why a variant's data can live under a different site_id than
 * the test's own. That domain doesn't need a DEDICATED analytics site key
 * either — falls back to the test's own site (scoped down via page_host)
 * when no dedicated one exists, see the site-resolution block below.
 *
 * A pageview/conversion/click only counts if it happened at-or-after the
 * session's first exposure to this variant, same rule as ab-test-results.js.
 *
 * Requires headers: Authorization: Bearer <token>   Organisation: <org_id>
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

function hostnameFromRedirect(url) {
    try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

function num(v) { return v === null || v === undefined ? null : Number(v); }

// Defensive re-declaration of the tables this endpoint owns the lifecycle
// of (test/variant/assignment) — same duplication convention as
// api/ab-test-results.js. The analytics_* core tables (events, clicks,
// custom_events, event_defs) are assumed to already exist by the time an
// org has both a Page Experiment AND an analytics site to run it against;
// api/a.js owns creating those.
async function ensureTables(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS ab_tests (
            id               BIGSERIAL    PRIMARY KEY,
            organisation_id  INTEGER      NOT NULL,
            domain           TEXT         NOT NULL,
            name             VARCHAR(120) NOT NULL,
            target_path      TEXT         NOT NULL DEFAULT '/',
            status           VARCHAR(16)  NOT NULL DEFAULT 'draft',
            created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
    `).catch(() => {});
    await db.query(`
        CREATE TABLE IF NOT EXISTS ab_test_variants (
            id               BIGSERIAL    PRIMARY KEY,
            test_id          BIGINT       NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
            variant_key      VARCHAR(64)  NOT NULL,
            label            VARCHAR(120),
            is_control       BOOLEAN      NOT NULL DEFAULT false,
            changes          JSONB        NOT NULL DEFAULT '[]',
            created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            UNIQUE (test_id, variant_key)
        )
    `).catch(() => {});
    await db.query(`ALTER TABLE ab_test_variants ADD COLUMN IF NOT EXISTS redirect_url TEXT`).catch(() => {});
    await db.query(`
        CREATE TABLE IF NOT EXISTS ab_test_assignments (
            id          BIGSERIAL   PRIMARY KEY,
            test_id     BIGINT      NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
            variant_id  BIGINT      NOT NULL REFERENCES ab_test_variants(id) ON DELETE CASCADE,
            domain      TEXT        NOT NULL,
            session_id  VARCHAR(64) NOT NULL,
            assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `).catch(() => {});
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const variantId = parseInt(req.query.variantId || "", 10);
    if (!variantId) return res.status(400).json({ error: "variantId is required" });

    const db = getPool();
    await ensureTables(db);

    const { rows: variantRows } = await db.query(
        `SELECT v.id, v.variant_key, v.label, v.is_control, v.redirect_url,
                t.id AS test_id, t.domain AS test_domain
         FROM ab_test_variants v
         JOIN ab_tests t ON t.id = v.test_id
         WHERE v.id = $1 AND t.organisation_id = $2 LIMIT 1`,
        [variantId, orgId]
    ).catch(() => ({ rows: [] }));
    if (!variantRows.length) return res.status(404).json({ error: "Variant not found" });

    const v = variantRows[0];
    const domain = (!v.is_control && v.redirect_url && hostnameFromRedirect(v.redirect_url)) || v.test_domain;

    const base = {
        variantId: v.id, variantKey: v.variant_key, label: v.label, isControl: v.is_control, domain,
    };

    // A url_split variant's redirect-target domain doesn't need a DEDICATED
    // analytics site of its own — one site key can already cover multiple
    // real hostnames (page_host on each row identifies which one), so a
    // domain with no site of its own falls back to the test's own site
    // instead of coming back empty. pageHostFilter narrows the borrowed
    // site's rows down to just this hostname's traffic when that happens —
    // without it, the control's own traffic (same site_id) would bleed into
    // this variant's engagement/click numbers. A dedicated site's rows
    // already belong to the right domain by construction, so no filter is
    // needed there.
    const { rows: siteRows } = await db.query(
        `SELECT id, domain FROM analytics_sites
         WHERE organisation_id = $1 AND domain = ANY($2::text[]) AND active = true`,
        [orgId, [...new Set([domain, v.test_domain])]]
    ).catch(() => ({ rows: [] }));
    const dedicated = siteRows.find(s => s.domain === domain);
    const fallback = siteRows.find(s => s.domain === v.test_domain);
    const siteId = dedicated ? dedicated.id : (fallback ? fallback.id : null);
    const pageHostFilter = (!dedicated && fallback && domain !== v.test_domain) ? domain : null;

    if (!siteId) {
        return res.status(200).json({
            ...base, hasSite: false,
            exposures: 0, uniqueSessions: 0, engagement: null, conversions: [], clicks: null,
        });
    }

    // ── Exposures + engagement + CWV (parallel) ────────────────────────────
    const [{ rows: engagementRows }, { rows: cwvRows }] = await Promise.all([
        db.query(
            `WITH assigned AS (
                SELECT session_id, MIN(assigned_at) AS first_assigned_at, COUNT(*) AS exposure_count
                FROM ab_test_assignments
                WHERE test_id = $1 AND variant_id = $2
                GROUP BY session_id
             ),
             session_stats AS (
                SELECT a.session_id, a.first_assigned_at,
                       MAX(ae.duration_sec) AS max_duration,
                       MAX(ae.scroll_depth) AS max_scroll,
                       COUNT(ae.id) AS pageviews
                FROM assigned a
                LEFT JOIN analytics_events ae
                  ON ae.session_id = a.session_id AND ae.site_id = $3
                  -- 2-minute grace: the analytics entry beacon fires on page load
                  -- before the exposure XHR round-trip completes, so received_at
                  -- is reliably a few hundred ms earlier than assigned_at for the
                  -- same pageview. Without this slack the control's own pageview
                  -- rows are always excluded, producing 0s duration / no scroll.
                  AND ae.received_at >= a.first_assigned_at - INTERVAL '2 minutes'
                  AND ($4::text IS NULL OR ae.page_host = $4)
                GROUP BY a.session_id, a.first_assigned_at
             )
             SELECT
                 (SELECT COALESCE(SUM(exposure_count), 0) FROM assigned)  AS exposures,
                 (SELECT COUNT(*) FROM assigned)                          AS unique_sessions,
                 COUNT(*) FILTER (WHERE pageviews > 0)                    AS sessions_with_pageview,
                 AVG(max_duration) FILTER (WHERE pageviews > 0)           AS avg_duration_sec,
                 AVG(max_scroll) FILTER (WHERE pageviews > 0)             AS avg_scroll_depth,
                 AVG(pageviews) FILTER (WHERE pageviews > 0)              AS avg_pageviews,
                 COUNT(*) FILTER (
                     WHERE max_duration >= 10 OR pageviews > 1 OR EXISTS (
                         SELECT 1 FROM analytics_clicks c
                         WHERE c.site_id = $3 AND c.session_id = session_stats.session_id
                           AND c.received_at >= session_stats.first_assigned_at - INTERVAL '2 minutes'
                           AND ($4::text IS NULL OR c.page_host = $4)
                     )
                 ) AS engaged_sessions
             FROM session_stats`,
            [v.test_id, v.id, siteId, pageHostFilter]
        ).catch(() => ({ rows: [] })),

        db.query(
            `WITH assigned AS (
                SELECT session_id, MIN(assigned_at) AS first_assigned_at
                FROM ab_test_assignments
                WHERE test_id = $1 AND variant_id = $2
                GROUP BY session_id
             )
             SELECT
                 PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY (ce.extra_data->>'lcp')::numeric) AS lcp_p50,
                 PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (ce.extra_data->>'lcp')::numeric) AS lcp_p75,
                 PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY (ce.extra_data->>'lcp')::numeric) AS lcp_p90,
                 PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (ce.extra_data->>'cls')::numeric) AS cls_p75,
                 PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY (ce.extra_data->>'cls')::numeric) AS cls_p90,
                 PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (ce.extra_data->>'inp')::numeric) AS inp_p75,
                 PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY (ce.extra_data->>'inp')::numeric) AS inp_p90,
                 PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (ce.extra_data->>'fcp')::numeric) AS fcp_p75,
                 PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (ce.extra_data->>'ttfb')::numeric) AS ttfb_p75,
                 COUNT(*) AS sample_count,
                 COUNT(*) FILTER (WHERE ce.extra_data->>'rating' = 'good') AS good_count,
                 COUNT(*) FILTER (WHERE ce.extra_data->>'rating' = 'needs-improvement') AS ni_count,
                 COUNT(*) FILTER (WHERE ce.extra_data->>'rating' = 'poor') AS poor_count
             FROM assigned a
             JOIN analytics_custom_events ce
               ON ce.session_id = a.session_id
               AND ce.site_id = $3
               AND ce.name = 'page_perf'
               AND ce.received_at >= a.first_assigned_at
               AND ($4::text IS NULL OR ce.page_host = $4)`,
            [v.test_id, v.id, siteId, pageHostFilter]
        ).catch(() => ({ rows: [] })),
    ]);

    const e = engagementRows[0] || {};
    const exposures = Number(e.exposures || 0);
    const uniqueSessions = Number(e.unique_sessions || 0);
    const engagedSessions = Number(e.engaged_sessions || 0);
    const engagement = {
        sessionsWithPageview: Number(e.sessions_with_pageview || 0),
        avgDurationSec: num(e.avg_duration_sec),
        avgScrollDepth: num(e.avg_scroll_depth),
        avgPageviews: num(e.avg_pageviews),
        engagedSessions,
        engagedRate: uniqueSessions > 0 ? engagedSessions / uniqueSessions : null,
    };

    const cr = cwvRows[0] || {};
    const cwvSample = Number(cr.sample_count || 0);
    const cwvGood = Number(cr.good_count || 0);
    const cwvNi   = Number(cr.ni_count   || 0);
    const cwvPoor = Number(cr.poor_count || 0);
    const cwv = cwvSample === 0 ? null : {
        sampleCount: cwvSample,
        lcp: {
            p50: cr.lcp_p50 != null ? Math.round(Number(cr.lcp_p50)) : null,
            p75: cr.lcp_p75 != null ? Math.round(Number(cr.lcp_p75)) : null,
            p90: cr.lcp_p90 != null ? Math.round(Number(cr.lcp_p90)) : null,
        },
        cls: {
            p75: cr.cls_p75 != null ? Math.round(Number(cr.cls_p75) * 1000) / 1000 : null,
            p90: cr.cls_p90 != null ? Math.round(Number(cr.cls_p90) * 1000) / 1000 : null,
        },
        inp: {
            p75: cr.inp_p75 != null ? Math.round(Number(cr.inp_p75)) : null,
            p90: cr.inp_p90 != null ? Math.round(Number(cr.inp_p90)) : null,
        },
        fcp:  { p75: cr.fcp_p75  != null ? Math.round(Number(cr.fcp_p75))  : null },
        ttfb: { p75: cr.ttfb_p75 != null ? Math.round(Number(cr.ttfb_p75)) : null },
        ratingDist: {
            good: cwvGood, ni: cwvNi, poor: cwvPoor,
            goodPct: Math.round(cwvGood / cwvSample * 100),
            niPct:   Math.round(cwvNi   / cwvSample * 100),
            poorPct: Math.round(cwvPoor / cwvSample * 100),
        },
    };

    // ── Every conversion event that fired (not just the test's goal event) ────
    // Deliberately NOT page_host-filtered even when pageHostFilter is set —
    // a conversion (e.g. a completed booking) can legitimately land on a
    // third host (a payment processor's return URL, a thank-you page on the
    // main domain) later in the same session, and attributing it to this
    // variant by session/timing is more correct than requiring it to have
    // happened on the exact redirect-target host.
    const { rows: convRows } = await db.query(
        `WITH assigned AS (
            SELECT session_id, MIN(assigned_at) AS first_assigned_at
            FROM ab_test_assignments
            WHERE test_id = $1 AND variant_id = $2
            GROUP BY session_id
         )
         SELECT ce.name,
                COUNT(*) AS event_count,
                COUNT(DISTINCT ce.session_id) AS converted_sessions,
                COALESCE(SUM(ce.value_cents), 0) AS value_cents,
                (ARRAY_AGG(ce.currency) FILTER (WHERE ce.currency IS NOT NULL))[1] AS currency
         FROM assigned a
         JOIN analytics_custom_events ce
           ON ce.session_id = a.session_id AND ce.site_id = $3 AND ce.received_at >= a.first_assigned_at
         GROUP BY ce.name
         ORDER BY converted_sessions DESC`,
        [v.test_id, v.id, siteId]
    ).catch(() => ({ rows: [] }));

    const { rows: defRows } = await db.query(
        `SELECT name, kind, label FROM analytics_event_defs WHERE site_id = $1`,
        [siteId]
    ).catch(() => ({ rows: [] }));
    const defByName = {};
    for (const d of defRows) defByName[d.name] = d;

    const conversions = convRows.map(r => ({
        name: r.name,
        label: defByName[r.name]?.label || r.name,
        kind: defByName[r.name]?.kind || "custom",
        count: Number(r.event_count || 0),
        convertedSessions: Number(r.converted_sessions || 0),
        conversionRate: uniqueSessions > 0 ? Number(r.converted_sessions || 0) / uniqueSessions : null,
        valueCents: Number(r.value_cents || 0),
        currency: r.currency || null,
    }));

    // ── Top clicked elements ───────────────────────────────────────────────
    const { rows: clickTotalRows } = await db.query(
        `WITH assigned AS (
            SELECT session_id, MIN(assigned_at) AS first_assigned_at
            FROM ab_test_assignments
            WHERE test_id = $1 AND variant_id = $2
            GROUP BY session_id
         )
         SELECT COUNT(*) AS clicks, COUNT(DISTINCT c.session_id) AS sessions
         FROM assigned a
         JOIN analytics_clicks c
           ON c.session_id = a.session_id AND c.site_id = $3
           AND c.received_at >= a.first_assigned_at - INTERVAL '2 minutes'
           AND ($4::text IS NULL OR c.page_host = $4)`,
        [v.test_id, v.id, siteId, pageHostFilter]
    ).catch(() => ({ rows: [{}] }));

    const { rows: elementRows } = await db.query(
        `WITH assigned AS (
            SELECT session_id, MIN(assigned_at) AS first_assigned_at
            FROM ab_test_assignments
            WHERE test_id = $1 AND variant_id = $2
            GROUP BY session_id
         )
         SELECT
             c.target_tag, c.target_id, c.target_class, c.target_text,
             COUNT(*) AS n,
             ROUND(AVG(c.y_pct))::int AS avg_y_pct,
             MODE() WITHIN GROUP (ORDER BY c.pathname) AS top_page
         FROM assigned a
         JOIN analytics_clicks c
           ON c.session_id = a.session_id AND c.site_id = $3
           AND c.received_at >= a.first_assigned_at - INTERVAL '2 minutes'
           AND ($4::text IS NULL OR c.page_host = $4)
         GROUP BY c.target_tag, c.target_id, c.target_class, c.target_text
         ORDER BY n DESC LIMIT 15`,
        [v.test_id, v.id, siteId, pageHostFilter]
    ).catch(() => ({ rows: [] }));

    // ── Top visited pages for this variant's sessions ──────────────────────
    const { rows: pageRows } = await db.query(
        `WITH assigned AS (
            SELECT session_id, MIN(assigned_at) AS first_assigned_at
            FROM ab_test_assignments
            WHERE test_id = $1 AND variant_id = $2
            GROUP BY session_id
         )
         SELECT ae.pathname, COUNT(*) AS pageviews, COUNT(DISTINCT ae.session_id) AS sessions
         FROM assigned a
         JOIN analytics_events ae
           ON ae.session_id = a.session_id AND ae.site_id = $3
           AND ae.received_at >= a.first_assigned_at - INTERVAL '2 minutes'
           AND ($4::text IS NULL OR ae.page_host = $4)
         GROUP BY ae.pathname
         ORDER BY pageviews DESC
         LIMIT 10`,
        [v.test_id, v.id, siteId, pageHostFilter]
    ).catch(() => ({ rows: [] }));

    const clickTotals = clickTotalRows[0] || {};
    const clicks = {
        total: Number(clickTotals.clicks || 0),
        sessions: Number(clickTotals.sessions || 0),
        topElements: elementRows.map(r => ({
            tag: r.target_tag, id: r.target_id, className: r.target_class,
            text: r.target_text, n: Number(r.n || 0),
            avgYPct: r.avg_y_pct != null ? Number(r.avg_y_pct) : null,
            topPage: r.top_page || null,
        })),
    };

    const topPages = pageRows.map(r => ({
        pathname: r.pathname,
        pageviews: Number(r.pageviews || 0),
        sessions: Number(r.sessions || 0),
    }));

    return res.status(200).json({
        ...base, hasSite: true,
        exposures, uniqueSessions, engagement, cwv, conversions, clicks, topPages,
    });
}
