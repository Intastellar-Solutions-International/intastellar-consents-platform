/**
 * GET /api/analytics-user-flow?domain=<domain>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>
 *
 * Multi-column page-transition ("user flow") data for a Sankey-style
 * diagram: column 1 is acquisition channel (source/medium), columns 2-5 are
 * the next FLOW_DEPTH pageviews in session order. No existing query in this
 * codebase reconstructs an ordered per-session page sequence — this is that,
 * via a self-join on ROW_NUMBER()-assigned step numbers (equivalent to
 * LAG(), reads clearer alongside the ROW_NUMBER() idiom analytics-report.js
 * already uses for per-page bounce/exit rate).
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
            max: 3,
            connectionTimeoutMillis: 5000,
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

// Tuning knobs — depth of page-to-page columns after the channel column, and
// how many branches each column keeps before bucketing the rest into
// "(other)". Both bound the query/diagram regardless of site size.
const FLOW_DEPTH = 4;
const TOP_N_PER_COLUMN = 8;

const JUNK_PATH_CLAUSE = `
    pathname !~* '^/api/'
    AND pathname !~* '\\.(js|css|json|xml|txt|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|pdf)$'
`;

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

// Capping/bucketing done in JS rather than a deeply nested SQL CASE — the
// data volume per depth is small (a handful of distinct pathnames/channels
// per site, not millions of rows), and this is far more legible than the
// equivalent SQL window-function version while producing identical results.
function capEdges(rawEdges) {
    const byGroup = new Map(); // `${depth}|${from}` -> [{to, sessions}]
    for (const e of rawEdges) {
        const key = `${e.depth}|${e.from_node}`;
        if (!byGroup.has(key)) byGroup.set(key, []);
        byGroup.get(key).push(e);
    }
    const out = [];
    for (const edges of byGroup.values()) {
        const { depth, from_node: from } = edges[0];
        edges.sort((a, b) => b.sessions - a.sessions);
        const top = edges.slice(0, TOP_N_PER_COLUMN);
        const rest = edges.slice(TOP_N_PER_COLUMN);
        for (const e of top) out.push({ depth, from: e.from_node, to: e.to_node, sessions: e.sessions });
        if (rest.length) {
            const restSum = rest.reduce((s, e) => s + e.sessions, 0);
            out.push({ depth, from, to: "(other)", sessions: restSum });
        }
    }
    return out;
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

    const today     = new Date().toISOString().slice(0, 10);
    const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const fromDate  = safeDate(req.query.from, thirtyAgo);
    const toDate    = safeDate(req.query.to,   today);
    const toDateExclusive = new Date(new Date(toDate).getTime() + 86400000).toISOString().slice(0, 10);

    const db = getPool();

    const { rows: siteRows } = await db.query(
        `SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1`,
        [orgId, domain]
    ).catch(() => ({ rows: [] }));

    if (!siteRows.length) return res.status(200).json({ noSiteKey: true });
    const siteId = siteRows[0].id;

    const params = [siteId, fromDate, toDateExclusive];

    // Raw (uncapped) edges: depth 0 = channel -> first page, depth 1..FLOW_DEPTH
    // = page[N] -> page[N+1]. channel/ordered_views are re-derived in both
    // this query and the node-totals query below (CTEs don't survive across
    // statements) — a modest, acceptable duplication for an admin-triggered,
    // on-demand view rather than a high-traffic path.
    const edgesSql = `
        WITH channel AS (
            SELECT DISTINCT ON (session_id)
                session_id,
                COALESCE(utm_source, '(direct)') || ' / ' ||
                  COALESCE(utm_medium, CASE WHEN referrer_host IS NOT NULL THEN 'referral' ELSE '(none)' END) AS channel_label
            FROM analytics_events
            WHERE site_id = $1 AND session_id IS NOT NULL
              AND received_at >= $2 AND received_at < $3
            ORDER BY session_id, received_at ASC
        ),
        ordered_views AS (
            SELECT session_id, pathname,
                   ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY received_at ASC) AS step_no
            FROM analytics_events
            WHERE site_id = $1 AND session_id IS NOT NULL
              AND received_at >= $2 AND received_at < $3
              AND ${JUNK_PATH_CLAUSE}
        )
        SELECT 0 AS depth, ch.channel_label AS from_node, ov.pathname AS to_node,
               COUNT(DISTINCT ov.session_id) AS sessions
        FROM channel ch
        JOIN ordered_views ov ON ov.session_id = ch.session_id AND ov.step_no = 1
        GROUP BY ch.channel_label, ov.pathname

        UNION ALL

        SELECT a.step_no AS depth, a.pathname AS from_node, b.pathname AS to_node,
               COUNT(DISTINCT a.session_id) AS sessions
        FROM ordered_views a
        JOIN ordered_views b ON b.session_id = a.session_id AND b.step_no = a.step_no + 1
        WHERE a.step_no BETWEEN 1 AND ${FLOW_DEPTH}
        GROUP BY a.step_no, a.pathname, b.pathname`;

    // Node population per depth — how many sessions actually reached that
    // node at all, regardless of what they did next. Needed to compute
    // "exited here" (population minus sessions that continued to depth+1),
    // which must NOT be confused with "went to a page outside the top-N"
    // (that's the "(other)" bucket in capEdges).
    const nodesSql = `
        WITH channel AS (
            SELECT DISTINCT ON (session_id)
                session_id,
                COALESCE(utm_source, '(direct)') || ' / ' ||
                  COALESCE(utm_medium, CASE WHEN referrer_host IS NOT NULL THEN 'referral' ELSE '(none)' END) AS channel_label
            FROM analytics_events
            WHERE site_id = $1 AND session_id IS NOT NULL
              AND received_at >= $2 AND received_at < $3
            ORDER BY session_id, received_at ASC
        ),
        ordered_views AS (
            SELECT session_id, pathname,
                   ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY received_at ASC) AS step_no
            FROM analytics_events
            WHERE site_id = $1 AND session_id IS NOT NULL
              AND received_at >= $2 AND received_at < $3
              AND ${JUNK_PATH_CLAUSE}
        )
        SELECT 0 AS depth, channel_label AS node, COUNT(DISTINCT session_id) AS sessions
        FROM channel GROUP BY channel_label

        UNION ALL

        SELECT step_no AS depth, pathname AS node, COUNT(DISTINCT session_id) AS sessions
        FROM ordered_views
        WHERE step_no BETWEEN 1 AND ${FLOW_DEPTH}
        GROUP BY step_no, pathname`;

    const [edgesRes, nodesRes] = await Promise.all([
        db.query(edgesSql, params).catch(() => ({ rows: [] })),
        db.query(nodesSql, params).catch(() => ({ rows: [] })),
    ]);

    const rawEdges = edgesRes.rows.map(r => ({
        depth: Number(r.depth), from_node: r.from_node, to_node: r.to_node, sessions: Number(r.sessions),
    }));
    const cappedEdges = capEdges(rawEdges);

    // Exit counts: node population at depth d minus the (uncapped) sum of
    // sessions that continued on to depth d+1 from that same node.
    const outgoingByNode = new Map(); // `${depth}|${node}` -> sum of sessions leaving from here
    for (const e of rawEdges) {
        const key = `${e.depth}|${e.from_node}`;
        outgoingByNode.set(key, (outgoingByNode.get(key) || 0) + e.sessions);
    }
    const exitCounts = nodesRes.rows
        .map(r => {
            const depth = Number(r.depth);
            const node = r.node;
            const population = Number(r.sessions);
            const outgoing = outgoingByNode.get(`${depth}|${node}`) || 0;
            return { depth, node, sessions: Math.max(0, population - outgoing) };
        })
        .filter(r => r.sessions > 0);

    return res.status(200).json({
        siteId,
        domain,
        from: fromDate,
        to: toDate,
        flowDepth: FLOW_DEPTH,
        channelEdges: cappedEdges.filter(e => e.depth === 0).map(e => ({ from: e.from, to: e.to, sessions: e.sessions })),
        transitionEdges: cappedEdges.filter(e => e.depth > 0).map(e => ({ depth: e.depth, from: e.from, to: e.to, sessions: e.sessions })),
        exitCounts,
    });
}
