/**
 * GET /api/gsc-index-coverage?domain=<domain>[&verdict=PASS|FAIL|PARTIAL|NEUTRAL&limit=&cursor=]
 *
 * Reads the full-site indexing coverage data accumulated by
 * api/cron-gsc-index-coverage.js (sitemap-discovered URLs, each inspected
 * on a rolling schedule — see that cron's doc comment for why this can't
 * be a live fetch). Unlike api/ad-daily-data.js's indexingStatus field
 * (fetched live, capped at the top 10 pages by clicks, for instant feedback
 * on a brand-new connection), this covers every URL discovered in the
 * site's sitemaps and persists across dashboard loads.
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

const VALID_VERDICTS = new Set(["PASS", "FAIL", "PARTIAL", "NEUTRAL"]);

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

    const db = getPool();

    // Confirm the connection exists (also doubles as "table may not exist
    // yet" guard — the cron creates it on first run, same pattern as
    // ad_daily_data/analytics_recordings elsewhere in this app).
    const { rows: connRows } = await db.query(
        `SELECT account_id FROM ad_platform_connections
         WHERE organisation_id = $1 AND domain = $2 AND platform = 'google_search_console'
           AND account_id IS NOT NULL LIMIT 1`,
        [orgId, domain]
    ).catch(() => ({ rows: [] }));
    if (!connRows.length) return res.status(200).json({ connected: false });

    const summaryRes = await db.query(
        `SELECT
            COUNT(*)                                                      AS total,
            COUNT(*) FILTER (WHERE verdict = 'PASS')                      AS indexed,
            COUNT(*) FILTER (WHERE verdict = 'FAIL')                      AS not_indexed,
            COUNT(*) FILTER (WHERE verdict IN ('PARTIAL','NEUTRAL'))      AS neutral,
            COUNT(*) FILTER (WHERE checked_at IS NULL)                    AS pending
         FROM gsc_index_status
         WHERE organisation_id = $1 AND domain = $2`,
        [orgId, domain]
    ).catch(() => ({ rows: [{}] }));
    const s = summaryRes.rows[0] || {};

    const verdict = VALID_VERDICTS.has(req.query.verdict) ? req.query.verdict : null;
    const limit   = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const cursor  = req.query.cursor ? (req.query.cursor || "").trim() : null;

    const params = [orgId, domain];
    let where = `organisation_id = $1 AND domain = $2`;
    if (verdict) { params.push(verdict); where += ` AND verdict = $${params.length}`; }
    if (cursor)  { params.push(cursor);  where += ` AND url > $${params.length}`; }
    params.push(limit);

    const { rows } = await db.query(
        `SELECT url, verdict, coverage_state, indexing_state, robots_txt_state,
                last_crawl_time, google_canonical, user_canonical, checked_at
         FROM gsc_index_status
         WHERE ${where}
         ORDER BY url ASC
         LIMIT $${params.length}`,
        params
    ).catch(() => ({ rows: [] }));

    return res.status(200).json({
        connected: true,
        domain,
        summary: {
            total:      Number(s.total      || 0),
            indexed:    Number(s.indexed    || 0),
            notIndexed: Number(s.not_indexed|| 0),
            neutral:    Number(s.neutral    || 0),
            pending:    Number(s.pending    || 0),
        },
        rows: rows.map(r => ({
            url:             r.url,
            verdict:         r.verdict,
            coverageState:   r.coverage_state,
            indexingState:   r.indexing_state,
            robotsTxtState:  r.robots_txt_state,
            lastCrawlTime:   r.last_crawl_time,
            googleCanonical: r.google_canonical,
            userCanonical:   r.user_canonical,
            checkedAt:       r.checked_at,
        })),
        nextCursor: rows.length === limit ? rows[rows.length - 1].url : null,
    });
}
