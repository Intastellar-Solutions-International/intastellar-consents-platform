/**
 * GET /api/analytics-cohorts?domain=<domain>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>&granularity=week
 *
 * Weekly cohort retention — groups sessions by the ISO week they first appeared,
 * then counts how many returned in each subsequent week.
 * Requires Authorization: Bearer <token>   Organisation: <org_id>
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
            connectionTimeoutMillis: 20000,
            idleTimeoutMillis: 30000,
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

function safeDate(str, fallback) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? fallback : d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
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
    const ninetyAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const fromDate = safeDate(req.query.from, ninetyAgo);
    const toDate   = safeDate(req.query.to, today);
    const toDateExclusive = new Date(new Date(toDate).getTime() + 86400000).toISOString().slice(0, 10);

    const db = getPool();

    const { rows: siteRows } = await db.query(
        `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1`,
        [orgId, domain]
    ).catch(() => ({ rows: [] }));

    if (!siteRows.length) return res.status(200).json({ noSiteKey: true });

    const siteId = siteRows[0].id;

    try {
        // Build a weekly cohort retention matrix.
        //
        // Step 1 — for every session, find the week it first appeared (cohort week)
        //           and the week of every subsequent appearance.
        // Step 2 — for each (cohort_week, week_offset) pair, count distinct sessions
        //           that appeared. Week offset 0 = the cohort week itself (always 100%),
        //           offset 1 = returned the following week, etc.
        //
        // Sessions are identified by session_id (full-consent only, since minimal-
        // consent events carry no session_id). The consent DB lives on a different
        // server and is not consulted here; consent_level is captured in analytics_events.
        const { rows } = await db.query(`
            WITH session_first AS (
                SELECT
                    session_id,
                    DATE_TRUNC('week', MIN(received_at) AT TIME ZONE 'UTC') AS cohort_week
                FROM analytics_events
                WHERE site_id = $1 AND consent_level = 'full'
                  AND session_id IS NOT NULL
                  AND received_at >= $2 AND received_at < $3
                GROUP BY session_id
            ),
            session_weeks AS (
                SELECT
                    ae.session_id,
                    DATE_TRUNC('week', ae.received_at AT TIME ZONE 'UTC') AS activity_week
                FROM analytics_events ae
                WHERE ae.site_id = $1 AND ae.consent_level = 'full'
                  AND ae.session_id IS NOT NULL
                  AND ae.received_at >= $2 AND ae.received_at < $3
                GROUP BY ae.session_id, DATE_TRUNC('week', ae.received_at AT TIME ZONE 'UTC')
            )
            SELECT
                TO_CHAR(sf.cohort_week, 'YYYY-MM-DD')  AS cohort_week,
                EXTRACT(WEEK FROM sf.cohort_week)::int  AS cohort_iso_week,
                EXTRACT(YEAR FROM sf.cohort_week)::int  AS cohort_year,
                (EXTRACT(EPOCH FROM (sw.activity_week - sf.cohort_week)) / 604800)::int AS week_offset,
                COUNT(DISTINCT sf.session_id) AS sessions
            FROM session_first sf
            JOIN session_weeks sw ON sw.session_id = sf.session_id
            GROUP BY sf.cohort_week, sw.activity_week
            ORDER BY sf.cohort_week, week_offset`,
            [siteId, fromDate, toDateExclusive]
        );

        // Pivot into a map of cohort_week -> [{ offset, sessions }]
        const cohortMap = new Map();
        for (const r of rows) {
            const key = r.cohort_week;
            if (!cohortMap.has(key)) cohortMap.set(key, { cohortWeek: key, cohortSize: 0, weeks: [] });
            const entry = cohortMap.get(key);
            if (r.week_offset === 0) entry.cohortSize = Number(r.sessions);
            entry.weeks.push({ offset: Number(r.week_offset), sessions: Number(r.sessions) });
        }

        const cohorts = Array.from(cohortMap.values())
            .sort((a, b) => a.cohortWeek.localeCompare(b.cohortWeek));

        return res.status(200).json({ cohorts, from: fromDate, to: toDate });
    } catch (err) {
        console.error("[analytics-cohorts] error:", err.message);
        return res.status(500).json({ error: "Internal error", message: err.message });
    }
}
