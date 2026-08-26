/**
 * GET /api/ab-test-results?testId=<id>
 *
 * Per-variant results for a Page Experiment: exposures, unique sessions,
 * and — only if the test has a goal event set — conversions/conversionRate
 * against that event, reusing the existing conversion-tracking pipeline
 * (analytics_custom_events, the same table window.intaAnalytics.track()
 * writes to) rather than building a parallel one.
 *
 * A conversion only counts if it happened at-or-after the session's first
 * exposure to that variant — pre-existing behavior from before a visitor
 * ever saw a variant shouldn't be attributed to it.
 *
 * Cross-domain (url_split) measurement: a url_split variant redirects
 * visitors to whatever domain its redirect_url points at, which can be a
 * different domain (or subdomain) than the test's own — so its conversions
 * live under THAT domain's analytics_sites/site_id, not the test domain's.
 * Each variant's exposures/conversions/daily-series are therefore looked up
 * against its own resolved domain rather than one shared site_id for the
 * whole test (see variantMeta below). This only surfaces data for a variant
 * once the session id is actually shared across the redirect — same-apex
 * subdomains inherit it via the Domain-scoped session cookie (api/a.js's
 * getSid()/rootDomain()); unrelated domains have no shared cookie and won't
 * show conversions here regardless of this endpoint's own correctness.
 *
 * Also returns, when a goal event is set:
 *  - expectedConversionRate: Bayesian posterior mean (Beta(1,1) prior) —
 *    regularises small-sample rates toward 50% instead of reporting a raw
 *    ratio that swings wildly at low volume.
 *  - probabilityToBeBetter / expectedImprovement: Monte-Carlo comparison of
 *    each variant's Beta posterior against control's (see simulateVsControl
 *    below) — same idea as GrowthBook's Bayesian engine, just computed
 *    inline rather than via a stats library, since the shape parameters
 *    here are always >=1 (conversions+1, failures+1) so a plain
 *    Marsaglia-Tsang gamma sampler is all that's needed.
 *  - dailySeries: cumulative sessions/conversions per variant per day
 *    (bucketed by day of first exposure, not day of conversion) so the
 *    Reports UI can chart a conversion-rate trend over the test's lifetime.
 *
 * Requires headers: Authorization: Bearer <token>   Organisation: <org_id>
 */

import pkg from "pg";
const { Pool } = pkg;

// Below this many sessions in a variant, a Bayesian posterior is still
// mostly reflecting the uniform prior rather than real signal — the UI
// shows a "collecting data" state instead of probability/improvement
// numbers until every variant clears this bar. Not a formal power
// calculation, just a common rule-of-thumb minimum.
const MIN_SESSIONS_PER_VARIANT = 100;

// Monte-Carlo draws per variant-vs-control comparison. Cheap enough (each
// draw is two gamma samples, each usually 1-2 rejection-loop iterations) to
// run well within a serverless request even with several variants.
const SIMULATIONS = 10000;

function gaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Marsaglia & Tsang (2000). Only valid for shape >= 1 — guaranteed here
// since callers always pass (successes+1) / (failures+1) from a Beta(1,1)
// prior, both of which are >= 1.
function sampleGamma(shape) {
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
        let x, v;
        do {
            x = gaussian();
            v = 1 + c * x;
        } while (v <= 0);
        v = v * v * v;
        const x2 = x * x;
        const u = Math.random();
        if (u < 1 - 0.0331 * x2 * x2) return d * v;
        if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) return d * v;
    }
}

function sampleBeta(alpha, beta) {
    const x = sampleGamma(alpha);
    const y = sampleGamma(beta);
    return x / (x + y);
}

// Probability the variant's true conversion rate beats control's, plus the
// median simulated relative uplift — median rather than mean because the
// (v-c)/c ratio has a heavy right tail whenever a simulated control draw
// lands near zero, which would otherwise dominate an average.
function simulateVsControl(controlConversions, controlSessions, variantConversions, variantSessions) {
    const ac = controlConversions + 1, bc = (controlSessions - controlConversions) + 1;
    const av = variantConversions + 1, bv = (variantSessions - variantConversions) + 1;
    let wins = 0;
    const uplifts = new Array(SIMULATIONS);
    for (let i = 0; i < SIMULATIONS; i++) {
        const c = sampleBeta(ac, bc);
        const v = sampleBeta(av, bv);
        if (v > c) wins++;
        uplifts[i] = c > 1e-9 ? (v - c) / c : 0;
    }
    uplifts.sort((a, b) => a - b);
    return {
        probabilityToBeBetter: wins / SIMULATIONS,
        expectedImprovement: uplifts[Math.floor(SIMULATIONS / 2)],
    };
}

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

// Defensive re-declaration of tables this file queries but doesn't own —
// same duplication convention as api/ab-test-proxy.js / api/a.js.
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
    await db.query(`ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS goal_event_name VARCHAR(64)`).catch(() => {});
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

    const testId = parseInt(req.query.testId || "", 10);
    if (!testId) return res.status(400).json({ error: "testId is required" });

    const db = getPool();
    await ensureTables(db);

    const { rows: testRows } = await db.query(
        `SELECT id, domain, goal_event_name, target_path, test_type FROM ab_tests WHERE id = $1 AND organisation_id = $2 LIMIT 1`,
        [testId, orgId]
    ).catch(() => ({ rows: [] }));
    if (!testRows.length) return res.status(404).json({ error: "Test not found" });

    const test = testRows[0];
    const goalEventName = test.goal_event_name || null;

    // Base variant list, fetched up front — each variant's OWN domain has to
    // be resolved (see header comment) before exposures/conversions can be
    // queried, since a url_split variant's data may live under a different
    // site_id than the test's own domain.
    const { rows: variantRows } = await db.query(
        `SELECT id, variant_key, label, is_control, redirect_url
         FROM ab_test_variants WHERE test_id = $1 ORDER BY is_control DESC, id ASC`,
        [testId]
    ).catch(() => ({ rows: [] }));

    function hostnameFromRedirect(url) {
        try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
    }

    const variantDomains = variantRows.map(v =>
        (!v.is_control && v.redirect_url && hostnameFromRedirect(v.redirect_url)) || test.domain
    );
    const uniqueDomains = [...new Set([test.domain, ...variantDomains])];

    // A Page Experiment doesn't require a first-party analytics site key to
    // exist (see api/ab-tests.js's own doc comment). A url_split variant's
    // redirect-target domain doesn't need a DEDICATED site key either — one
    // site key can already cover multiple real hostnames (see page_host on
    // analytics_events/analytics_custom_events/analytics_clicks), so a
    // domain with no site of its own falls back to the test's own site
    // instead of coming back empty. Only a domain with neither a dedicated
    // site nor the test's own site available has genuinely no data yet.
    const { rows: siteRows } = await db.query(
        `SELECT id, domain FROM analytics_sites WHERE organisation_id = $1 AND domain = ANY($2::text[]) AND active = true`,
        [orgId, uniqueDomains]
    ).catch(() => ({ rows: [] }));
    const siteIdByDomain = {};
    for (const s of siteRows) siteIdByDomain[s.domain] = s.id;
    const testSiteId = siteIdByDomain[test.domain] || null;

    const variantMeta = variantRows.map((v, i) => {
        const vDomain = variantDomains[i];
        const hasDedicated = !!siteIdByDomain[vDomain];
        const siteId = siteIdByDomain[vDomain] || testSiteId;
        const pageHostFilter = (!hasDedicated && testSiteId && vDomain !== test.domain) ? vDomain : null;
        return { row: v, domain: vDomain, siteId, pageHostFilter };
    });

    // ── Per-variant exposures + conversions ─────────────────────────────────
    // One query per variant (rather than one combined query across all
    // variants) since each needs its own site_id — the variant count on a
    // real test is always small (a handful), so this stays cheap.
    const variants = [];
    for (const { row: v, domain: variantDomain, siteId: variantSiteId, pageHostFilter } of variantMeta) {
        const hasGoal = !!goalEventName && !!variantSiteId;
        const { rows: statRows } = await db.query(
            `WITH exposures AS (
                SELECT session_id, MIN(assigned_at) AS first_assigned_at, COUNT(*) AS exposure_count
                FROM ab_test_assignments
                WHERE test_id = $1 AND variant_id = $2
                GROUP BY session_id
             )
             SELECT
                 COALESCE(SUM(exposure_count), 0) AS exposures,
                 COUNT(*) AS unique_sessions,
                 COUNT(*) FILTER (
                     WHERE $3::text IS NOT NULL AND $4::text IS NOT NULL AND EXISTS (
                         SELECT 1 FROM analytics_custom_events ce
                         WHERE ce.site_id = $4 AND ce.session_id = exposures.session_id
                           AND ce.name = $3 AND ce.received_at >= exposures.first_assigned_at
                     )
                 ) AS converted_sessions
             FROM exposures`,
            [testId, v.id, goalEventName, variantSiteId]
        ).catch(() => ({ rows: [] }));

        const stats = statRows[0] || { exposures: 0, unique_sessions: 0, converted_sessions: 0 };
        const uniqueSessions = Number(stats.unique_sessions || 0);
        const conversions = hasGoal ? Number(stats.converted_sessions || 0) : null;
        const conversionRate = !hasGoal || uniqueSessions === 0 ? null : conversions / uniqueSessions;

        // ── Per-variant engagement (bounce rate, avg time, scroll, engaged rate) ─
        let engagement = null;
        if (variantSiteId) {
            const { rows: engRows } = await db.query(
                `WITH assigned AS (
                    SELECT session_id, MIN(assigned_at) AS first_assigned_at
                    FROM ab_test_assignments
                    WHERE test_id = $1 AND variant_id = $2
                    GROUP BY session_id
                 ),
                 ss AS (
                    SELECT a.session_id, a.first_assigned_at,
                           COUNT(ae.id) AS pageviews,
                           MAX(ae.duration_sec) AS max_duration,
                           MAX(ae.scroll_depth) AS max_scroll
                    FROM assigned a
                    LEFT JOIN analytics_events ae
                      ON ae.session_id = a.session_id AND ae.site_id = $3
                      AND ae.received_at >= a.first_assigned_at - INTERVAL '2 minutes'
                      AND ($4::text IS NULL OR ae.page_host = $4)
                    GROUP BY a.session_id, a.first_assigned_at
                 )
                 SELECT
                     COUNT(*) FILTER (WHERE pageviews > 0) AS sessions_with_pv,
                     AVG(max_duration) FILTER (WHERE pageviews > 0) AS avg_duration_sec,
                     AVG(max_scroll) FILTER (WHERE pageviews > 0) AS avg_scroll_depth,
                     COUNT(*) FILTER (
                         WHERE pageviews > 0 AND (
                             max_duration >= 10 OR pageviews > 1
                             OR EXISTS (
                                 SELECT 1 FROM analytics_clicks c
                                 WHERE c.session_id = ss.session_id AND c.site_id = $3
                                   AND c.received_at >= ss.first_assigned_at - INTERVAL '2 minutes'
                                   AND ($4::text IS NULL OR c.page_host = $4)
                             )
                         )
                     ) AS engaged_with_pv
                 FROM ss`,
                [testId, v.id, variantSiteId, pageHostFilter]
            ).catch(() => ({ rows: [] }));
            const er = engRows[0] || {};
            const sessionsPv = Number(er.sessions_with_pv || 0);
            const engagedPv = Math.min(Number(er.engaged_with_pv || 0), sessionsPv);
            engagement = {
                sessionsWithPv: sessionsPv,
                bounceRate: sessionsPv > 0 ? (sessionsPv - engagedPv) / sessionsPv : null,
                engagedRate: uniqueSessions > 0 ? engagedPv / uniqueSessions : null,
                avgDurationSec: er.avg_duration_sec != null ? Number(er.avg_duration_sec) : null,
                avgScrollDepth: er.avg_scroll_depth != null ? Number(er.avg_scroll_depth) : null,
            };
        }

        variants.push({
            variantId: v.id, variantKey: v.variant_key, label: v.label, isControl: v.is_control,
            domain: variantDomain, redirectUrl: v.redirect_url || null, hasSite: !!variantSiteId,
            exposures: Number(stats.exposures || 0), uniqueSessions, conversions, conversionRate,
            expectedConversionRate: null, expectedImprovement: null, probabilityToBeBetter: null,
            engagement,
        });
    }

    // "Enough data" now also requires every variant to actually have a
    // measurable conversion rate — a url_split variant redirecting to a
    // domain with no analytics site registered can't clear this regardless
    // of session volume, which is the point: it surfaces as missing data
    // instead of a silently wrong/incomplete comparison.
    const hasEnoughData = !!goalEventName && variants.length > 0 &&
        variants.every(v => v.uniqueSessions >= MIN_SESSIONS_PER_VARIANT && v.conversions !== null);

    const control = variants.find(v => v.isControl);
    if (goalEventName && control && control.conversions !== null) {
        for (const v of variants) {
            if (v.conversions === null) continue;
            // Beta(1,1) posterior mean — regularises toward 50% at low volume
            // instead of reporting a raw ratio that swings wildly early on.
            v.expectedConversionRate = (v.conversions + 1) / (v.uniqueSessions + 2);
            if (v.isControl) continue;
            const { probabilityToBeBetter, expectedImprovement } = simulateVsControl(
                control.conversions, control.uniqueSessions, v.conversions, v.uniqueSessions
            );
            v.probabilityToBeBetter = probabilityToBeBetter;
            v.expectedImprovement = expectedImprovement;
        }
    }

    // ── Daily series (cumulative sessions/conversions per variant per day) ────
    // Bucketed by the day of each session's FIRST exposure — a conversion is
    // credited to that day regardless of which day it actually happened on,
    // matching the "cumulative" framing (as of today, how did sessions first
    // exposed on day X eventually convert), not a day-by-day funnel. Run per
    // variant for the same cross-domain reason as the stats query above.
    const variantIds = variants.map(v => String(v.variantId));
    const byVariantDay = {};
    for (const id of variantIds) byVariantDay[id] = {};
    let minDay = null, maxDay = null;
    for (const { row: v, siteId: variantSiteId } of variantMeta) {
        const { rows: dailyRows } = await db.query(
            `WITH first_exposures AS (
                SELECT session_id, MIN(assigned_at) AS first_assigned_at
                FROM ab_test_assignments
                WHERE test_id = $1 AND variant_id = $2
                GROUP BY session_id
             )
             SELECT
                 DATE(first_assigned_at) AS day,
                 COUNT(*) AS sessions,
                 COUNT(*) FILTER (WHERE $3::text IS NOT NULL AND $4::text IS NOT NULL AND EXISTS (
                     SELECT 1 FROM analytics_custom_events ce
                     WHERE ce.site_id = $4 AND ce.session_id = first_exposures.session_id
                       AND ce.name = $3 AND ce.received_at >= first_exposures.first_assigned_at
                 )) AS conversions
             FROM first_exposures
             GROUP BY day`,
            [testId, v.id, goalEventName, variantSiteId]
        ).catch(() => ({ rows: [] }));

        const id = String(v.id);
        for (const d of dailyRows) {
            const day = d.day.toISOString().slice(0, 10);
            byVariantDay[id][day] = { sessions: Number(d.sessions), conversions: Number(d.conversions) };
            if (!minDay || day < minDay) minDay = day;
            if (!maxDay || day > maxDay) maxDay = day;
        }
    }

    const dailySeries = [];
    if (minDay && maxDay) {
        const cumulative = {};
        for (const id of variantIds) cumulative[id] = { sessions: 0, conversions: 0 };
        const cursor = new Date(minDay + "T00:00:00Z");
        const end = new Date(maxDay + "T00:00:00Z");
        // Safety cap — a test running for years shouldn't blow up the response;
        // the chart only needs the most recent stretch anyway.
        for (let i = 0; cursor <= end && i < 400; i++) {
            const day = cursor.toISOString().slice(0, 10);
            const variantsForDay = {};
            for (const id of variantIds) {
                const today = byVariantDay[id][day] || { sessions: 0, conversions: 0 };
                cumulative[id].sessions += today.sessions;
                cumulative[id].conversions += today.conversions;
                variantsForDay[id] = {
                    sessions: today.sessions,
                    cumulativeSessions: cumulative[id].sessions,
                    conversions: today.conversions,
                    cumulativeConversions: cumulative[id].conversions,
                    cumulativeConversionRate: cumulative[id].sessions > 0 ? cumulative[id].conversions / cumulative[id].sessions : null,
                };
            }
            dailySeries.push({ date: day, variants: variantsForDay });
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
    }

    return res.status(200).json({
        test: { id: test.id, domain: test.domain, goalEventName, targetPath: test.target_path, testType: test.test_type || "visual" },
        minSessionsPerVariant: MIN_SESSIONS_PER_VARIANT,
        hasEnoughData,
        dateRange: minDay && maxDay ? { from: minDay, to: maxDay } : null,
        variants,
        dailySeries,
    });
}
