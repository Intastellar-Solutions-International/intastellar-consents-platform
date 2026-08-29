/**
 * GET /api/ad-campaign-report?domain=example.com&fromDate=2024-01-01&toDate=2024-01-31
 *
 * Real per-campaign ad performance (campaign name, clicks, impressions, spend)
 * for a single domain's connected ad accounts — a more trustworthy source than
 * matching utm_campaign strings from consent/analytics rows, since it comes
 * straight from the platform rather than depending on consistent UTM tagging.
 *
 * Fetched live (not from the ad_daily_data cache, which only stores
 * account-wide daily totals, not a campaign dimension) — one call per
 * connected account, same trade-off ad-daily-data.js already makes for GA4's
 * platform/channel breakdowns.
 *
 * google_ads, meta_ads, and microsoft_ads are implemented today (see
 * fetchGoogleAdsCampaigns, fetchMetaAdsCampaigns, and
 * fetchMicrosoftAdsCampaigns in _ad-platform-fetch.js — the Microsoft Ads
 * one is unverified against a live account, see its own doc comment). Other
 * connected platforms are reported back with `supported: false` so the UI
 * can say "not available yet" instead of silently omitting them.
 *
 * Required headers: Authorization: Bearer <token>, Organisation: <org_id>
 * Required env vars: POSTGRES_URL, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 *                     META_ADS_CLIENT_ID, META_ADS_CLIENT_SECRET, MICROSOFT_ADS_CLIENT_ID,
 *                     MICROSOFT_ADS_CLIENT_SECRET, MICROSOFT_ADS_DEVELOPER_TOKEN
 */

import { tryRefreshToken, fetchGoogleAdsCampaigns, fetchMetaAdsCampaigns, fetchMicrosoftAdsCampaigns } from "./_ad-platform-fetch.js";
import { getPool } from "./_db.js";
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

function safeDate(str, fallback) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? fallback : d.toISOString().slice(0, 10);
}

// Platforms with a real per-campaign fetch implemented.
const CAMPAIGN_FETCHERS = {
    google_ads: fetchGoogleAdsCampaigns,
    meta_ads: fetchMetaAdsCampaigns,
    microsoft_ads: fetchMicrosoftAdsCampaigns,
};

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || req.headers.organization || "0", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const domain = String(req.query.domain || "").trim().toLowerCase();
    if (!domain) return res.status(400).json({ error: "domain is required" });

    const today = new Date().toISOString().slice(0, 10);
    const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const fromDate = safeDate(req.query.fromDate, thirtyAgo);
    const toDate   = safeDate(req.query.toDate,   today);

    const db = getPool();

    const { rows: connRows } = await db.query(
        `SELECT * FROM ad_platform_connections
         WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2)
           AND account_id IS NOT NULL AND access_token IS NOT NULL
           AND platform != 'google_analytics'`,
        [orgId, domain]
    );

    if (!connRows.length) {
        return res.status(200).json({ noConnections: true, platforms: [] });
    }

    const platforms = await Promise.all(connRows.map(async (conn) => {
        const fetcher = CAMPAIGN_FETCHERS[conn.platform];
        if (!fetcher) {
            return { platform: conn.platform, supported: false, campaigns: [], error: null };
        }
        try {
            const refreshed = await tryRefreshToken(db, conn);
            const campaigns = await fetcher(refreshed, fromDate, toDate);
            return { platform: conn.platform, supported: true, campaigns, error: null };
        } catch (e) {
            return { platform: conn.platform, supported: true, campaigns: [], error: e.message || "Fetch failed" };
        }
    }));

    return res.status(200).json({
        noConnections: false,
        domain,
        from: fromDate,
        to: toDate,
        platforms,
    });
}
