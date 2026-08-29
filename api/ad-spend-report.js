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

import { getEcbRates, fx, FALLBACK_RATES } from "./_fx.js";
import { getPool } from "./_db.js";
let _migrationsRun = false;
async function ensureColumns(db) {
    if (_migrationsRun) return;
    await Promise.all([
        // spend_eur is normally added by cron-ad-sync.js but may not exist yet
        // if the cron hasn't run since the column was added to the schema.
        db.query(`ALTER TABLE ad_daily_data ADD COLUMN IF NOT EXISTS spend_eur NUMERIC(14,4)`).catch(() => {}),
        // lead quality columns on analytics_sites — added by a separate migration
        db.query(`ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS lead_quality_enabled BOOLEAN DEFAULT false`).catch(() => {}),
        db.query(`ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS lead_require_engaged BOOLEAN DEFAULT true`).catch(() => {}),
        db.query(`ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS lead_qualifying_pages TEXT[]`).catch(() => {}),
        db.query(`ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS lead_qualifying_events TEXT[]`).catch(() => {}),
    ]);
    _migrationsRun = true;
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

// FX utilities imported from _fx.js (getEcbRates, fx, FALLBACK_RATES).
// spend_eur is now stored in ad_daily_data at sync time (cron-ad-sync.js),
// so conversion at report time only needs ECB rates for the final
// EUR → displayCurrency step, not for the native → EUR step.

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || req.headers.organization || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    try {
        return await _handler(req, res, orgId);
    } catch (err) {
        console.error("[ad-spend-report] unhandled error:", err?.message, err?.code);
        return res.status(500).json({ error: "Internal server error", detail: err?.message });
    }
}

async function _handler(req, res, orgId) {

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
    await ensureColumns(db);

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

    // Each query exposes two spend columns so the JS below can use spend_eur
    // (computed at sync time, day-of ECB rate) for rows that have it, and
    // fall back to the native spend amount for older rows that pre-date the
    // spend_eur column. SQL SUM() ignores NULLs, so the CASE split is exact.
    const EUR_SPLIT = `
        SUM(CASE WHEN spend_eur IS NOT NULL THEN spend_eur      ELSE 0 END) AS eur_from_new,
        SUM(CASE WHEN spend_eur IS NULL     THEN COALESCE(spend,0) ELSE 0 END) AS native_from_old`;

    const [currencyRes, platformRes, dailyRes, byDomainRes] = await Promise.all([

        db.query(
            `SELECT currency,
                    SUM(spend) AS amount,
                    ${EUR_SPLIT},
                    SUM(clicks)      AS clicks,
                    SUM(impressions) AS impressions
             FROM ad_daily_data
             ${baseWhere} AND currency IS NOT NULL
             GROUP BY currency ORDER BY amount DESC`,
            dateParams
        ),

        db.query(
            `SELECT platform, currency,
                    SUM(spend) AS amount,
                    ${EUR_SPLIT},
                    SUM(clicks)      AS clicks,
                    SUM(impressions) AS impressions
             FROM ad_daily_data
             ${baseWhere} AND currency IS NOT NULL
             GROUP BY platform, currency ORDER BY amount DESC`,
            dateParams
        ),

        db.query(
            `SELECT TO_CHAR(date, 'YYYY-MM-DD') AS date, platform, currency,
                    SUM(spend) AS amount,
                    ${EUR_SPLIT},
                    SUM(clicks)      AS clicks,
                    SUM(impressions) AS impressions
             FROM ad_daily_data
             ${baseWhere} AND currency IS NOT NULL
             GROUP BY date, platform, currency ORDER BY date ASC`,
            dateParams
        ),

        // Per-domain breakdown only makes sense (and is only queried) in combined mode.
        isCombined
            ? db.query(
                `SELECT domain, currency,
                        SUM(spend) AS amount,
                        ${EUR_SPLIT}
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
    // The daily query now groups by (date, platform, currency) — in combined
    // view a (date, platform) pair can span multiple domains with different
    // currencies. We accumulate across currency rows into one platform bucket.
    const dailyMap = new Map();
    for (const row of dailyRes.rows) {
        if (!dailyMap.has(row.date)) dailyMap.set(row.date, {});
        const byPlatform = dailyMap.get(row.date);
        if (!byPlatform[row.platform]) byPlatform[row.platform] = { spend: 0, clicks: 0, impressions: 0 };
        // spend will be patched to the display currency below if needed;
        // store native amount for now so the non-conversion path still works.
        byPlatform[row.platform].spend       += Number(row.amount || 0);
        byPlatform[row.platform].clicks      += Number(row.clicks || 0);
        byPlatform[row.platform].impressions += Number(row.impressions || 0);
        // stash the EUR split so the conversion block below can use it
        byPlatform[row.platform]._eurFromNew    = (byPlatform[row.platform]._eurFromNew    || 0) + Number(row.eur_from_new    || 0);
        byPlatform[row.platform]._nativeFromOld = (byPlatform[row.platform]._nativeFromOld || 0) + Number(row.native_from_old || 0);
        byPlatform[row.platform]._currency      = row.currency; // last write wins (fine for single-domain)
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
    // ECB rates are only needed for the EUR → displayCurrency step.
    // The EUR amounts for each row come from `spend_eur` (stored at sync time
    // with that day's ECB rate) for new rows, and a runtime conversion for
    // old rows that pre-date the spend_eur column.
    const rates = displayCurrency ? await getEcbRates() : null;

    // Helper: compute the EUR amount from one DB row using the stored spend_eur
    // (preferred, uses day-of rates) with a runtime fallback for old rows.
    function toEur(r) {
        return Number(r.eur_from_new || 0) + fx(r.native_from_old, r.currency, "EUR", rates || FALLBACK_RATES);
    }

    // Aggregate spend/clicks/impressions into a single display-currency row.
    // When no displayCurrency is requested, keep the original per-currency rows
    // so the existing "native" display path still works unchanged.
    let spendByCurrency, platforms, byDomain;

    if (displayCurrency && rates) {
        const displayRate = rates[displayCurrency] || 1;

        // Collapse all currency rows into one converted total.
        const agg = { amount: 0, clicks: 0, impressions: 0 };
        for (const r of currencyRes.rows) {
            agg.amount      += toEur(r) * displayRate;
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
            entry.amount      += toEur(r) * displayRate;
            entry.clicks      += Number(r.clicks || 0);
            entry.impressions += Number(r.impressions || 0);
        }
        platforms = [...platMap.values()];

        // Per-domain spend converted.
        byDomain = isCombined
            ? Object.values(
                byDomainRes.rows.reduce((acc, r) => {
                    acc[r.domain] = acc[r.domain] || { domain: r.domain, currency: displayCurrency, amount: 0 };
                    acc[r.domain].amount += toEur(r) * displayRate;
                    return acc;
                }, {})
              )
            : null;

        // Patch daily rows: convert each platform's stashed EUR split in-place.
        for (const day of daily) {
            for (const [platform, vals] of Object.entries(day.byPlatform)) {
                const eurAmount = (vals._eurFromNew || 0) + fx(vals._nativeFromOld, vals._currency, "EUR", rates);
                day.byPlatform[platform] = {
                    spend:       eurAmount * displayRate,
                    clicks:      vals.clicks,
                    impressions: vals.impressions,
                };
            }
        }
    } else {
        // Clean up the internal _eur* fields before sending native-currency rows.
        for (const day of daily) {
            for (const [platform, vals] of Object.entries(day.byPlatform)) {
                day.byPlatform[platform] = { spend: vals.spend, clicks: vals.clicks, impressions: vals.impressions };
            }
        }
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
