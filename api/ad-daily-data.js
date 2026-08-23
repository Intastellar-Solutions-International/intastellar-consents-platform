/**
 * GET /api/ad-daily-data?platform=google_analytics&domain=example.com&fromDate=2024-01-01&toDate=2024-01-31
 *
 * Returns daily rows from the ad_daily_data cache (populated by cron-ad-sync).
 * For google_analytics, also returns a live platform-dimension breakdown from the
 * GA4 Data API — this is how we detect server-side tracking (Measurement Protocol /
 * server-side GTM events show up as platform = "(other)").
 *
 * Response: { rows: [{ date, sessions, clicks, impressions, spend, currency }],
 *             platformBreakdown: [{ platform, sessions }] }   ← GA4 only
 *
 * Headers: Authorization: Bearer <token>   Organisation: <org_id>
 */

import pkg from "pg";
const { Pool } = pkg;
import { tryRefreshToken, fetchPlatformDataDaily } from "./_ad-platform-fetch.js";

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

function validateJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const decoded = Buffer.from(match[1], "base64").toString("utf8");
        const parts = decoded.split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        const iss = payload.iss ?? "";
        if (iss === "Intastellar Account") {
            if ((payload.nbf && payload.nbf > now) || (payload.exp && payload.exp < now)) return null;
        } else if (iss === "Intastellar Cron") {
            if (payload.sub !== "cron_scan_domains" || (payload.exp && payload.exp < now)) return null;
        } else {
            return null;
        }
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
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Organisation,Content-Type");
}

const GA4_DAILY_METRICS = [
    { name: "sessions" },
    { name: "totalUsers" },
    { name: "newUsers" },
    { name: "screenPageViews" },
    { name: "engagedSessions" },
    { name: "userEngagementDuration" },
];

async function fetchGA4DailyLive(accessToken, propertyId, fromDate, toDate) {
    const resp = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                dateRanges: [{ startDate: fromDate, endDate: toDate }],
                dimensions: [{ name: "date" }],
                metrics: GA4_DAILY_METRICS,
                orderBys: [{ dimension: { dimensionName: "date" } }],
            }),
        }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.rows || []).map(row => {
        const raw = row.dimensionValues?.[0]?.value || "";
        const date = raw.length === 8
            ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
            : raw;
        const mv = row.metricValues || [];
        const sessions      = Number(mv[0]?.value || 0);
        const users         = Number(mv[1]?.value || 0);
        const newUsers      = Number(mv[2]?.value || 0);
        const pageViews     = Number(mv[3]?.value || 0);
        const engagedSess   = Number(mv[4]?.value || 0);
        const engageDurSec  = Number(mv[5]?.value || 0);
        return {
            date,
            sessions,
            users,
            newUsers,
            pageViews,
            engagedSessions: engagedSess,
            engagementDurationSec: engageDurSec,
            clicks: sessions, // backward-compat alias
            impressions: 0,
            spend: 0,
            currency: null,
        };
    });
}

async function fetchGA4AggregateSummary(accessToken, propertyId, fromDate, toDate) {
    const resp = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                dateRanges: [{ startDate: fromDate, endDate: toDate }],
                metrics: [
                    { name: "sessions" },
                    { name: "totalUsers" },
                    { name: "newUsers" },
                    { name: "screenPageViews" },
                    { name: "engagementRate" },
                    { name: "averageSessionDuration" },
                    { name: "bounceRate" },
                ],
            }),
        }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const mv = data.rows?.[0]?.metricValues || [];
    return {
        sessions:            Number(mv[0]?.value || 0),
        totalUsers:          Number(mv[1]?.value || 0),
        newUsers:            Number(mv[2]?.value || 0),
        pageViews:           Number(mv[3]?.value || 0),
        engagementRate:      Number(mv[4]?.value || 0),   // 0–1 float
        avgSessionDuration:  Number(mv[5]?.value || 0),   // seconds
        bounceRate:          Number(mv[6]?.value || 0),   // 0–1 float
    };
}

async function fetchGA4ChannelBreakdown(accessToken, propertyId, fromDate, toDate) {
    const resp = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                dateRanges: [{ startDate: fromDate, endDate: toDate }],
                dimensions: [{ name: "sessionDefaultChannelGroup" }],
                metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "engagementRate" }],
                orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
            }),
        }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data.rows || []).map(row => ({
        channelGroup:    row.dimensionValues?.[0]?.value || "(other)",
        sessions:        Number(row.metricValues?.[0]?.value || 0),
        users:           Number(row.metricValues?.[1]?.value || 0),
        engagementRate:  Number(row.metricValues?.[2]?.value || 0),
    }));
}

async function fetchGA4PlatformBreakdown(accessToken, propertyId, fromDate, toDate) {
    const resp = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                dateRanges: [{ startDate: fromDate, endDate: toDate }],
                dimensions: [{ name: "platform" }],
                metrics: [{ name: "sessions" }],
                orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
            }),
        }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data.rows || []).map(row => ({
        platform: row.dimensionValues?.[0]?.value || "(unknown)",
        sessions: Number(row.metricValues?.[0]?.value || 0),
    }));
}

// Fetched live, uncached, per dashboard view — unlike the daily clicks/
// impressions trend (cached via cron-ad-sync.js into ad_daily_data since
// that's a fixed daily total that never changes once the day is over), top
// queries/pages are naturally read-on-demand: their whole value is "what are
// people searching for right now," and GSC's API quota (1200 req/property/
// day) is generous relative to this being an admin-triggered view, not
// high-traffic. rowLimit 20 matches every other "top N" table in this
// dashboard (analytics-report.js's topPages/utmSources/referrers/hosts).
async function fetchGSCDimension(accessToken, siteUrl, fromDate, toDate, dimension) {
    const resp = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ startDate: fromDate, endDate: toDate, dimensions: [dimension], rowLimit: 20 }),
        }
    );
    if (!resp.ok) return [];
    const data = await resp.json().catch(() => null);
    return (data?.rows || []).map(row => ({
        key:         row.keys?.[0] || "",
        clicks:      Number(row.clicks || 0),
        impressions: Number(row.impressions || 0),
        ctr:         Number(row.ctr || 0),
        position:    Number(row.position || 0),
    }));
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || req.headers.organization || "0", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const { platform, domain, fromDate, toDate } = req.query;
    if (!platform || !domain || !fromDate || !toDate) {
        return res.status(400).json({ error: "platform, domain, fromDate, toDate are required" });
    }

    const db = getPool();

    // Read daily rows from cache (table may not exist yet before cron first runs)
    let rows = [];
    try {
        const { rows: dailyRows } = await db.query(
            `SELECT date::text AS date,
                    clicks::bigint      AS clicks,
                    impressions::bigint AS impressions,
                    spend::float        AS spend,
                    currency,
                    avg_position::float AS avg_position
             FROM ad_daily_data
             WHERE organisation_id=$1 AND domain=$2 AND platform=$3
               AND date >= $4::date AND date <= $5::date
             ORDER BY date ASC`,
            [orgId, domain, platform, fromDate, toDate]
        );
        rows = dailyRows.map(r => ({
            date:        r.date,
            sessions:    Number(r.clicks || 0), // GA4 stores sessions in "clicks" column
            clicks:      Number(r.clicks || 0),
            impressions: Number(r.impressions || 0),
            spend:       Number(r.spend || 0),
            currency:    r.currency,
            avgPosition: r.avg_position != null ? Number(r.avg_position) : null,
        }));
    } catch {
        // ad_daily_data table doesn't exist yet — cron hasn't run; fall through to live fetch
    }

    // For GA4: look up the connection token (needed for live fallback + platform breakdown)
    let ga4AccessToken = null, ga4PropertyId = null;
    if (platform === "google_analytics") {
        const { rows: connRows } = await db.query(
            `SELECT * FROM ad_platform_connections
             WHERE organisation_id=$1 AND domain=$2 AND platform='google_analytics'
               AND account_id IS NOT NULL AND access_token IS NOT NULL`,
            [orgId, domain]
        );
        if (connRows.length) {
            const refreshed = await tryRefreshToken(db, connRows[0]).catch(() => connRows[0]);
            ga4AccessToken = refreshed.access_token;
            ga4PropertyId  = refreshed.account_id;
        }
    }

    // For Search Console: same connection lookup, reused below for both the
    // daily-rows live fallback and the top queries/pages fetch.
    let gscConn = null;
    if (platform === "google_search_console") {
        const { rows: connRows } = await db.query(
            `SELECT * FROM ad_platform_connections
             WHERE organisation_id=$1 AND domain=$2 AND platform='google_search_console'
               AND account_id IS NOT NULL AND access_token IS NOT NULL`,
            [orgId, domain]
        );
        if (connRows.length) {
            gscConn = await tryRefreshToken(db, connRows[0]).catch(() => connRows[0]);
        }
    }

    // Live fallback: if no cached rows, fetch directly from the API rather
    // than showing an empty trend — the cache only gets backfilled once
    // cron-ad-sync.js next runs, so a connection made minutes ago (like the
    // one topQueries/topPages below prove is already working live) would
    // otherwise show all zeros here despite genuinely having data.
    if (rows.length === 0 && ga4AccessToken && ga4PropertyId) {
        rows = await fetchGA4DailyLive(ga4AccessToken, ga4PropertyId, fromDate, toDate)
            .catch(() => []);
    } else if (rows.length === 0 && gscConn) {
        const byDay = await fetchPlatformDataDaily(gscConn, fromDate, toDate).catch(() => ({}));
        rows = Object.entries(byDay).map(([date, v]) => ({
            date,
            sessions: Number(v.clicks || 0),
            clicks: Number(v.clicks || 0),
            impressions: Number(v.impressions || 0),
            spend: Number(v.spend || 0),
            currency: v.currency,
            avgPosition: v.avgPosition != null ? Number(v.avgPosition) : null,
        })).sort((a, b) => a.date.localeCompare(b.date));
    }

    // For GA4: platform breakdown + aggregate summary + channel group breakdown (all in parallel)
    let platformBreakdown = null;
    let summary = null;
    let channelBreakdown = null;
    if (platform === "google_analytics" && ga4AccessToken && ga4PropertyId) {
        [platformBreakdown, summary, channelBreakdown] = await Promise.all([
            fetchGA4PlatformBreakdown(ga4AccessToken, ga4PropertyId, fromDate, toDate).catch(() => null),
            fetchGA4AggregateSummary(ga4AccessToken, ga4PropertyId, fromDate, toDate).catch(() => null),
            fetchGA4ChannelBreakdown(ga4AccessToken, ga4PropertyId, fromDate, toDate).catch(() => null),
        ]);
    }

    // For Search Console: top queries + top pages, live (see fetchGSCDimension's doc comment)
    let topQueries = null;
    let topPages = null;
    if (gscConn) {
        [topQueries, topPages] = await Promise.all([
            fetchGSCDimension(gscConn.access_token, gscConn.account_id, fromDate, toDate, "query").catch(() => []),
            fetchGSCDimension(gscConn.access_token, gscConn.account_id, fromDate, toDate, "page").catch(() => []),
        ]);
    }

    return res.status(200).json({ rows, platformBreakdown, summary, channelBreakdown, topQueries, topPages });
}
