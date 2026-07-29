/**
 * GET /api/ad-spend-report?from=<YYYY-MM-DD>&to=<YYYY-MM-DD>
 *
 * Aggregated ad-platform spend for the "Ad Spend" analytics page — reads the
 * ad_daily_data cache (populated nightly by api/cron-ad-sync.js) rather than
 * hitting live ad-platform APIs on every page load.
 *
 * Domain scoping follows the same convention as MarketingReport's
 * `marketingAttribution` call: a `Domains` header carrying either a specific
 * punycode domain or the literal sentinel "combined view" (see
 * src/Functions/domainPathSegments.js `toDomainsApiHeader`). A `?domain=`
 * query param is accepted as a fallback. Missing/sentinel → combined
 * (org-wide) mode, matching DomainContext's default.
 *
 * google_analytics connections are excluded throughout — GA4 has no spend
 * concept (sessions only), so it isn't "ad platform" data for this page.
 *
 * Required headers: Authorization: Bearer <token>, Organisation: <org_id>
 * Required env vars: POSTGRES_URL
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
        });
    }
    return pool;
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

const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Organisation,Domains,Content-Type");
}

function safeDate(str, fallback) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? fallback : d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || req.headers.organization || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const today = new Date().toISOString().slice(0, 10);
    const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const fromDate = safeDate(req.query.from, thirtyAgo);
    const toDate   = safeDate(req.query.to,   today);

    const domainsHeader = String(req.headers.domains || "").trim();
    const domainParam   = String(req.query.domain || "").trim();
    const rawSelector   = domainsHeader || domainParam;
    const isCombined    = !rawSelector || rawSelector.toLowerCase() === "combined view";
    const domain        = isCombined ? null : rawSelector.toLowerCase();

    const db = getPool();

    // ── Gating — does this org (or this domain) have any real ad-platform
    // connection at all? GA4-only connections don't count (no spend concept).
    const gateParams = isCombined ? [orgId] : [orgId, domain];
    const { rows: gateRows } = await db.query(
        `SELECT 1 FROM ad_platform_connections
         WHERE organisation_id = $1 AND platform != 'google_analytics'
           AND account_id IS NOT NULL AND access_token IS NOT NULL
           ${isCombined ? "" : "AND domain = $2"}
         LIMIT 1`,
        gateParams
    ).catch(() => ({ rows: [] }));

    if (!gateRows.length) {
        return res.status(200).json({ noConnections: true, scope: isCombined ? "combined" : domain });
    }

    const dateParams   = [orgId, fromDate, toDate];
    const domainClause = isCombined ? "" : "AND domain = $4";
    if (!isCombined) dateParams.push(domain);
    const baseWhere = `WHERE organisation_id = $1 AND date BETWEEN $2 AND $3
                        AND platform != 'google_analytics' ${domainClause}`;

    const [currencyRes, platformRes, dailyRes, byDomainRes] = await Promise.all([

        db.query(
            `SELECT currency,
                    SUM(spend)       AS amount,
                    SUM(clicks)      AS clicks,
                    SUM(impressions) AS impressions
             FROM ad_daily_data
             ${baseWhere} AND currency IS NOT NULL
             GROUP BY currency ORDER BY amount DESC`,
            dateParams
        ).catch(() => ({ rows: [] })),

        db.query(
            `SELECT platform, currency,
                    SUM(spend)       AS amount,
                    SUM(clicks)      AS clicks,
                    SUM(impressions) AS impressions
             FROM ad_daily_data
             ${baseWhere} AND currency IS NOT NULL
             GROUP BY platform, currency ORDER BY amount DESC`,
            dateParams
        ).catch(() => ({ rows: [] })),

        db.query(
            `SELECT TO_CHAR(date, 'YYYY-MM-DD') AS date, platform, SUM(spend) AS amount
             FROM ad_daily_data
             ${baseWhere} AND currency IS NOT NULL
             GROUP BY date, platform ORDER BY date ASC`,
            dateParams
        ).catch(() => ({ rows: [] })),

        // Per-domain breakdown only makes sense (and is only queried) in combined mode.
        isCombined
            ? db.query(
                `SELECT domain, currency, SUM(spend) AS amount
                 FROM ad_daily_data
                 WHERE organisation_id = $1 AND date BETWEEN $2 AND $3
                   AND platform != 'google_analytics' AND currency IS NOT NULL
                 GROUP BY domain, currency ORDER BY amount DESC`,
                [orgId, fromDate, toDate]
            ).catch(() => ({ rows: [] }))
            : Promise.resolve({ rows: [] }),

    ]);

    // Reshape daily rows into one entry per date with a { platform: amount } map,
    // so the chart component doesn't need to pivot the data itself.
    const dailyMap = new Map();
    for (const row of dailyRes.rows) {
        if (!dailyMap.has(row.date)) dailyMap.set(row.date, {});
        dailyMap.get(row.date)[row.platform] = Number(row.amount || 0);
    }
    const daily = Array.from(dailyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, byPlatform]) => ({ date, byPlatform }));

    return res.status(200).json({
        scope: isCombined ? "combined" : domain,
        noConnections: false,
        from: fromDate,
        to: toDate,
        spendByCurrency: currencyRes.rows.map(r => ({
            currency:    r.currency,
            amount:      Number(r.amount || 0),
            clicks:      Number(r.clicks || 0),
            impressions: Number(r.impressions || 0),
        })),
        platforms: platformRes.rows.map(r => ({
            platform:    r.platform,
            currency:    r.currency,
            amount:      Number(r.amount || 0),
            clicks:      Number(r.clicks || 0),
            impressions: Number(r.impressions || 0),
        })),
        byDomain: isCombined
            ? byDomainRes.rows.map(r => ({
                domain:   r.domain,
                currency: r.currency,
                amount:   Number(r.amount || 0),
            }))
            : null,
        daily,
        conversions: null,
        blendedCac: null,
    });
}
