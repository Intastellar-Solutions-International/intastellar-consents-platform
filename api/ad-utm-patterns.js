/**
 * GET /api/ad-utm-patterns?domain=example.com&platform=google_ads
 *
 * Discovers the literal utm_source values actually configured in a connected
 * Google Ads account's campaign tracking templates / final URL suffixes /
 * custom parameters — used to extend (never replace) the hardcoded
 * PLATFORM_SOURCE_PATTERNS guess-list in the Ad Reconciliation UI, since not
 * every account tags utm_source as "google"/"adwords"/"gads".
 *
 * No caching — campaign tracking templates change rarely, and this follows
 * the same live-per-load convention as api/ad-data-fetch.js for on-demand
 * platform data (no new DB column/table needed).
 *
 * Required headers: Authorization: Bearer <token>, Organisation: <org_id>
 *
 * Required env vars (same as ad-oauth-start.js plus):
 *   GOOGLE_ADS_DEVELOPER_TOKEN — required for Google Ads API calls
 */

import pkg from "pg";
const { Pool } = pkg;
import { tryRefreshToken, fetchGoogleAdsUtmSources } from "./_ad-platform-fetch.js";

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
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Organisation,Content-Type");
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || req.headers.organization || "0", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const { platform, domain } = req.query;
    if (!domain) return res.status(400).json({ error: "domain is required" });
    if (platform && platform !== "google_ads") {
        return res.status(200).json({ utmSources: [] });
    }

    const db = getPool();
    const { rows } = await db.query(
        `SELECT * FROM ad_platform_connections
         WHERE organisation_id=$1 AND domain=$2 AND platform='google_ads'
           AND account_id IS NOT NULL AND access_token IS NOT NULL`,
        [orgId, domain]
    );
    if (rows.length === 0) {
        return res.status(200).json({ utmSources: [] });
    }

    let conn = rows[0];
    conn = await tryRefreshToken(db, conn);

    try {
        const utmSources = await fetchGoogleAdsUtmSources(conn);
        return res.status(200).json({ utmSources });
    } catch (err) {
        console.error("[ad-utm-patterns] google_ads:", err.message);
        return res.status(502).json({ error: err.message });
    }
}
