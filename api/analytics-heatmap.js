import { getPool } from "./_db.js";
/**
 * GET /api/analytics-heatmap?domain=<domain>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>[&pathname=<path>&host=<host>&device=all|desktop|tablet|mobile&grid=5]
 *
 * Returns bucketed click coordinates + scroll depth for a domain (optionally a
 * single pathname) over a date range, for rendering a heatmap overlay.
 * Requires: Authorization: Bearer <token>   Organisation: <org_id>
 *
 * Without `pathname`, returns the list of pathnames that have click data so
 * the dashboard can offer a picker before drilling into a specific page.
 *
 * A site key can cover multiple real hostnames (subdomains, embedded
 * white-label widgets) — analytics_clicks/analytics_events tag each row with
 * `page_host` (location.hostname at capture time), distinct from
 * analytics_sites.domain (the domain the site key was registered under). The
 * path picker groups by (pathname, host) and returns `host` per entry so the
 * dashboard can render paths from any subdomain, not just the registered
 * domain; `host` falls back to `domain` for rows captured before this column
 * existed. The detail query accepts `host` to scope click/scroll data to the
 * exact host a path was seen on, since the same pathname can exist on
 * different subdomains with different layouts.
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

function safeDate(str, fallback) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? fallback : d.toISOString().slice(0, 10);
}

const DEVICE_TYPES = new Set(["desktop", "tablet", "mobile"]);

// Trailing-slash variants of the same path ("/x" vs "/x/") are folded
// together for both the picker list and the detail queries below — without
// this they'd silently split into separate rows/results with no indication
// they're the same page. Comparing both sides with the same expression
// keeps the picker's combined count and the drill-down's actual results
// consistent (a picker count that doesn't match what drilling in returns
// would be its own confusing bug).
function normPath(col) {
    return `regexp_replace(${col}, '/+$', '')`;
}
// "/" itself normalizes to '' — only relevant for display, comparisons on
// both sides of an equality still agree either way.
function displayPath(p) {
    return p === "" ? "/" : p;
}

// Same-site check as isSameSite() in src/Pages/Analytics/Acquisition.js,
// done in SQL: page_host matches the registered domain regardless of a
// "www." prefix on either side. $domainParam is the positional placeholder
// index holding `domain`.
function sameHostClause(hostCol, domainParam) {
    return `regexp_replace(COALESCE(${hostCol}, $${domainParam}), '^www\\.', '') =
            regexp_replace($${domainParam}, '^www\\.', '')`;
}

// Internal/admin paths a visitor wouldn't think of as "a page" — same
// purpose as the ^/api/ exclusion already used for Acquisition's top-pages
// table, just a different set of prefixes relevant to this list.
const INTERNAL_PATH_EXCLUDE = `pathname !~* '^/(admin|wp-admin)(/|$)'`;

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

    const pathname = (req.query.pathname || "").trim() || null;
    const host     = (req.query.host || "").trim().toLowerCase() || null;
    const device   = DEVICE_TYPES.has(req.query.device) ? req.query.device : null;
    const grid     = Math.min(20, Math.max(2, parseInt(req.query.grid, 10) || 5));
    // Excludes clicks/scroll-depth from a preloaded widget iframe (item 1) by
    // default — a visitor never saw or scrolled that iframe, so its clicks
    // and 0%-scroll-depth pageviews would otherwise dominate the heatmap for
    // whatever page it's embedded on. No bind parameter needed (not
    // user-controlled text), so this can splice directly into each query's
    // WHERE clause without disturbing existing positional placeholders. See
    // docs/analytics-audit-plan.md item 11.
    const includeEmbedded = req.query.includeEmbedded === "1";
    const EMBED_FILTER = includeEmbedded ? "" : "AND is_embedded = false";
    // Default the picker to the registered domain (+ "www." either way) —
    // a page key can legitimately cover other real hostnames (a booking
    // system on its own subdomain, a staging/preview subdomain that happens
    // to run the same tracking snippet, ...), but mixed indiscriminately
    // into one page list those read as duplicate/unrelated entries rather
    // than what they are. ?allHosts=1 opts back into the unfiltered list.
    const allHosts = req.query.allHosts === "1";

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

    // ── No pathname yet: return the pathname picker list ──────────────────────
    // Grouped by (pathname, host) so paths seen on a subdomain (page_host)
    // show up distinctly from the same path on the registered domain, instead
    // of being silently merged into one row.
    if (!pathname) {
        const hostFilter = allHosts ? "" : `AND ${sameHostClause("page_host", 4)}`;
        const { rows: pathRows } = await db.query(
            `SELECT ${normPath("pathname")} AS pathname, COALESCE(page_host, $4) AS host, SUM(n) AS clicks
             FROM (
                 SELECT pathname, page_host, COUNT(*) AS n
                 FROM analytics_clicks
                 WHERE site_id = $1 AND received_at >= $2 AND received_at < $3 ${EMBED_FILTER}
                   AND ${INTERNAL_PATH_EXCLUDE} ${hostFilter}
                 GROUP BY pathname, page_host
             ) raw
             GROUP BY 1, 2 ORDER BY clicks DESC LIMIT 50`,
            [siteId, fromDate, toDateExclusive, domain]
        ).catch(() => ({ rows: [] }));

        return res.status(200).json({
            siteId,
            domain,
            from: fromDate,
            to: toDate,
            noData: pathRows.length === 0,
            paths: pathRows.map(r => ({ pathname: displayPath(r.pathname), host: r.host, clicks: Number(r.clicks || 0) })),
        });
    }

    const clickParams = [siteId, fromDate, toDateExclusive];
    let deviceClause = "";
    if (device) {
        clickParams.push(device);
        deviceClause = `AND device_type = $${clickParams.length}`;
    }
    let hostClause = "";
    if (host) {
        clickParams.push(domain, host);
        hostClause = `AND COALESCE(page_host, $${clickParams.length - 1}) = $${clickParams.length}`;
    }

    const [clicksRes, elementsRes, scrollRes, totalRes] = await Promise.all([
        db.query(
            `SELECT
                FLOOR(x_pct / $${clickParams.length + 1}::numeric) * $${clickParams.length + 1}::numeric AS gx,
                FLOOR(y_pct / $${clickParams.length + 1}::numeric) * $${clickParams.length + 1}::numeric AS gy,
                COUNT(*) AS n
             FROM analytics_clicks
             WHERE site_id = $1 AND ${normPath("pathname")} = ${normPath(`$${clickParams.length + 2}`)}
               AND received_at >= $2 AND received_at < $3
               AND x_pct IS NOT NULL AND y_pct IS NOT NULL ${deviceClause} ${hostClause} ${EMBED_FILTER}
             GROUP BY 1, 2 ORDER BY n DESC LIMIT 5000`,
            [...clickParams, grid, pathname]
        ).catch(() => ({ rows: [] })),

        db.query(
            `SELECT target_tag, target_id, target_class, target_text, COUNT(*) AS n
             FROM analytics_clicks
             WHERE site_id = $1 AND ${normPath("pathname")} = ${normPath(`$${clickParams.length + 1}`)}
               AND received_at >= $2 AND received_at < $3 ${deviceClause} ${hostClause} ${EMBED_FILTER}
             GROUP BY target_tag, target_id, target_class, target_text
             ORDER BY n DESC LIMIT 30`,
            [...clickParams, pathname]
        ).catch(() => ({ rows: [] })),

        (() => {
            const scrollParams = [siteId, pathname, fromDate, toDateExclusive];
            let scrollDeviceClause = "";
            if (device) {
                scrollParams.push(device);
                scrollDeviceClause = `AND device_type = $${scrollParams.length}`;
            }
            let scrollHostClause = "";
            if (host) {
                scrollParams.push(domain, host);
                scrollHostClause = `AND COALESCE(page_host, $${scrollParams.length - 1}) = $${scrollParams.length}`;
            }
            return db.query(
                `SELECT FLOOR(scroll_depth / 10) * 10 AS bucket, COUNT(*) AS n
                 FROM analytics_events
                 WHERE site_id = $1 AND ${normPath("pathname")} = ${normPath("$2")}
                   AND received_at >= $3 AND received_at < $4
                   AND scroll_depth IS NOT NULL ${scrollDeviceClause} ${scrollHostClause} ${EMBED_FILTER}
                 GROUP BY 1 ORDER BY 1`,
                scrollParams
            ).catch(() => ({ rows: [] }));
        })(),

        db.query(
            `SELECT COUNT(*) AS clicks, COUNT(DISTINCT session_id) AS sessions
             FROM analytics_clicks
             WHERE site_id = $1 AND ${normPath("pathname")} = ${normPath(`$${clickParams.length + 1}`)}
               AND received_at >= $2 AND received_at < $3 ${deviceClause} ${hostClause} ${EMBED_FILTER}`,
            [...clickParams, pathname]
        ).catch(() => ({ rows: [{}] })),
    ]);

    const totals = totalRes.rows[0] || {};

    return res.status(200).json({
        siteId,
        domain,
        pathname,
        host: host || domain,
        from: fromDate,
        to: toDate,
        grid,
        noData: elementsRes.rows.length === 0 && clicksRes.rows.length === 0,
        totalClicks:   Number(totals.clicks   || 0),
        totalSessions: Number(totals.sessions || 0),
        clicks: clicksRes.rows.map(r => ({
            gx: Number(r.gx), gy: Number(r.gy), n: Number(r.n || 0),
        })),
        topElements: elementsRes.rows.map(r => ({
            tag: r.target_tag, id: r.target_id, className: r.target_class,
            text: r.target_text, n: Number(r.n || 0),
        })),
        scrollDepth: scrollRes.rows.map(r => ({
            bucket: Number(r.bucket), n: Number(r.n || 0),
        })),
    });
}
