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
//
// Capping has to bound the TOTAL distinct nodes per column, not each source
// node's fan-out independently — capping every source's branches to top-8
// still lets a column explode to (sources × 8) distinct nodes once there are
// several sources feeding into it, which is exactly what a column's node
// count compounding across depth looks like (a handful of source nodes each
// contributing their own top-8 quickly balloons into dozens of near-empty
// boxes a few columns in). So this cascades depth by depth: cap column N+1
// to its top N_PER_COLUMN nodes by TOTAL population (summed across every
// source feeding it), bucket the rest into "(other)", then only carry
// forward edges whose source survived that column's cap — a node folded
// into "(other)" simply has no further outgoing edges tracked, rather than
// trying to keep expanding an ever-growing long tail.
function totalsBySide(edges, side) {
    const totals = new Map();
    for (const e of edges) {
        const key = side === "from" ? e.from_node : e.to_node;
        totals.set(key, (totals.get(key) || 0) + e.sessions);
    }
    return totals;
}

function topNKeys(totals, n) {
    return new Set([...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k));
}

// Channel labels are literally "source / medium" — they contain spaces, so a
// space-joined string key would corrupt both sides when split back apart.
// JSON-encoding the pair sidesteps any delimiter collision.
function remapSide(edges, side, keepSet) {
    const merged = new Map(); // JSON.stringify([from, to]) -> sessions
    for (const e of edges) {
        const val = side === "from" ? e.from_node : e.to_node;
        const mapped = keepSet.has(val) ? val : "(other)";
        const from = side === "from" ? mapped : e.from_node;
        const to   = side === "to"   ? mapped : e.to_node;
        const key = JSON.stringify([from, to]);
        merged.set(key, (merged.get(key) || 0) + e.sessions);
    }
    return [...merged.entries()].map(([key, sessions]) => {
        const [from_node, to_node] = JSON.parse(key);
        return { from_node, to_node, sessions };
    });
}

function capFlow(rawEdges) {
    // Depth 0 (channel -> first page): cap both sides — channels have no
    // "previous column" to have already bounded them, unlike every later
    // depth where the from-side is already the previous depth's capped
    // to-side.
    let depth0 = rawEdges.filter(e => e.depth === 0);
    const channelKeep = topNKeys(totalsBySide(depth0, "from"), TOP_N_PER_COLUMN);
    depth0 = remapSide(depth0, "from", channelKeep);
    const col1Keep = topNKeys(totalsBySide(depth0, "to"), TOP_N_PER_COLUMN);
    depth0 = remapSide(depth0, "to", col1Keep);

    const finalByDepth = new Map([[0, depth0]]);
    let allowedFrom = col1Keep.has("(other)") || depth0.some(e => e.to_node === "(other)")
        ? new Set([...col1Keep, "(other)"])
        : col1Keep;

    for (let depth = 1; depth <= FLOW_DEPTH; depth++) {
        // Only edges leaving a node that survived the previous column's cap
        // — a node folded into "(other)" there has no tracked continuation.
        let edges = rawEdges.filter(e => e.depth === depth && allowedFrom.has(e.from_node));
        const keep = topNKeys(totalsBySide(edges, "to"), TOP_N_PER_COLUMN);
        edges = remapSide(edges, "to", keep);
        finalByDepth.set(depth, edges);
        allowedFrom = edges.some(e => e.to_node === "(other)") ? new Set([...keep, "(other)"]) : keep;
    }

    return finalByDepth;
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
    // = page[N] -> page[N+1]. Capping/bucketing happens after this query
    // returns, in capFlow() below.
    const edgesSql = `
        WITH channel AS (
            SELECT DISTINCT ON (session_id)
                session_id,
                -- utm_source/utm_medium are stored as '' (not NULL) when
                -- absent — see api/a.js's ingest, (us || "").slice(0,255) —
                -- so COALESCE alone never catches them; NULLIF collapses ''
                -- to NULL first. Pure direct traffic (no UTM, no referrer)
                -- gets the plain "(direct)" label instead of the redundant
                -- "(direct) / (none)" compound.
                CASE
                    WHEN NULLIF(utm_source, '') IS NULL AND NULLIF(utm_medium, '') IS NULL AND referrer_host IS NULL
                        THEN '(direct)'
                    ELSE
                        COALESCE(NULLIF(utm_source, ''), '(direct)') || ' / ' ||
                        COALESCE(NULLIF(utm_medium, ''), CASE WHEN referrer_host IS NOT NULL THEN 'referral' ELSE '(none)' END)
                END AS channel_label
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

    const { rows } = await db.query(edgesSql, params).catch(() => ({ rows: [] }));
    const rawEdges = rows.map(r => ({
        depth: Number(r.depth), from_node: r.from_node, to_node: r.to_node, sessions: Number(r.sessions),
    }));

    const finalByDepth = capFlow(rawEdges);

    // Exit counts, derived from the already-capped edges so the numbers the
    // diagram shows are internally consistent (a node's population exactly
    // equals its outgoing edges plus its exit, using the same edge set for
    // both) — depth d's population is depth (d-1)'s incoming sum, depth d's
    // outgoing is depth d's own edges. Depth 0 (channels) has no prior
    // column to derive population from and is skipped: a channel-tagged
    // session definitionally has at least one pageview, so it's not a
    // meaningful "exit" point. The final page column (depth FLOW_DEPTH's
    // "to" side) also has no depth+1 data to compare against — that's
    // "we stopped tracking here", not a real bounce signal, so it's left
    // out rather than mislabeled as an exit.
    const exitCounts = [];
    for (let depth = 1; depth <= FLOW_DEPTH; depth++) {
        const population = totalsBySide(finalByDepth.get(depth - 1), "to");
        const outgoing = totalsBySide(finalByDepth.get(depth), "from");
        for (const [node, pop] of population) {
            const sessions = Math.max(0, pop - (outgoing.get(node) || 0));
            if (sessions > 0) exitCounts.push({ depth, node, sessions });
        }
    }

    const channelEdges = finalByDepth.get(0).map(e => ({ from: e.from_node, to: e.to_node, sessions: e.sessions }));
    const transitionEdges = [];
    for (let depth = 1; depth <= FLOW_DEPTH; depth++) {
        for (const e of finalByDepth.get(depth)) {
            transitionEdges.push({ depth, from: e.from_node, to: e.to_node, sessions: e.sessions });
        }
    }

    return res.status(200).json({
        siteId,
        domain,
        from: fromDate,
        to: toDate,
        flowDepth: FLOW_DEPTH,
        channelEdges,
        transitionEdges,
        exitCounts,
    });
}
