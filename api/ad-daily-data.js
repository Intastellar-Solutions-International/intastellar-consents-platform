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
import { tryRefreshToken } from "./_ad-platform-fetch.js";

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

async function fetchGA4DailyLive(accessToken, propertyId, fromDate, toDate) {
    const resp = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                dateRanges: [{ startDate: fromDate, endDate: toDate }],
                dimensions: [{ name: "date" }],
                metrics: [{ name: "sessions" }],
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
        return {
            date,
            sessions: Number(row.metricValues?.[0]?.value || 0),
            clicks: Number(row.metricValues?.[0]?.value || 0),
            impressions: 0,
            spend: 0,
            currency: null,
        };
    });
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
                    currency
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

    // Live fallback: if no cached rows and we have a GA4 token, fetch directly from the API
    if (rows.length === 0 && ga4AccessToken && ga4PropertyId) {
        rows = await fetchGA4DailyLive(ga4AccessToken, ga4PropertyId, fromDate, toDate)
            .catch(() => []);
    }

    // For GA4: live platform breakdown for server-side tracking detection
    let platformBreakdown = null;
    if (platform === "google_analytics" && ga4AccessToken && ga4PropertyId) {
        platformBreakdown = await fetchGA4PlatformBreakdown(ga4AccessToken, ga4PropertyId, fromDate, toDate)
            .catch(() => null);
    }

    return res.status(200).json({ rows, platformBreakdown });
}
