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
 * google_analytics and google_search_console connections are excluded
 * throughout — neither has a spend concept (sessions-only / clicks-and-
 * impressions-only respectively), so neither is "ad platform" data for
 * this page.
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

// ── ECB exchange rates (EUR-based, cached 24 h per process) ──────────────────
// 1 EUR = rate[currency] units. EUR itself = 1.
// Used to unify multi-currency ad spend into one display currency.
let _fxCache = { rates: null, fetchedAt: 0 };

async function getEcbRates() {
    if (_fxCache.rates && Date.now() - _fxCache.fetchedAt < 86_400_000) {
        return _fxCache.rates;
    }
    try {
        const xml = await fetch(
            "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
            { signal: AbortSignal.timeout(5000) }
        ).then(r => r.text());
        const rates = { EUR: 1 };
        for (const m of xml.matchAll(/currency="([A-Z]{3})" rate="([0-9.]+)"/g)) {
            rates[m[1]] = parseFloat(m[2]);
        }
        _fxCache = { rates, fetchedAt: Date.now() };
        return rates;
    } catch {
        // Return stale cache if available, otherwise a hardcoded fallback
        // so a transient ECB outage doesn't break the entire report.
        return _fxCache.rates ?? {
            EUR: 1, USD: 1.09, GBP: 0.86, DKK: 7.46,
            SEK: 11.3, NOK: 11.7, CHF: 0.97, PLN: 4.3,
        };
    }
}

function fx(amount, from, to, rates) {
    if (!from || !to || from === to || !amount) return Number(amount || 0);
    const fromRate = rates[from];
    const toRate   = rates[to];
    if (!fromRate || !toRate) return Number(amount || 0);
    return (Number(amount) / fromRate) * toRate;
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

    // Display currency requested by the client. When set, every spend amount
    // in the response is converted to this currency using ECB rates so the
    // UI never has to deal with mixed DKK + EUR figures side by side.
    const VALID_CURRENCIES = new Set(["EUR","USD","GBP","DKK","SEK","NOK","CHF","PLN","AUD","CAD","SGD"]);
    const rawDisplayCurrency = String(req.query.displayCurrency || "").toUpperCase().trim();
    const displayCurrency = VALID_CURRENCIES.has(rawDisplayCurrency) ? rawDisplayCurrency : null;

    const domainsHeader = String(req.headers.domains || "").trim();
    const domainParam   = String(req.query.domain || "").trim();
    const rawSelector   = domainsHeader || domainParam;
    const isCombined    = !rawSelector || rawSelector.toLowerCase() === "combined view";
    const domain        = isCombined ? null : rawSelector.toLowerCase();

    const db = getPool();

    // ── Gating — does this org (or this domain) have any real ad-platform
    // connection at all? GA4-only connections don't count (no spend concept).
    // Domain match is case-insensitive — the connection may have been saved
    // with different casing than the current URL/header. No error-swallowing
    // catch here: a genuine query failure must surface as a real error, not
    // get silently misreported as "no connections" (that's a bug we hit).
    const gateParams = isCombined ? [orgId] : [orgId, domain];
    const { rows: gateRows } = await db.query(
        `SELECT 1 FROM ad_platform_connections
         WHERE organisation_id = $1 AND platform NOT IN ('google_analytics', 'google_search_console')
           AND account_id IS NOT NULL AND access_token IS NOT NULL
           ${isCombined ? "" : "AND LOWER(domain) = LOWER($2)"}
         LIMIT 1`,
        gateParams
    );

    if (!gateRows.length) {
        return res.status(200).json({ noConnections: true, scope: isCombined ? "combined" : domain });
    }

    const dateParams   = [orgId, fromDate, toDate];
    const domainClause = isCombined ? "" : "AND LOWER(domain) = LOWER($4)";
    if (!isCombined) dateParams.push(domain);
    const baseWhere = `WHERE organisation_id = $1 AND date BETWEEN $2 AND $3
                        AND platform NOT IN ('google_analytics', 'google_search_console') ${domainClause}`;

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
        ),

        db.query(
            `SELECT platform, currency,
                    SUM(spend)       AS amount,
                    SUM(clicks)      AS clicks,
                    SUM(impressions) AS impressions
             FROM ad_daily_data
             ${baseWhere} AND currency IS NOT NULL
             GROUP BY platform, currency ORDER BY amount DESC`,
            dateParams
        ),

        db.query(
            `SELECT TO_CHAR(date, 'YYYY-MM-DD') AS date, platform,
                    SUM(spend)       AS amount,
                    SUM(clicks)      AS clicks,
                    SUM(impressions) AS impressions
             FROM ad_daily_data
             ${baseWhere} AND currency IS NOT NULL
             GROUP BY date, platform ORDER BY date ASC`,
            dateParams
        ),

        // Per-domain breakdown only makes sense (and is only queried) in combined mode.
        isCombined
            ? db.query(
                `SELECT domain, currency, SUM(spend) AS amount
                 FROM ad_daily_data
                 WHERE organisation_id = $1 AND date BETWEEN $2 AND $3
                   AND platform NOT IN ('google_analytics', 'google_search_console') AND currency IS NOT NULL
                 GROUP BY domain, currency ORDER BY amount DESC`,
                [orgId, fromDate, toDate]
            )
            : Promise.resolve({ rows: [] }),

    ]);

    // Reshape daily rows into one entry per date with a { platform: {spend,
    // clicks, impressions} } map, so the chart components don't need to
    // pivot the data themselves (per-channel widgets derive cost-per-click
    // from spend/clicks here rather than a stored column).
    const dailyMap = new Map();
    for (const row of dailyRes.rows) {
        if (!dailyMap.has(row.date)) dailyMap.set(row.date, {});
        dailyMap.get(row.date)[row.platform] = {
            spend:       Number(row.amount || 0),
            clicks:      Number(row.clicks || 0),
            impressions: Number(row.impressions || 0),
        };
    }
    const daily = Array.from(dailyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, byPlatform]) => ({ date, byPlatform }));

    // ── Blended CAC — total ad spend ÷ conversions/quality-leads already
    // tracked in first-party analytics. analytics_events is TIMESTAMPTZ, so
    // this needs its own exclusive end-date (ad_daily_data's `date` column
    // is a plain DATE, which is why the aggregations above use inclusive
    // BETWEEN instead). Each analytics_sites row carries its own lead-quality
    // config, so this loops per-site rather than one query across all sites.
    const toDateExclusive = new Date(new Date(toDate).getTime() + 86400000).toISOString().slice(0, 10);

    const { rows: siteRows } = await db.query(
        `SELECT id, lead_quality_enabled, lead_require_engaged, lead_qualifying_pages, lead_qualifying_events
         FROM analytics_sites
         WHERE organisation_id = $1 AND active = true ${isCombined ? "" : "AND LOWER(domain) = LOWER($2)"}`,
        isCombined ? [orgId] : [orgId, domain]
    );

    const leadQualitySites = siteRows.filter(s => s.lead_quality_enabled);
    let totalQualityLeads = 0;
    let conversionsSource = null;

    if (leadQualitySites.length) {
        conversionsSource = "lead_quality";
        const leadResults = await Promise.all(leadQualitySites.map(site => db.query(
            `WITH session_stats AS (
                SELECT session_id, MAX(duration_sec) AS max_duration, COUNT(*) AS pageviews
                FROM analytics_events
                WHERE site_id = $1 AND consent_level = 'full'
                  AND received_at >= $2 AND received_at < $3
                  AND session_id IS NOT NULL
                GROUP BY session_id
            )
            SELECT COUNT(*) AS leads
            FROM session_stats s
            WHERE ($4::boolean = false
                   OR s.max_duration >= 10
                   OR s.pageviews > 1
                   OR EXISTS (SELECT 1 FROM analytics_clicks c
                              WHERE c.site_id = $1 AND c.session_id = s.session_id
                                AND c.received_at >= $2 AND c.received_at < $3))
              AND (
                (cardinality($5::text[]) > 0 AND EXISTS (
                    SELECT 1 FROM analytics_events pe
                    WHERE pe.site_id = $1 AND pe.session_id = s.session_id
                      AND pe.pathname = ANY($5) AND pe.received_at >= $2 AND pe.received_at < $3))
                OR
                (cardinality($6::text[]) > 0 AND EXISTS (
                    SELECT 1 FROM analytics_custom_events ce
                    WHERE ce.site_id = $1 AND ce.session_id = s.session_id
                      AND ce.name = ANY($6) AND ce.received_at >= $2 AND ce.received_at < $3))
              )`,
            [site.id, fromDate, toDateExclusive, site.lead_require_engaged !== false,
             site.lead_qualifying_pages || [], site.lead_qualifying_events || []]
        )));
        totalQualityLeads = leadResults.reduce((sum, r) => sum + Number(r.rows[0]?.leads || 0), 0);
    } else if (siteRows.length) {
        // No site has lead-quality configured — fall back to every tracked
        // custom event (window.intaAnalytics.track()), same convention
        // analytics-report.js's own `conversions` list already uses (it
        // never filters by `kind` either — kind is purchase/click/custom,
        // just a display label, not a "this counts as a conversion" flag).
        conversionsSource = "conversion_events";
        const convResults = await Promise.all(siteRows.map(site => db.query(
            `SELECT COUNT(*) AS cnt FROM analytics_custom_events
             WHERE site_id = $1 AND received_at >= $2 AND received_at < $3`,
            [site.id, fromDate, toDateExclusive]
        )));
        totalQualityLeads = convResults.reduce((sum, r) => sum + Number(r.rows[0]?.cnt || 0), 0);
    }

    // Fetch FX rates only when conversion is needed (avoids the ECB fetch
    // entirely for callers that don't pass ?displayCurrency).
    const rates = displayCurrency ? await getEcbRates() : null;

    // Aggregate spend/clicks/impressions into a single display-currency row.
    // When no displayCurrency is requested, keep the original per-currency rows
    // so the existing "native" display path still works unchanged.
    let spendByCurrency, platforms, byDomain;

    if (displayCurrency && rates) {
        // Collapse all currency rows into one converted total.
        const agg = { amount: 0, clicks: 0, impressions: 0 };
        for (const r of currencyRes.rows) {
            agg.amount      += fx(r.amount, r.currency, displayCurrency, rates);
            agg.clicks      += Number(r.clicks || 0);
            agg.impressions += Number(r.impressions || 0);
        }
        spendByCurrency = [{ currency: displayCurrency, ...agg }];

        // Per-platform: merge rows that share a platform (different currencies)
        // into one row with converted amounts.
        const platMap = new Map();
        for (const r of platformRes.rows) {
            const key = r.platform;
            if (!platMap.has(key)) platMap.set(key, { platform: key, currency: displayCurrency, amount: 0, clicks: 0, impressions: 0 });
            const entry = platMap.get(key);
            entry.amount      += fx(r.amount, r.currency, displayCurrency, rates);
            entry.clicks      += Number(r.clicks || 0);
            entry.impressions += Number(r.impressions || 0);
        }
        platforms = [...platMap.values()];

        // Per-domain spend converted.
        byDomain = isCombined
            ? Object.values(
                byDomainRes.rows.reduce((acc, r) => {
                    acc[r.domain] = acc[r.domain] || { domain: r.domain, currency: displayCurrency, amount: 0 };
                    acc[r.domain].amount += fx(r.amount, r.currency, displayCurrency, rates);
                    return acc;
                }, {})
              )
            : null;

        // Patch daily rows: convert each platform's spend in-place.
        for (const day of daily) {
            for (const [platform, vals] of Object.entries(day.byPlatform)) {
                // We don't know the native currency per-platform-day from the
                // aggregated daily query, so look it up from the platforms map.
                const conn = platformRes.rows.find(p => p.platform === platform);
                day.byPlatform[platform] = {
                    ...vals,
                    spend: fx(vals.spend, conn?.currency, displayCurrency, rates),
                };
            }
        }
    } else {
        spendByCurrency = currencyRes.rows.map(r => ({
            currency: r.currency, amount: Number(r.amount || 0),
            clicks: Number(r.clicks || 0), impressions: Number(r.impressions || 0),
        }));
        platforms = platformRes.rows.map(r => ({
            platform: r.platform, currency: r.currency, amount: Number(r.amount || 0),
            clicks: Number(r.clicks || 0), impressions: Number(r.impressions || 0),
        }));
        byDomain = isCombined
            ? byDomainRes.rows.map(r => ({ domain: r.domain, currency: r.currency, amount: Number(r.amount || 0) }))
            : null;
    }

    const blendedCac = spendByCurrency.map(r => ({
        currency: r.currency,
        cac: totalQualityLeads > 0 ? r.amount / totalQualityLeads : null,
    }));

    return res.status(200).json({
        scope: isCombined ? "combined" : domain,
        noConnections: false,
        from: fromDate,
        to: toDate,
        displayCurrency: displayCurrency || null,
        spendByCurrency,
        platforms,
        byDomain,
        daily,
        conversions: { totalQualityLeads, source: conversionsSource },
        blendedCac,
    });
}
