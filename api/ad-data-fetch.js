/**
 * GET /api/ad-data-fetch?platform=google_ads&domain=example.com&fromDate=2024-01-01&toDate=2024-01-31
 *
 * Fetches clicks, spend, and impressions from the connected ad platform.
 * Returns: { clicks, spend, currency, impressions }
 *
 * Required headers: Authorization: Bearer <token>, Organisation: <org_id>
 *
 * Required env vars (same as ad-oauth-start.js plus):
 *   GOOGLE_ADS_DEVELOPER_TOKEN — required for Google Ads API calls
 */

import pkg from "pg";
const { Pool } = pkg;
import { tryRefreshToken as _tryRefreshToken, fetchPlatformData } from "./_ad-platform-fetch.js";

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

const tryRefreshToken = _tryRefreshToken;

// Check ad_daily_data cache; returns aggregate if all days are present, null otherwise.
async function fromCache(db, orgId, domain, platform, fromDate, toDate) {
    try {
        const from = new Date(fromDate + "T00:00:00Z");
        const to   = new Date(toDate   + "T00:00:00Z");
        const totalDays = Math.round((to - from) / 86_400_000) + 1;

        const { rows } = await db.query(
            `SELECT COUNT(*)::int AS n, SUM(clicks)::bigint AS clicks,
                    SUM(impressions)::bigint AS impressions,
                    SUM(spend)::numeric AS spend, MAX(currency) AS currency
             FROM ad_daily_data
             WHERE organisation_id=$1 AND domain=$2 AND platform=$3
               AND date >= $4::date AND date <= $5::date`,
            [orgId, domain, platform, fromDate, toDate]
        );
        const row = rows[0];
        if (!row || Number(row.n) < totalDays) return null;
        const sessions = platform === "google_analytics" ? Number(row.clicks || 0) : undefined;
        return {
            clicks:      Number(row.clicks      || 0),
            impressions: Number(row.impressions  || 0),
            spend:       Number(row.spend        || 0),
            currency:    row.currency            || null,
            ...(sessions != null ? { sessions } : {}),
            fromCache: true,
        };
    } catch { return null; }
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
        return res.status(400).json({ error: "platform, domain, fromDate, and toDate are all required" });
    }

    const db = getPool();
    const result = await db.query(
        `SELECT * FROM ad_platform_connections WHERE organisation_id=$1 AND domain=$2 AND platform=$3`,
        [orgId, domain, platform]
    );
    if (result.rows.length === 0) {
        return res.status(404).json({ error: "No connection found for this platform and domain. Connect first." });
    }

    let conn = result.rows[0];

    // Serve from cache if all days in range are pre-synced by the cron
    const cached = await fromCache(db, orgId, domain, platform, fromDate, toDate);
    if (cached) return res.status(200).json(cached);

    conn = await tryRefreshToken(db, conn);

    try {
        const data = await fetchPlatformData(conn, fromDate, toDate);
        return res.status(200).json(data);
    } catch (err) {
        console.error(`[ad-data-fetch] ${platform}:`, err.message);
        return res.status(502).json({ error: err.message });
    }
}
