/**
 * GET /api/cron-ad-sync
 *
 * Vercel cron — runs daily (schedule in vercel.json).
 *
 * For every active ad connection (account_id + access_token set):
 *   1. Refreshes the access token if needed.
 *   2. Determines which days in the last BACKFILL_DAYS are missing from
 *      the ad_daily_data cache table.
 *   3. Fetches missing days in one API call using daily granularity.
 *   4. Upserts each day into ad_daily_data.
 *
 * On first run a connection gets up to BACKFILL_DAYS of history.
 * After that, only yesterday is fetched (1 call per connection per day).
 *
 * Required env vars:
 *   CRON_SECRET           — Vercel sends this automatically
 *   POSTGRES_URL
 *   GOOGLE_ADS_DEVELOPER_TOKEN (Google Ads only)
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 *   META_ADS_CLIENT_ID / META_ADS_CLIENT_SECRET
 *   LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET
 *
 * Optional env vars:
 *   CRON_AD_SYNC_BACKFILL_DAYS  — how far back to fill on first run (default 30)
 */

import pkg from "pg";
const { Pool } = pkg;
import { tryRefreshToken, fetchPlatformDataDaily } from "./_ad-platform-fetch.js";
import { getEcbRates, fx } from "./_fx.js";

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

const BACKFILL_DAYS = Math.min(
    parseInt(process.env.CRON_AD_SYNC_BACKFILL_DAYS || "30", 10),
    90
);

// Hard limits on how far back each platform's API returns reliable data.
// Used to clamp user-requested date ranges on manual syncs.
const PLATFORM_MAX_DAYS = {
    google_ads:            1095, // 3 years
    meta_ads:              1095, // ~37 months
    linkedin_ads:           730, // 2 years
    microsoft_ads:         1095, // 3 years
    google_search_console:  500, // GSC retains ~16 months
    google_analytics:       365, // GA4 standard retention
};

function isoDate(d) {
    return d.toISOString().slice(0, 10);
}

function daysInRange(fromDate, toDate) {
    const days = [];
    let d = new Date(fromDate + "T00:00:00Z");
    const end = new Date(toDate + "T00:00:00Z");
    while (d <= end) {
        days.push(isoDate(d));
        d = new Date(d.getTime() + 86_400_000);
    }
    return days;
}

async function ensureDailyTable(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS ad_daily_data (
            id              SERIAL      PRIMARY KEY,
            organisation_id INTEGER     NOT NULL,
            domain          TEXT        NOT NULL,
            platform        TEXT        NOT NULL,
            date            DATE        NOT NULL,
            clicks          BIGINT      NOT NULL DEFAULT 0,
            impressions     BIGINT      NOT NULL DEFAULT 0,
            spend           NUMERIC(14,4),
            currency        TEXT,
            synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (organisation_id, domain, platform, date)
        )
    `);
    // Search Console's own weighted-average ranking metric for the day —
    // unlike CTR, this isn't derivable from clicks/impressions, so it needs
    // its own column. NULL for every other platform.
    await db.query(`ALTER TABLE ad_daily_data ADD COLUMN IF NOT EXISTS avg_position NUMERIC(6,2)`).catch(() => {});
    // spend_eur: native spend converted to EUR at the time of sync, using ECB
    // rates fetched that day. Used by ad-spend-report.js to convert to any
    // display currency without re-hitting ECB on every page load.
    await db.query(`ALTER TABLE ad_daily_data ADD COLUMN IF NOT EXISTS spend_eur NUMERIC(14,4)`).catch(() => {});
}

export default async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Two auth modes:
    // 1. Vercel cron: Authorization: Bearer <CRON_SECRET>
    // 2. Manual trigger from the dashboard: Authorization: Bearer <JWT>  + Organisation header + ?domain=
    const secret = process.env.CRON_SECRET;
    const isCronCall = secret && req.headers.authorization === `Bearer ${secret}`;
    const jwt = !isCronCall ? validateJwt(req.headers.authorization) : null;

    if (!isCronCall && !jwt) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const db = getPool();
    await ensureDailyTable(db);

    // Manual trigger: scope to the requesting org + optional domain/platform/date filter
    const manualOrgId   = jwt ? parseInt(req.headers.organisation || "", 10) : null;
    const manualDomain  = jwt ? (req.query.domain    || "").trim().toLowerCase() : null;
    const manualPlat    = jwt ? (req.query.platform  || "").trim()               : null;
    const manualFrom    = jwt ? (req.query.fromDate  || "").trim()               : null;
    const manualTo      = jwt ? (req.query.toDate    || "").trim()               : null;

    const whereExtra = manualOrgId
        ? `AND organisation_id = ${manualOrgId}
           ${manualDomain ? `AND LOWER(domain) = '${manualDomain.replace(/'/g, "''")}'` : ""}
           ${manualPlat   ? `AND platform = '${manualPlat.replace(/'/g, "''")}'`         : ""}`
        : "";

    // Fetch connections (all for cron, scoped for manual trigger)
    const { rows: connections } = await db.query(`
        SELECT organisation_id, domain, platform, account_id, account_label,
               login_customer_id, account_currency,
               access_token, refresh_token, token_expires_at
        FROM ad_platform_connections
        WHERE account_id IS NOT NULL AND access_token IS NOT NULL
        ${whereExtra}
        ORDER BY organisation_id, domain, platform
    `);

    const today = new Date();
    const yesterday = isoDate(new Date(today.getTime() - 86_400_000));
    const backfillFrom = isoDate(new Date(today.getTime() - BACKFILL_DAYS * 86_400_000));

    // Fetch ECB rates once for the whole sync run so every platform's native
    // currency can be normalised to EUR in the same upsert (no per-row fetch).
    const fxRates = await getEcbRates().catch(() => null);

    const results = [];
    let totalDaysFetched = 0;
    let totalErrors = 0;

    for (const rawConn of connections) {
        const conn = { ...rawConn };
        const tag = `[${conn.platform}] ${conn.domain}`;

        // For manual triggers with a requested date range: clamp to the platform's
        // maximum look-back window. Cron runs always use the global backfill window.
        let windowFrom = backfillFrom;
        let windowTo   = yesterday;
        if (manualFrom && manualTo) {
            const maxDays = PLATFORM_MAX_DAYS[conn.platform] || BACKFILL_DAYS;
            const platformEarliestMs = today.getTime() - maxDays * 86_400_000;
            const requestedFromMs    = new Date(manualFrom + "T00:00:00Z").getTime();
            const requestedToMs      = new Date(manualTo   + "T00:00:00Z").getTime();
            windowFrom = isoDate(new Date(Math.max(requestedFromMs, platformEarliestMs)));
            windowTo   = isoDate(new Date(Math.min(requestedToMs,   today.getTime() - 86_400_000)));
            if (windowFrom > windowTo) {
                results.push({ tag, status: "skipped", reason: "date range out of platform window" });
                continue;
            }
        }

        // Find which days in the window are already cached
        const { rows: cachedRows } = await db.query(
            `SELECT date::text AS date FROM ad_daily_data
             WHERE organisation_id=$1 AND domain=$2 AND platform=$3
               AND date >= $4::date AND date <= $5::date`,
            [conn.organisation_id, conn.domain, conn.platform, windowFrom, windowTo]
        );
        const cached = new Set(cachedRows.map(r => r.date));
        const allDays = daysInRange(windowFrom, windowTo);
        const missingDays = allDays.filter(d => !cached.has(d));

        if (missingDays.length === 0) {
            results.push({ tag, status: "up-to-date" });
            continue;
        }

        // Refresh token before fetching
        try {
            const refreshed = await tryRefreshToken(db, conn);
            conn.access_token = refreshed.access_token;
        } catch (e) {
            console.warn(`${tag} token refresh failed:`, e.message);
        }

        // Fetch the full missing range in one call (daily granularity)
        const fromDate = missingDays[0];
        const toDate = missingDays[missingDays.length - 1];

        let byDay;
        try {
            byDay = await fetchPlatformDataDaily(conn, fromDate, toDate);
        } catch (err) {
            console.error(`${tag} fetch failed:`, err.message);
            results.push({ tag, status: "error", error: err.message });
            totalErrors++;
            continue;
        }

        // Upsert each day
        let daysSaved = 0;
        for (const day of missingDays) {
            const v = byDay[day];
            if (!v) continue; // platform returned no data for this day (e.g. no campaigns active)
            const spendEur = fxRates && v.spend != null && v.currency
                ? fx(v.spend, v.currency, "EUR", fxRates)
                : null;
            try {
                await db.query(`
                    INSERT INTO ad_daily_data
                        (organisation_id, domain, platform, date, clicks, impressions, spend, currency, avg_position, spend_eur)
                    VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10)
                    ON CONFLICT (organisation_id, domain, platform, date) DO UPDATE SET
                        clicks       = EXCLUDED.clicks,
                        impressions  = EXCLUDED.impressions,
                        spend        = EXCLUDED.spend,
                        currency     = COALESCE(EXCLUDED.currency, ad_daily_data.currency),
                        avg_position = EXCLUDED.avg_position,
                        spend_eur    = COALESCE(EXCLUDED.spend_eur, ad_daily_data.spend_eur),
                        synced_at    = NOW()
                `, [
                    conn.organisation_id, conn.domain, conn.platform, day,
                    v.clicks || 0, v.impressions || 0, v.spend ?? null, v.currency ?? null,
                    v.avgPosition ?? null, spendEur ?? null,
                ]);
                daysSaved++;
            } catch (e) {
                console.error(`${tag} DB insert for ${day}:`, e.message);
            }
        }

        totalDaysFetched += daysSaved;
        results.push({ tag, status: "synced", missingDays: missingDays.length, daysSaved });
        console.log(`${tag} synced ${daysSaved}/${missingDays.length} days`);
    }

    return res.status(200).json({
        ok: true,
        connections: connections.length,
        totalDaysFetched,
        totalErrors,
        results,
    });
}
